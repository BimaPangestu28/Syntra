"""Celery integration for Syntra SDK."""

from __future__ import annotations

from typing import Any

from syntra.client import add_breadcrumb, capture_exception, get_client
from syntra.tracing import (
    create_traceparent,
    extract_trace_context,
    get_tracer,
    start_span,
)
from syntra.types import BreadcrumbLevel, BreadcrumbType, SpanKind, SpanStatusCode

try:
    from celery import Celery
    from celery.signals import (
        before_task_publish,
        task_failure,
        task_postrun,
        task_prerun,
        task_retry,
    )
except ImportError:
    raise ImportError(
        "Celery integration requires celery. Install with: pip install celery"
    )


class SyntraCeleryIntegration:
    """
    Celery integration that traces task execution.

    Usage:
        from celery import Celery
        import syntra
        from syntra.frameworks.celery import SyntraCeleryIntegration

        app = Celery("tasks")
        syntra.init(dsn="...")
        SyntraCeleryIntegration(app)
    """

    def __init__(self, app: Celery) -> None:
        self.app = app
        self._connect_signals()

    def _connect_signals(self) -> None:
        before_task_publish.connect(self._before_task_publish)
        task_prerun.connect(self._task_prerun)
        task_postrun.connect(self._task_postrun)
        task_failure.connect(self._task_failure)
        task_retry.connect(self._task_retry)

    def _before_task_publish(
        self,
        sender: str | None = None,
        headers: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Inject trace context into task headers before publishing."""
        client = get_client()
        if not client or headers is None:
            return

        tracer = get_tracer()
        if not tracer:
            return

        active_span = tracer.get_active_span()
        if active_span and active_span.is_recording():
            ctx = active_span.span_context()
            traceparent = create_traceparent(ctx)
            headers.setdefault("syntra_traceparent", traceparent)

    def _task_prerun(
        self,
        sender: Any = None,
        task_id: str | None = None,
        task: Any = None,
        **kwargs: Any,
    ) -> None:
        """Start a span when a task begins execution."""
        client = get_client()
        if not client:
            return

        # Extract trace context from task headers if available
        headers: dict[str, str] = {}
        if hasattr(task, "request") and hasattr(task.request, "get"):
            traceparent = task.request.get("syntra_traceparent")
            if traceparent:
                headers["traceparent"] = traceparent

        parent_context = extract_trace_context(headers) if headers else None

        task_name = getattr(task, "name", sender or "unknown")
        queue = (
            getattr(task.request, "delivery_info", {}).get("routing_key", "default")
            if hasattr(task, "request")
            else "default"
        )

        span = start_span(
            name=task_name,
            op="celery.task",
            kind=SpanKind.CONSUMER,
            attributes={
                "celery.task_name": task_name,
                "celery.task_id": task_id or "",
                "celery.queue": queue,
            },
        )

        # Store span on the task for later retrieval
        if task is not None:
            task._syntra_span = span

    def _task_postrun(
        self,
        sender: Any = None,
        task_id: str | None = None,
        task: Any = None,
        retval: Any = None,
        state: str | None = None,
        **kwargs: Any,
    ) -> None:
        """End span when task completes successfully."""
        span = getattr(task, "_syntra_span", None) if task else None
        if not span:
            return

        span.set_status(SpanStatusCode.OK)
        span.end()

        tracer = get_tracer()
        if tracer:
            tracer.on_span_end(span)  # type: ignore

    def _task_failure(
        self,
        sender: Any = None,
        task_id: str | None = None,
        exception: BaseException | None = None,
        traceback: Any = None,
        einfo: Any = None,
        **kwargs: Any,
    ) -> None:
        """Capture exception and set span to ERROR on task failure."""
        task = kwargs.get("task") or sender
        span = getattr(task, "_syntra_span", None) if task else None

        if span:
            span.set_status(SpanStatusCode.ERROR, str(exception) if exception else "Task failed")
            span.end()

            tracer = get_tracer()
            if tracer:
                tracer.on_span_end(span)  # type: ignore

        if exception:
            capture_exception(
                exception,  # type: ignore
                tags={"celery.task_id": task_id or ""},
            )

    def _task_retry(
        self,
        sender: Any = None,
        request: Any = None,
        reason: Any = None,
        einfo: Any = None,
        **kwargs: Any,
    ) -> None:
        """Add breadcrumb on task retry."""
        task_name = getattr(sender, "name", str(sender))
        add_breadcrumb(
            type=BreadcrumbType.DEFAULT,
            category="celery.retry",
            message=f"Task {task_name} retried: {reason}",
            data={"reason": str(reason)} if reason else {},
            level=BreadcrumbLevel.WARNING,
        )
