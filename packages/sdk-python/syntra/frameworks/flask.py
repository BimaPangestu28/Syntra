"""Flask integration for Syntra SDK."""

from __future__ import annotations

from typing import Any

from syntra.client import add_breadcrumb, capture_exception, get_client
from syntra.tracing import extract_trace_context, get_tracer, inject_trace_context, start_span
from syntra.types import BreadcrumbLevel, BreadcrumbType, SpanKind, SpanStatusCode

try:
    from flask import Flask, g, request
    from flask.wrappers import Response
except ImportError:
    raise ImportError("Flask integration requires flask. Install with: pip install flask")


def init_app(
    app: Flask,
    exclude_paths: list[str] | None = None,
) -> None:
    """
    Initialize Syntra integration with Flask app.

    Usage:
        from flask import Flask
        import syntra
        from syntra.frameworks.flask import init_app

        app = Flask(__name__)
        syntra.init(dsn="...")
        init_app(app)
    """
    exclude = exclude_paths or ["/health", "/healthz", "/ready", "/favicon.ico", "/static"]

    @app.before_request
    def syntra_before_request() -> None:
        """Start tracing before request."""
        client = get_client()
        if not client:
            return

        path = request.path

        # Check if path should be excluded
        for excluded in exclude:
            if path == excluded or path.startswith(excluded):
                g.syntra_span = None
                return

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
                "http.url": request.url,
                "http.route": request.endpoint or path,
                "http.host": request.host,
            },
        )

        g.syntra_span = span

        # Add breadcrumb
        add_breadcrumb(
            type=BreadcrumbType.HTTP,
            category="request",
            message=f"{request.method} {path}",
            data={
                "method": request.method,
                "url": request.url,
            },
            level=BreadcrumbLevel.INFO,
        )

    @app.after_request
    def syntra_after_request(response: Response) -> Response:
        """End tracing after request."""
        span = getattr(g, "syntra_span", None)
        if not span:
            return response

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

        span.end()

        tracer = get_tracer()
        if tracer:
            tracer.on_span_end(span)  # type: ignore

        return response

    @app.errorhandler(Exception)
    def syntra_error_handler(error: Exception) -> Any:
        """Capture exceptions."""
        span = getattr(g, "syntra_span", None)
        if span:
            span.set_status(SpanStatusCode.ERROR, str(error))

        capture_exception(
            error,
            tags={"route": request.endpoint or request.path},
            extra={
                "request.method": request.method,
                "request.url": request.url,
            },
        )

        # Re-raise to let Flask handle it
        raise error
