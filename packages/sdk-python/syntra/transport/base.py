"""Base transport for Syntra SDK."""

from abc import ABC, abstractmethod
from typing import Any


class BaseTransport(ABC):
    """Abstract base class for transports."""

    def __init__(
        self,
        url: str,
        public_key: str,
        project_id: str,
        timeout: float = 30.0,
        max_batch_size: int = 100,
        max_retries: int = 3,
        debug: bool = False,
    ) -> None:
        self.url = url
        self.public_key = public_key
        self.project_id = project_id
        self.timeout = timeout
        self.max_batch_size = max_batch_size
        self.max_retries = max_retries
        self.debug = debug

        self._error_queue: list[dict[str, Any]] = []
        self._span_queue: list[dict[str, Any]] = []
        self._log_queue: list[dict[str, Any]] = []

    @abstractmethod
    async def send_payload(
        self, payload_type: str, payload: list[dict[str, Any]]
    ) -> None:
        """Send payload to the backend. Must be implemented by subclasses."""
        pass

    async def send_error(self, error: dict[str, Any]) -> None:
        """Queue an error event for sending."""
        self._error_queue.append(error)
        if len(self._error_queue) >= self.max_batch_size:
            await self._flush_errors()

    async def send_spans(self, spans: list[dict[str, Any]]) -> None:
        """Queue spans for sending."""
        self._span_queue.extend(spans)
        if len(self._span_queue) >= self.max_batch_size:
            await self._flush_spans()

    async def send_logs(self, logs: list[dict[str, Any]]) -> None:
        """Queue logs for sending."""
        self._log_queue.extend(logs)
        if len(self._log_queue) >= self.max_batch_size:
            await self._flush_logs()

    async def flush(self, timeout: float | None = None) -> None:
        """Flush all pending data."""
        await self._flush_errors()
        await self._flush_spans()
        await self._flush_logs()

    async def _flush_errors(self) -> None:
        """Flush error queue."""
        if not self._error_queue:
            return
        errors = self._error_queue[: self.max_batch_size]
        self._error_queue = self._error_queue[self.max_batch_size :]
        await self._send_with_retry("errors", errors)

    async def _flush_spans(self) -> None:
        """Flush span queue."""
        if not self._span_queue:
            return
        spans = self._span_queue[: self.max_batch_size]
        self._span_queue = self._span_queue[self.max_batch_size :]
        await self._send_with_retry("spans", spans)

    async def _flush_logs(self) -> None:
        """Flush log queue."""
        if not self._log_queue:
            return
        logs = self._log_queue[: self.max_batch_size]
        self._log_queue = self._log_queue[self.max_batch_size :]
        await self._send_with_retry("logs", logs)

    async def _send_with_retry(
        self, payload_type: str, payload: list[dict[str, Any]]
    ) -> None:
        """Send with exponential backoff retry."""
        import asyncio

        last_error: Exception | None = None

        for attempt in range(self.max_retries):
            try:
                await self.send_payload(payload_type, payload)
                return
            except Exception as e:
                last_error = e
                if self.debug:
                    print(f"[Syntra] Send attempt {attempt + 1} failed: {e}")

                if attempt < self.max_retries - 1:
                    delay = min(1.0 * (2**attempt), 10.0)
                    await asyncio.sleep(delay)

        if self.debug and last_error:
            print(f"[Syntra] All send attempts failed: {last_error}")
