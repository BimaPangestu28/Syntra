"""FastAPI integration for Syntra SDK."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from syntra.client import add_breadcrumb, capture_exception, get_client
from syntra.tracing import (
    SpanContext,
    extract_trace_context,
    get_tracer,
    inject_trace_context,
    start_span,
)
from syntra.types import BreadcrumbLevel, BreadcrumbType, SpanKind, SpanStatusCode

try:
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response
    from starlette.types import ASGIApp
except ImportError:
    raise ImportError(
        "FastAPI integration requires starlette. Install with: pip install starlette"
    )


class SyntraMiddleware(BaseHTTPMiddleware):
    """
    Syntra middleware for FastAPI/Starlette.

    Automatically traces requests and captures exceptions.

    Usage:
        from fastapi import FastAPI
        from syntra.frameworks.fastapi import SyntraMiddleware

        app = FastAPI()
        app.add_middleware(SyntraMiddleware)
    """

    def __init__(
        self,
        app: ASGIApp,
        exclude_paths: list[str] | None = None,
        capture_request_body: bool = False,
    ) -> None:
        super().__init__(app)
        self.exclude_paths = exclude_paths or ["/health", "/healthz", "/ready", "/favicon.ico"]
        self.capture_request_body = capture_request_body

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Dispatch the request with tracing."""
        client = get_client()
        if not client:
            return await call_next(request)

        path = request.url.path

        # Check if path should be excluded
        for excluded in self.exclude_paths:
            if path == excluded or path.startswith(excluded):
                return await call_next(request)

        # Extract trace context from headers
        headers = dict(request.headers)
        parent_context = extract_trace_context(headers)

        # Start request span
        span = start_span(
            name=f"{request.method} {path}",
            op="http.server",
            kind=SpanKind.SERVER,
            attributes={
                "http.method": request.method,
                "http.url": str(request.url),
                "http.route": path,
                "http.host": request.url.hostname or "",
                "http.scheme": request.url.scheme,
            },
        )

        # Add breadcrumb
        add_breadcrumb(
            type=BreadcrumbType.HTTP,
            category="request",
            message=f"{request.method} {path}",
            data={
                "method": request.method,
                "url": str(request.url),
            },
            level=BreadcrumbLevel.INFO,
        )

        try:
            response = await call_next(request)

            # Set response attributes
            span.set_attribute("http.status_code", response.status_code)
            span.set_status(
                SpanStatusCode.ERROR if response.status_code >= 400 else SpanStatusCode.OK
            )

            # Inject trace context into response headers
            response_headers: dict[str, str] = {}
            inject_trace_context(response_headers, span.span_context())
            for key, value in response_headers.items():
                response.headers[key] = value

            return response

        except Exception as error:
            # Capture exception
            capture_exception(
                error,
                tags={"route": path},
                extra={
                    "request.method": request.method,
                    "request.url": str(request.url),
                },
            )

            span.set_status(SpanStatusCode.ERROR, str(error))
            raise

        finally:
            span.end()
            tracer = get_tracer()
            if tracer and hasattr(span, "_recording") and not span._recording:  # type: ignore
                tracer.on_span_end(span)  # type: ignore


def syntra_exception_handler(request: Request, exc: Exception) -> None:
    """
    Exception handler for FastAPI.

    Usage:
        from fastapi import FastAPI
        from syntra.frameworks.fastapi import syntra_exception_handler

        app = FastAPI()

        @app.exception_handler(Exception)
        async def handle_exception(request, exc):
            syntra_exception_handler(request, exc)
            raise exc
    """
    capture_exception(
        exc,
        tags={"route": request.url.path},
        extra={
            "request.method": request.method,
            "request.url": str(request.url),
            "request.headers": dict(request.headers),
        },
    )
