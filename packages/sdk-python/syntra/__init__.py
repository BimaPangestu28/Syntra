"""
Syntra SDK for Python

Error tracking, tracing, and observability for your Python applications.

Usage:
    import syntra

    # Initialize with your DSN
    syntra.init(dsn="syn://pk_abc123@syntra.io/proj_xyz")

    # Capture exceptions
    try:
        risky_operation()
    except Exception as e:
        syntra.capture_exception(e)

    # Capture messages
    syntra.capture_message("User logged in", level="info")

    # Set user context
    syntra.set_user({"id": "user-123", "email": "user@example.com"})

    # Tracing
    with syntra.start_span(name="process_order", op="function") as span:
        span.set_attribute("order_id", "123")
        # ... do work
"""

from syntra.client import (
    init,
    capture_exception,
    capture_message,
    set_user,
    set_tag,
    set_extra,
    add_breadcrumb,
    flush,
    close,
    get_client,
)
from syntra.scope import Scope, with_scope
from syntra.tracing import start_span, trace, get_active_span
from syntra.types import (
    SyntraOptions,
    User,
    Breadcrumb,
    BreadcrumbType,
    BreadcrumbLevel,
    SpanStatus,
    SpanKind,
    LogLevel,
)

__version__ = "0.1.0"
__all__ = [
    # Core
    "init",
    "capture_exception",
    "capture_message",
    "set_user",
    "set_tag",
    "set_extra",
    "add_breadcrumb",
    "flush",
    "close",
    "get_client",
    # Scope
    "Scope",
    "with_scope",
    # Tracing
    "start_span",
    "trace",
    "get_active_span",
    # Types
    "SyntraOptions",
    "User",
    "Breadcrumb",
    "BreadcrumbType",
    "BreadcrumbLevel",
    "SpanStatus",
    "SpanKind",
    "LogLevel",
]
