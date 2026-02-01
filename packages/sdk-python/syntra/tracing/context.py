"""Trace context management for Syntra SDK."""

from __future__ import annotations

import contextvars
import os
import re
from dataclasses import dataclass

TRACEPARENT_HEADER = "traceparent"
TRACESTATE_HEADER = "tracestate"

TRACE_FLAG_NONE = 0x00
TRACE_FLAG_SAMPLED = 0x01


@dataclass
class SpanContext:
    """Span context for trace propagation."""

    trace_id: str
    span_id: str
    trace_flags: int = TRACE_FLAG_SAMPLED
    trace_state: str | None = None


# Context variable for current span context
_current_context: contextvars.ContextVar[SpanContext | None] = contextvars.ContextVar(
    "syntra_span_context", default=None
)


def generate_trace_id() -> str:
    """Generate a random trace ID (32 hex characters = 16 bytes)."""
    return os.urandom(16).hex()


def generate_span_id() -> str:
    """Generate a random span ID (16 hex characters = 8 bytes)."""
    return os.urandom(8).hex()


def parse_traceparent(header: str) -> SpanContext | None:
    """
    Parse a W3C traceparent header.

    Format: version-traceId-spanId-traceFlags
    Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
    """
    if not header:
        return None

    parts = header.strip().split("-")
    if len(parts) != 4:
        return None

    version, trace_id, span_id, flags_hex = parts

    # Only support version 00
    if version != "00":
        return None

    # Validate trace ID (32 hex chars, not all zeros)
    if not re.match(r"^[0-9a-f]{32}$", trace_id, re.IGNORECASE):
        return None
    if trace_id == "0" * 32:
        return None

    # Validate span ID (16 hex chars, not all zeros)
    if not re.match(r"^[0-9a-f]{16}$", span_id, re.IGNORECASE):
        return None
    if span_id == "0" * 16:
        return None

    # Parse trace flags
    try:
        trace_flags = int(flags_hex, 16)
    except ValueError:
        return None

    return SpanContext(
        trace_id=trace_id.lower(),
        span_id=span_id.lower(),
        trace_flags=trace_flags,
    )


def create_traceparent(context: SpanContext) -> str:
    """Create a W3C traceparent header from span context."""
    version = "00"
    flags = f"{context.trace_flags:02x}"
    return f"{version}-{context.trace_id}-{context.span_id}-{flags}"


def parse_tracestate(header: str) -> dict[str, str]:
    """Parse a W3C tracestate header."""
    state: dict[str, str] = {}
    if not header:
        return state

    pairs = header.split(",")
    for pair in pairs:
        trimmed = pair.strip()
        if "=" in trimmed:
            key, value = trimmed.split("=", 1)
            state[key] = value

    return state


def create_tracestate(state: dict[str, str]) -> str:
    """Create a W3C tracestate header from dict."""
    return ",".join(f"{k}={v}" for k, v in state.items())


def get_current_context() -> SpanContext | None:
    """Get current span context."""
    return _current_context.get()


def set_current_context(context: SpanContext | None) -> contextvars.Token[SpanContext | None]:
    """Set current span context. Returns token for reset."""
    return _current_context.set(context)


def reset_current_context(token: contextvars.Token[SpanContext | None]) -> None:
    """Reset current span context using token."""
    _current_context.reset(token)


def inject_trace_context(headers: dict[str, str], context: SpanContext | None = None) -> None:
    """Inject trace context into headers dict."""
    ctx = context or get_current_context()
    if not ctx:
        return

    headers[TRACEPARENT_HEADER] = create_traceparent(ctx)

    if ctx.trace_state:
        headers[TRACESTATE_HEADER] = ctx.trace_state


def extract_trace_context(headers: dict[str, str | None]) -> SpanContext | None:
    """Extract trace context from headers dict."""
    traceparent = headers.get(TRACEPARENT_HEADER) or headers.get("Traceparent")
    if not traceparent:
        return None

    context = parse_traceparent(traceparent)
    if not context:
        return None

    tracestate = headers.get(TRACESTATE_HEADER) or headers.get("Tracestate")
    if tracestate:
        context.trace_state = tracestate

    return context
