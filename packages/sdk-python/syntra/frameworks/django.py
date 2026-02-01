"""Django integration for Syntra SDK."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

from syntra.client import add_breadcrumb, capture_exception, get_client
from syntra.tracing import extract_trace_context, get_tracer, inject_trace_context, start_span
from syntra.types import BreadcrumbLevel, BreadcrumbType, SpanKind, SpanStatusCode

if TYPE_CHECKING:
    from django.http import HttpRequest, HttpResponse


class SyntraMiddleware:
    """
    Syntra middleware for Django.

    Add to MIDDLEWARE in settings.py:
        MIDDLEWARE = [
            'syntra.frameworks.django.SyntraMiddleware',
            # ... other middleware
        ]
    """

    def __init__(self, get_response: Callable[[Any], Any]) -> None:
        self.get_response = get_response
        self.exclude_paths = ["/health", "/healthz", "/ready", "/favicon.ico", "/static", "/media"]

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """Process the request."""
        client = get_client()
        if not client:
            return self.get_response(request)

        path = request.path

        # Check if path should be excluded
        for excluded in self.exclude_paths:
            if path == excluded or path.startswith(excluded):
                return self.get_response(request)

        # Extract trace context from headers
        headers = {k.lower(): v for k, v in request.META.items() if k.startswith("HTTP_")}
        # Convert HTTP_TRACEPARENT to traceparent
        trace_headers = {}
        if "HTTP_TRACEPARENT" in request.META:
            trace_headers["traceparent"] = request.META["HTTP_TRACEPARENT"]
        if "HTTP_TRACESTATE" in request.META:
            trace_headers["tracestate"] = request.META["HTTP_TRACESTATE"]

        parent_context = extract_trace_context(trace_headers)

        # Get route name
        route = self._get_route(request)

        # Start request span
        span = start_span(
            name=f"{request.method} {route or path}",
            op="http.server",
            kind=SpanKind.SERVER,
            attributes={
                "http.method": request.method,
                "http.url": request.build_absolute_uri(),
                "http.route": route or path,
                "http.host": request.get_host(),
            },
        )

        # Store span on request for later access
        request.syntra_span = span  # type: ignore

        # Add breadcrumb
        add_breadcrumb(
            type=BreadcrumbType.HTTP,
            category="request",
            message=f"{request.method} {path}",
            data={
                "method": request.method,
                "url": request.build_absolute_uri(),
            },
            level=BreadcrumbLevel.INFO,
        )

        try:
            response = self.get_response(request)

            # Set response attributes
            span.set_attribute("http.status_code", response.status_code)
            span.set_status(
                SpanStatusCode.ERROR if response.status_code >= 400 else SpanStatusCode.OK
            )

            # Inject trace context into response headers
            response_headers: dict[str, str] = {}
            inject_trace_context(response_headers, span.span_context())
            for key, value in response_headers.items():
                response[key] = value

            return response

        except Exception as error:
            span.set_status(SpanStatusCode.ERROR, str(error))
            raise

        finally:
            span.end()
            tracer = get_tracer()
            if tracer:
                tracer.on_span_end(span)  # type: ignore

    def process_exception(self, request: HttpRequest, exception: Exception) -> None:
        """Process exceptions."""
        capture_exception(
            exception,
            tags={"route": self._get_route(request) or request.path},
            extra={
                "request.method": request.method,
                "request.url": request.build_absolute_uri(),
            },
        )

    def _get_route(self, request: HttpRequest) -> str | None:
        """Get the route pattern from the request."""
        try:
            if hasattr(request, "resolver_match") and request.resolver_match:
                return request.resolver_match.route
        except Exception:
            pass
        return None


def capture_django_exception(request: HttpRequest, exception: Exception) -> None:
    """
    Utility function to capture Django exceptions.

    Can be used in custom exception handlers.
    """
    capture_exception(
        exception,
        tags={"route": request.path},
        extra={
            "request.method": request.method,
            "request.url": request.build_absolute_uri(),
        },
    )
