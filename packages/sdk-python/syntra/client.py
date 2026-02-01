"""Main Syntra client for Python SDK."""

from __future__ import annotations

import asyncio
import platform
import random
import sys
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from syntra.config import parse_dsn
from syntra.scope import ScopeManager, get_current_scope, set_scope_manager
from syntra.tracing.tracer import Tracer, set_tracer
from syntra.transport.http import create_http_transport
from syntra.transport.otlp import create_otlp_transport
from syntra.types import (
    Breadcrumb,
    BreadcrumbLevel,
    BreadcrumbType,
    ErrorContext,
    LogLevel,
    StackFrame,
    SyntraOptions,
    TelemetryError,
    User,
)

# Global client instance
_client: SyntraClient | None = None


class SyntraClient:
    """Main Syntra client implementation."""

    def __init__(self, options: SyntraOptions) -> None:
        self.options = options
        self._dsn = parse_dsn(options.dsn)

        # Create scope manager
        self._scope_manager = ScopeManager(max_breadcrumbs=options.max_breadcrumbs)
        set_scope_manager(self._scope_manager)

        # Create transport
        if options.transport == "otlp" and options.otlp_endpoint:
            self._transport = create_otlp_transport(
                endpoint=options.otlp_endpoint,
                project_id=self._dsn.project_id,
                service_name=options.service_id or self._dsn.project_id,
                service_version=options.release,
            )
        else:
            self._transport = create_http_transport(
                host=self._dsn.host,
                public_key=self._dsn.public_key,
                project_id=self._dsn.project_id,
                debug=options.debug,
            )

        # Create tracer
        self._tracer = Tracer(
            service_id=options.service_id or self._dsn.project_id,
            deployment_id=options.deployment_id,
            sample_rate=options.traces_sample_rate,
            transport=self._transport,
            debug=options.debug,
        )
        set_tracer(self._tracer)

        self._is_initialized = False

        if options.debug:
            print(f"[Syntra] Client created for {self._dsn.host}/{self._dsn.project_id}")

    def init(self) -> None:
        """Initialize integrations."""
        if self._is_initialized:
            return

        # Install exception hook
        self._install_excepthook()

        self._is_initialized = True

        if self.options.debug:
            print("[Syntra] Client initialized")

    def _install_excepthook(self) -> None:
        """Install global exception hook."""
        original_excepthook = sys.excepthook

        def syntra_excepthook(
            exc_type: type[BaseException],
            exc_value: BaseException,
            exc_tb: Any,
        ) -> None:
            self.capture_exception(exc_value)
            original_excepthook(exc_type, exc_value, exc_tb)

        sys.excepthook = syntra_excepthook

    def capture_exception(
        self,
        error: BaseException,
        tags: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str:
        """Capture an exception."""
        # Sampling check
        if not self._should_sample(self.options.errors_sample_rate):
            return ""

        scope = get_current_scope()

        # Parse stack trace
        stack_frames = self._parse_stack_trace(error)

        # Generate fingerprint
        fingerprint = scope.fingerprint or self._generate_fingerprint(
            type(error).__name__, str(error), stack_frames
        )

        # Build error event
        event = TelemetryError(
            id=str(uuid.uuid4()),
            service_id=self.options.service_id or self._dsn.project_id,
            deployment_id=self.options.deployment_id,
            timestamp=datetime.now(timezone.utc).isoformat() + "Z",
            type=type(error).__name__,
            message=str(error),
            stack_trace=stack_frames,
            breadcrumbs=list(scope.breadcrumbs),
            context=ErrorContext(
                environment=self.options.environment,
                release=self.options.release,
                user=scope.user,
                tags={**scope.tags, **(tags or {})},
                extra={**scope.extra, **(extra or {})},
                runtime={
                    "name": "python",
                    "version": platform.python_version(),
                },
                os={
                    "name": platform.system(),
                    "version": platform.release(),
                },
            ),
            fingerprint=fingerprint,
        )

        # Apply before_send hook
        if self.options.before_send:
            processed = self.options.before_send(event)
            if not processed:
                if self.options.debug:
                    print("[Syntra] Event dropped by before_send")
                return ""
            event = processed

        # Send event
        asyncio.create_task(self._send_error(event))

        if self.options.debug:
            print(f"[Syntra] Captured exception: {event.id}")

        return event.id

    async def _send_error(self, event: TelemetryError) -> None:
        """Send error to transport."""
        try:
            await self._transport.send_error(event.to_dict())
        except Exception as e:
            if self.options.debug:
                print(f"[Syntra] Failed to send error: {e}")

    def capture_message(
        self,
        message: str,
        level: LogLevel | str = LogLevel.INFO,
    ) -> str:
        """Capture a message."""
        if not self._should_sample(self.options.errors_sample_rate):
            return ""

        scope = get_current_scope()

        level_str = level.value if isinstance(level, LogLevel) else level

        event = TelemetryError(
            id=str(uuid.uuid4()),
            service_id=self.options.service_id or self._dsn.project_id,
            deployment_id=self.options.deployment_id,
            timestamp=datetime.now(timezone.utc).isoformat() + "Z",
            type="Message",
            message=message,
            stack_trace=[],
            breadcrumbs=list(scope.breadcrumbs),
            context=ErrorContext(
                environment=self.options.environment,
                release=self.options.release,
                user=scope.user,
                tags={**scope.tags, "level": level_str},
                extra=scope.extra,
            ),
            fingerprint=[level_str, message],
        )

        if self.options.before_send:
            processed = self.options.before_send(event)
            if not processed:
                return ""
            event = processed

        asyncio.create_task(self._send_error(event))

        if self.options.debug:
            print(f"[Syntra] Captured message: {event.id}")

        return event.id

    def add_breadcrumb(
        self,
        type: BreadcrumbType = BreadcrumbType.DEFAULT,
        category: str = "default",
        message: str | None = None,
        data: dict[str, Any] | None = None,
        level: BreadcrumbLevel = BreadcrumbLevel.INFO,
    ) -> None:
        """Add a breadcrumb."""
        scope = get_current_scope()
        scope.add_breadcrumb(
            type=type,
            category=category,
            message=message,
            data=data,
            level=level,
        )

    def set_user(self, user: User | None) -> None:
        """Set user context."""
        scope = get_current_scope()
        scope.set_user(user)

        if self.options.debug:
            print(f"[Syntra] User set: {user.get('id') if user else 'None'}")

    def set_tag(self, key: str, value: str) -> None:
        """Set a tag."""
        scope = get_current_scope()
        scope.set_tag(key, value)

    def set_extra(self, key: str, value: Any) -> None:
        """Set extra context."""
        scope = get_current_scope()
        scope.set_extra(key, value)

    async def flush(self, timeout: float | None = None) -> None:
        """Flush pending data."""
        await self._transport.flush(timeout)
        await self._tracer.flush()

        if self.options.debug:
            print("[Syntra] Flushed")

    async def close(self) -> None:
        """Close the client."""
        await self.flush()
        await self._tracer.close()
        await self._transport.close()

        set_tracer(None)

        self._is_initialized = False

        if self.options.debug:
            print("[Syntra] Client closed")

    def _parse_stack_trace(self, error: BaseException) -> list[StackFrame]:
        """Parse exception stack trace."""
        frames: list[StackFrame] = []

        tb = error.__traceback__
        while tb is not None:
            frame = tb.tb_frame
            lineno = tb.tb_lineno
            filename = frame.f_code.co_filename
            function = frame.f_code.co_name

            frames.append(
                StackFrame(
                    filename=filename,
                    function=function,
                    lineno=lineno,
                    in_app=self._is_in_app(filename),
                    module=frame.f_globals.get("__name__"),
                )
            )

            tb = tb.tb_next

        # Reverse to get most recent first
        return list(reversed(frames))

    def _is_in_app(self, filename: str) -> bool:
        """Check if a frame is from application code."""
        if not filename:
            return False

        # Standard library and site-packages
        exclude_patterns = [
            "site-packages",
            "dist-packages",
            "/lib/python",
            "\\lib\\python",
            "<frozen",
            "<string>",
        ]

        for pattern in exclude_patterns:
            if pattern in filename:
                return False

        return True

    def _generate_fingerprint(
        self,
        error_type: str,
        message: str,
        stack_frames: list[StackFrame],
    ) -> list[str]:
        """Generate fingerprint for error grouping."""
        fingerprint = [error_type]

        # Normalize message
        import re

        normalized = re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "<uuid>",
            message,
            flags=re.IGNORECASE,
        )
        normalized = re.sub(r"\b\d+\b", "<n>", normalized)
        fingerprint.append(normalized)

        # Add top in-app frames
        in_app_frames = [f for f in stack_frames if f.in_app][:3]
        for frame in in_app_frames:
            fingerprint.append(f"{frame.filename}:{frame.function}:{frame.lineno}")

        return fingerprint

    def _should_sample(self, rate: float) -> bool:
        """Check if an event should be sampled."""
        if rate >= 1:
            return True
        if rate <= 0:
            return False
        return random.random() < rate


def init(
    dsn: str,
    environment: str = "production",
    release: str = "",
    service_id: str = "",
    deployment_id: str = "",
    traces_sample_rate: float = 1.0,
    errors_sample_rate: float = 1.0,
    debug: bool = False,
    max_breadcrumbs: int = 100,
    before_send: Any = None,
) -> None:
    """Initialize the Syntra SDK."""
    global _client

    if _client:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_client.close())
        except RuntimeError:
            # No running event loop, close synchronously
            _client._closed = True

    options = SyntraOptions(
        dsn=dsn,
        environment=environment,
        release=release,
        service_id=service_id,
        deployment_id=deployment_id,
        traces_sample_rate=traces_sample_rate,
        errors_sample_rate=errors_sample_rate,
        debug=debug,
        max_breadcrumbs=max_breadcrumbs,
        before_send=before_send,
    )

    _client = SyntraClient(options)
    _client.init()


def get_client() -> SyntraClient | None:
    """Get the current client."""
    return _client


def capture_exception(
    error: BaseException,
    tags: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Capture an exception."""
    if not _client:
        return ""
    return _client.capture_exception(error, tags=tags, extra=extra)


def capture_message(message: str, level: LogLevel | str = LogLevel.INFO) -> str:
    """Capture a message."""
    if not _client:
        return ""
    return _client.capture_message(message, level=level)


def add_breadcrumb(
    type: BreadcrumbType = BreadcrumbType.DEFAULT,
    category: str = "default",
    message: str | None = None,
    data: dict[str, Any] | None = None,
    level: BreadcrumbLevel = BreadcrumbLevel.INFO,
) -> None:
    """Add a breadcrumb."""
    if not _client:
        return
    _client.add_breadcrumb(type=type, category=category, message=message, data=data, level=level)


def set_user(user: User | None) -> None:
    """Set user context."""
    if not _client:
        return
    _client.set_user(user)


def set_tag(key: str, value: str) -> None:
    """Set a tag."""
    if not _client:
        return
    _client.set_tag(key, value)


def set_extra(key: str, value: Any) -> None:
    """Set extra context."""
    if not _client:
        return
    _client.set_extra(key, value)


async def flush(timeout: float | None = None) -> None:
    """Flush pending data."""
    if not _client:
        return
    await _client.flush(timeout)


async def close() -> None:
    """Close the SDK."""
    global _client
    if not _client:
        return
    client = _client
    _client = None
    await client.close()
