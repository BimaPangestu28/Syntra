"""Span implementation for Syntra SDK."""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any

from syntra.tracing.context import (
    TRACE_FLAG_SAMPLED,
    SpanContext,
    generate_span_id,
    generate_trace_id,
)
from syntra.types import SpanEvent, SpanKind, SpanStatus, SpanStatusCode, TelemetrySpan


class Span(ABC):
    """Abstract base class for spans."""

    @property
    @abstractmethod
    def trace_id(self) -> str:
        """Get trace ID."""
        pass

    @property
    @abstractmethod
    def span_id(self) -> str:
        """Get span ID."""
        pass

    @property
    @abstractmethod
    def parent_span_id(self) -> str | None:
        """Get parent span ID."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Get span name."""
        pass

    @abstractmethod
    def set_status(self, code: SpanStatusCode, message: str | None = None) -> None:
        """Set span status."""
        pass

    @abstractmethod
    def set_attribute(self, key: str, value: str | int | float | bool) -> None:
        """Set a single attribute."""
        pass

    @abstractmethod
    def set_attributes(self, attrs: dict[str, str | int | float | bool]) -> None:
        """Set multiple attributes."""
        pass

    @abstractmethod
    def add_event(
        self, name: str, attributes: dict[str, str | int | float | bool] | None = None
    ) -> None:
        """Add an event to the span."""
        pass

    @abstractmethod
    def end(self) -> None:
        """End the span."""
        pass

    @abstractmethod
    def is_recording(self) -> bool:
        """Check if span is still recording."""
        pass

    @abstractmethod
    def span_context(self) -> SpanContext:
        """Get span context for propagation."""
        pass

    def __enter__(self) -> Span:
        """Enter context manager."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit context manager."""
        if exc_type is not None:
            self.set_status(
                SpanStatusCode.ERROR,
                str(exc_val) if exc_val else "Error",
            )
        self.end()


class SpanImpl(Span):
    """Span implementation."""

    def __init__(
        self,
        name: str,
        kind: SpanKind = SpanKind.INTERNAL,
        trace_id: str | None = None,
        parent_span_id: str | None = None,
        attributes: dict[str, str | int | float | bool] | None = None,
    ) -> None:
        self._name = name
        self._kind = kind
        self._trace_id = trace_id or generate_trace_id()
        self._span_id = generate_span_id()
        self._parent_span_id = parent_span_id
        self._start_time_ns = time.time_ns()
        self._end_time_ns: int | None = None
        self._status = SpanStatus()
        self._attributes: dict[str, str | int | float | bool] = attributes or {}
        self._events: list[SpanEvent] = []
        self._recording = True

    @property
    def trace_id(self) -> str:
        return self._trace_id

    @property
    def span_id(self) -> str:
        return self._span_id

    @property
    def parent_span_id(self) -> str | None:
        return self._parent_span_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def kind(self) -> SpanKind:
        return self._kind

    @property
    def start_time_ns(self) -> int:
        return self._start_time_ns

    @property
    def duration_ns(self) -> int:
        if self._end_time_ns is None:
            return 0
        return self._end_time_ns - self._start_time_ns

    @property
    def status(self) -> SpanStatus:
        return self._status

    @property
    def attributes(self) -> dict[str, str | int | float | bool]:
        return dict(self._attributes)

    @property
    def events(self) -> list[SpanEvent]:
        return list(self._events)

    def set_status(self, code: SpanStatusCode, message: str | None = None) -> None:
        if not self._recording:
            return
        self._status = SpanStatus(code=code, message=message)

    def set_attribute(self, key: str, value: str | int | float | bool) -> None:
        if not self._recording:
            return
        self._attributes[key] = value

    def set_attributes(self, attrs: dict[str, str | int | float | bool]) -> None:
        if not self._recording:
            return
        self._attributes.update(attrs)

    def add_event(
        self, name: str, attributes: dict[str, str | int | float | bool] | None = None
    ) -> None:
        if not self._recording:
            return
        self._events.append(
            SpanEvent(
                name=name,
                timestamp_ns=time.time_ns(),
                attributes=attributes or {},
            )
        )

    def end(self) -> None:
        if not self._recording:
            return
        self._end_time_ns = time.time_ns()
        self._recording = False

    def is_recording(self) -> bool:
        return self._recording

    def span_context(self) -> SpanContext:
        return SpanContext(
            trace_id=self._trace_id,
            span_id=self._span_id,
            trace_flags=TRACE_FLAG_SAMPLED,
        )

    def to_telemetry_span(self, service_id: str, deployment_id: str) -> TelemetrySpan:
        """Convert to TelemetrySpan format for transport."""
        return TelemetrySpan(
            trace_id=self._trace_id,
            span_id=self._span_id,
            parent_span_id=self._parent_span_id,
            service_id=service_id,
            deployment_id=deployment_id,
            operation_name=self._name,
            span_kind=self._kind,
            start_time_ns=self._start_time_ns,
            duration_ns=self.duration_ns,
            status=self._status,
            attributes=self._attributes,
            events=self._events,
        )


class NoopSpan(Span):
    """No-op span for when sampling decides not to record."""

    def __init__(self, context: SpanContext | None = None) -> None:
        self._trace_id = context.trace_id if context else generate_trace_id()
        self._span_id = context.span_id if context else generate_span_id()
        self._name = "noop"

    @property
    def trace_id(self) -> str:
        return self._trace_id

    @property
    def span_id(self) -> str:
        return self._span_id

    @property
    def parent_span_id(self) -> str | None:
        return None

    @property
    def name(self) -> str:
        return self._name

    def set_status(self, code: SpanStatusCode, message: str | None = None) -> None:
        pass

    def set_attribute(self, key: str, value: str | int | float | bool) -> None:
        pass

    def set_attributes(self, attrs: dict[str, str | int | float | bool]) -> None:
        pass

    def add_event(
        self, name: str, attributes: dict[str, str | int | float | bool] | None = None
    ) -> None:
        pass

    def end(self) -> None:
        pass

    def is_recording(self) -> bool:
        return False

    def span_context(self) -> SpanContext:
        return SpanContext(
            trace_id=self._trace_id,
            span_id=self._span_id,
            trace_flags=0,
        )
