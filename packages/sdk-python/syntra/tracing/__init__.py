"""Tracing module for Syntra SDK."""

from syntra.tracing.context import (
    TRACEPARENT_HEADER,
    TRACESTATE_HEADER,
    create_traceparent,
    extract_trace_context,
    generate_span_id,
    generate_trace_id,
    get_current_context,
    inject_trace_context,
    parse_traceparent,
    set_current_context,
)
from syntra.tracing.decorators import trace
from syntra.tracing.span import NoopSpan, Span, SpanImpl
from syntra.tracing.tracer import Tracer, get_active_span, start_span

__all__ = [
    # Context
    "TRACEPARENT_HEADER",
    "TRACESTATE_HEADER",
    "create_traceparent",
    "extract_trace_context",
    "generate_span_id",
    "generate_trace_id",
    "get_current_context",
    "inject_trace_context",
    "parse_traceparent",
    "set_current_context",
    # Span
    "Span",
    "SpanImpl",
    "NoopSpan",
    # Tracer
    "Tracer",
    "start_span",
    "get_active_span",
    # Decorators
    "trace",
]
