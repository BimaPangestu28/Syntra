"""Type definitions for Syntra SDK."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Literal, TypedDict


class BreadcrumbType(str, Enum):
    """Types of breadcrumbs."""

    HTTP = "http"
    NAVIGATION = "navigation"
    UI = "ui"
    CONSOLE = "console"
    ERROR = "error"
    QUERY = "query"
    DEFAULT = "default"


class BreadcrumbLevel(str, Enum):
    """Breadcrumb severity levels."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    FATAL = "fatal"


class SpanKind(str, Enum):
    """Span kinds for tracing."""

    INTERNAL = "internal"
    SERVER = "server"
    CLIENT = "client"
    PRODUCER = "producer"
    CONSUMER = "consumer"


class SpanStatusCode(str, Enum):
    """Span status codes."""

    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


class LogLevel(str, Enum):
    """Log levels."""

    TRACE = "trace"
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
    FATAL = "fatal"


class User(TypedDict, total=False):
    """User context."""

    id: str
    email: str
    username: str


@dataclass
class Breadcrumb:
    """A breadcrumb representing an event that led to the current state."""

    type: BreadcrumbType
    category: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z")
    message: str | None = None
    data: dict[str, Any] | None = None
    level: BreadcrumbLevel = BreadcrumbLevel.INFO

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        result: dict[str, Any] = {
            "type": self.type.value,
            "category": self.category,
            "timestamp": self.timestamp,
            "level": self.level.value,
        }
        if self.message:
            result["message"] = self.message
        if self.data:
            result["data"] = self.data
        return result


@dataclass
class SpanStatus:
    """Span status."""

    code: SpanStatusCode = SpanStatusCode.UNSET
    message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result: dict[str, Any] = {"code": self.code.value}
        if self.message:
            result["message"] = self.message
        return result


@dataclass
class StackFrame:
    """A single stack frame."""

    filename: str
    function: str
    lineno: int
    colno: int | None = None
    context_line: str | None = None
    pre_context: list[str] | None = None
    post_context: list[str] | None = None
    in_app: bool = True
    module: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result: dict[str, Any] = {
            "filename": self.filename,
            "function": self.function,
            "lineno": self.lineno,
            "in_app": self.in_app,
        }
        if self.colno is not None:
            result["colno"] = self.colno
        if self.context_line:
            result["context_line"] = self.context_line
        if self.pre_context:
            result["pre_context"] = self.pre_context
        if self.post_context:
            result["post_context"] = self.post_context
        if self.module:
            result["module"] = self.module
        return result


@dataclass
class SpanEvent:
    """An event within a span."""

    name: str
    timestamp_ns: int
    attributes: dict[str, str | int | float | bool] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "timestamp_ns": self.timestamp_ns,
            "attributes": self.attributes,
        }


@dataclass
class ErrorContext:
    """Context information for an error."""

    environment: str
    release: str
    user: User | None = None
    tags: dict[str, str] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)
    request: dict[str, Any] | None = None
    os: dict[str, str] | None = None
    runtime: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result: dict[str, Any] = {
            "environment": self.environment,
            "release": self.release,
            "tags": self.tags,
            "extra": self.extra,
        }
        if self.user:
            result["user"] = dict(self.user)
        if self.request:
            result["request"] = self.request
        if self.os:
            result["os"] = self.os
        if self.runtime:
            result["runtime"] = self.runtime
        return result


@dataclass
class TelemetryError:
    """An error event to be sent to Syntra."""

    id: str
    service_id: str
    deployment_id: str
    timestamp: str
    type: str
    message: str
    stack_trace: list[StackFrame]
    breadcrumbs: list[Breadcrumb]
    context: ErrorContext
    fingerprint: list[str]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "service_id": self.service_id,
            "deployment_id": self.deployment_id,
            "timestamp": self.timestamp,
            "type": self.type,
            "message": self.message,
            "stack_trace": [f.to_dict() for f in self.stack_trace],
            "breadcrumbs": [b.to_dict() for b in self.breadcrumbs],
            "context": self.context.to_dict(),
            "fingerprint": self.fingerprint,
        }


@dataclass
class TelemetrySpan:
    """A span for distributed tracing."""

    trace_id: str
    span_id: str
    service_id: str
    deployment_id: str
    operation_name: str
    span_kind: SpanKind
    start_time_ns: int
    duration_ns: int
    status: SpanStatus
    attributes: dict[str, str | int | float | bool]
    events: list[SpanEvent]
    parent_span_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result: dict[str, Any] = {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "service_id": self.service_id,
            "deployment_id": self.deployment_id,
            "operation_name": self.operation_name,
            "span_kind": self.span_kind.value,
            "start_time_ns": self.start_time_ns,
            "duration_ns": self.duration_ns,
            "status": self.status.to_dict(),
            "attributes": self.attributes,
            "events": [e.to_dict() for e in self.events],
        }
        if self.parent_span_id:
            result["parent_span_id"] = self.parent_span_id
        return result


@dataclass
class SyntraOptions:
    """Configuration options for Syntra SDK."""

    dsn: str
    environment: str = "production"
    release: str = ""
    service_id: str = ""
    deployment_id: str = ""
    traces_sample_rate: float = 1.0
    errors_sample_rate: float = 1.0
    debug: bool = False
    max_breadcrumbs: int = 100
    send_default_pii: bool = False
    transport: Literal["http", "otlp"] = "http"
    otlp_endpoint: str = ""
    before_send: Callable[[TelemetryError], TelemetryError | None] | None = None
