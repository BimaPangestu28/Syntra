"""Tracing decorators for Syntra SDK."""

from __future__ import annotations

import asyncio
import functools
from typing import Any, Callable, ParamSpec, TypeVar

from syntra.tracing.tracer import get_tracer, start_span
from syntra.types import SpanKind, SpanStatusCode

P = ParamSpec("P")
T = TypeVar("T")


def trace(
    name: str | None = None,
    op: str | None = None,
    kind: SpanKind = SpanKind.INTERNAL,
    attributes: dict[str, str | int | float | bool] | None = None,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """
    Decorator to trace a function.

    Args:
        name: Span name. Defaults to function name.
        op: Operation type (e.g., "db.query", "http.request")
        kind: Span kind
        attributes: Static attributes to add to the span

    Example:
        @trace(op="db.query")
        def get_user(user_id: str):
            return db.get(user_id)

        @trace(name="process_order")
        async def process_order(order_id: str):
            ...
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        span_name = name or func.__name__

        if asyncio.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
                tracer = get_tracer()
                if not tracer:
                    return await func(*args, **kwargs)  # type: ignore

                span = start_span(
                    name=span_name,
                    op=op or "function",
                    kind=kind,
                    attributes=attributes,
                )

                try:
                    result = await func(*args, **kwargs)  # type: ignore
                    span.set_status(SpanStatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(SpanStatusCode.ERROR, str(e))
                    raise
                finally:
                    span.end()
                    tracer.on_span_end(span)  # type: ignore

            return async_wrapper  # type: ignore
        else:

            @functools.wraps(func)
            def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
                tracer = get_tracer()
                if not tracer:
                    return func(*args, **kwargs)

                span = start_span(
                    name=span_name,
                    op=op or "function",
                    kind=kind,
                    attributes=attributes,
                )

                try:
                    result = func(*args, **kwargs)
                    span.set_status(SpanStatusCode.OK)
                    return result
                except Exception as e:
                    span.set_status(SpanStatusCode.ERROR, str(e))
                    raise
                finally:
                    span.end()
                    tracer.on_span_end(span)  # type: ignore

            return sync_wrapper  # type: ignore

    return decorator
