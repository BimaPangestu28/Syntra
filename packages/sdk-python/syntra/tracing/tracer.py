"""Tracer for Syntra SDK."""

from __future__ import annotations

import asyncio
import random
from typing import TYPE_CHECKING, Any

from syntra.tracing.context import (
    TRACE_FLAG_SAMPLED,
    SpanContext,
    get_current_context,
    reset_current_context,
    set_current_context,
)
from syntra.tracing.span import NoopSpan, Span, SpanImpl
from syntra.types import SpanKind

if TYPE_CHECKING:
    from syntra.transport.base import BaseTransport

# Global tracer instance
_tracer: Tracer | None = None


class Tracer:
    """Tracer manages span creation and context propagation."""

    def __init__(
        self,
        service_id: str,
        deployment_id: str,
        sample_rate: float,
        transport: BaseTransport,
        debug: bool = False,
    ) -> None:
        self.service_id = service_id
        self.deployment_id = deployment_id
        self.sample_rate = sample_rate
        self.transport = transport
        self.debug = debug

        self._active_spans: dict[str, SpanImpl] = {}
        self._finished_spans: list[dict[str, Any]] = []
        self._flush_task: asyncio.Task[None] | None = None

    def start_span(
        self,
        name: str,
        op: str | None = None,
        kind: SpanKind = SpanKind.INTERNAL,
        attributes: dict[str, str | int | float | bool] | None = None,
        parent_span: Span | None = None,
    ) -> Span:
        """Start a new span."""
        # Sampling decision
        if not self._should_sample():
            return NoopSpan()

        # Get parent context
        parent_context: SpanContext | None = None
        if parent_span:
            parent_context = parent_span.span_context()
        else:
            parent_context = get_current_context()

        # Create span
        span = SpanImpl(
            name=name,
            kind=kind,
            trace_id=parent_context.trace_id if parent_context else None,
            parent_span_id=parent_context.span_id if parent_context else None,
            attributes=attributes,
        )

        # Add operation attribute if provided
        if op:
            span.set_attribute("syntra.op", op)

        # Track active span
        self._active_spans[span.span_id] = span

        # Set as current context
        set_current_context(span.span_context())

        return span

    def get_active_span(self) -> Span | None:
        """Get the currently active span."""
        context = get_current_context()
        if not context:
            return None
        return self._active_spans.get(context.span_id)

    def on_span_end(self, span: SpanImpl) -> None:
        """Called when a span ends."""
        # Remove from active spans
        self._active_spans.pop(span.span_id, None)

        # Restore parent context
        if span.parent_span_id:
            parent_span = self._active_spans.get(span.parent_span_id)
            if parent_span:
                set_current_context(parent_span.span_context())
            else:
                set_current_context(None)
        else:
            set_current_context(None)

        # Add to finished queue
        telemetry_span = span.to_telemetry_span(self.service_id, self.deployment_id)
        self._finished_spans.append(telemetry_span.to_dict())

        # Auto-flush if queue is large
        if len(self._finished_spans) >= 100:
            asyncio.create_task(self._flush_spans())

    async def flush(self) -> None:
        """Flush all finished spans."""
        await self._flush_spans()

    async def _flush_spans(self) -> None:
        """Flush span queue."""
        if not self._finished_spans:
            return

        spans = self._finished_spans[:]
        self._finished_spans = []

        try:
            await self.transport.send_spans(spans)
        except Exception as e:
            if self.debug:
                print(f"[Syntra] Failed to send spans: {e}")

    async def close(self) -> None:
        """Close the tracer."""
        await self.flush()
        self._active_spans.clear()

    def _should_sample(self) -> bool:
        """Check if this span should be sampled."""
        if self.sample_rate >= 1:
            return True
        if self.sample_rate <= 0:
            return False

        # If there's a parent context with sampled flag, follow it
        context = get_current_context()
        if context and (context.trace_flags & TRACE_FLAG_SAMPLED) != 0:
            return True

        return random.random() < self.sample_rate


def set_tracer(tracer: Tracer | None) -> None:
    """Set the global tracer instance."""
    global _tracer
    _tracer = tracer


def get_tracer() -> Tracer | None:
    """Get the global tracer instance."""
    return _tracer


def start_span(
    name: str,
    op: str | None = None,
    kind: SpanKind = SpanKind.INTERNAL,
    attributes: dict[str, str | int | float | bool] | None = None,
) -> Span:
    """Start a new span using the global tracer."""
    tracer = get_tracer()
    if not tracer:
        return NoopSpan()
    return tracer.start_span(name=name, op=op, kind=kind, attributes=attributes)


def get_active_span() -> Span | None:
    """Get the currently active span."""
    tracer = get_tracer()
    if not tracer:
        return None
    return tracer.get_active_span()
