"""Ring buffer for breadcrumbs."""

from datetime import datetime, timezone
from typing import Any

from syntra.types import Breadcrumb, BreadcrumbLevel, BreadcrumbType


class BreadcrumbBuffer:
    """
    Ring buffer for breadcrumbs.

    Automatically removes oldest entries when capacity is reached.
    """

    def __init__(self, max_size: int = 100) -> None:
        self._max_size = max(1, max_size)
        self._buffer: list[Breadcrumb] = []

    def add(
        self,
        type: BreadcrumbType = BreadcrumbType.DEFAULT,
        category: str = "default",
        message: str | None = None,
        data: dict[str, Any] | None = None,
        level: BreadcrumbLevel = BreadcrumbLevel.INFO,
    ) -> None:
        """Add a breadcrumb to the buffer."""
        breadcrumb = Breadcrumb(
            type=type,
            category=category,
            message=message,
            data=data,
            level=level,
            timestamp=datetime.now(timezone.utc).isoformat() + "Z",
        )
        self._buffer.append(breadcrumb)

        # Remove oldest if over capacity
        while len(self._buffer) > self._max_size:
            self._buffer.pop(0)

    def get_all(self) -> list[Breadcrumb]:
        """Get all breadcrumbs (oldest first)."""
        return list(self._buffer)

    def get_last(self, n: int) -> list[Breadcrumb]:
        """Get the last N breadcrumbs."""
        return self._buffer[-n:]

    def clear(self) -> None:
        """Clear all breadcrumbs."""
        self._buffer = []

    @property
    def count(self) -> int:
        """Get current count."""
        return len(self._buffer)

    @property
    def capacity(self) -> int:
        """Get max capacity."""
        return self._max_size


def create_http_breadcrumb(
    method: str,
    url: str,
    status_code: int | None = None,
    duration_ms: float | None = None,
) -> Breadcrumb:
    """Create an HTTP breadcrumb."""
    level = BreadcrumbLevel.ERROR if status_code and status_code >= 400 else BreadcrumbLevel.INFO

    data: dict[str, Any] = {
        "method": method,
        "url": url,
    }
    if status_code is not None:
        data["status_code"] = status_code
    if duration_ms is not None:
        data["duration_ms"] = duration_ms

    return Breadcrumb(
        type=BreadcrumbType.HTTP,
        category="http",
        message=f"{method} {url}",
        data=data,
        level=level,
    )


def create_query_breadcrumb(
    query: str,
    duration_ms: float | None = None,
    rows_affected: int | None = None,
) -> Breadcrumb:
    """Create a database query breadcrumb."""
    data: dict[str, Any] = {"query": query}
    if duration_ms is not None:
        data["duration_ms"] = duration_ms
    if rows_affected is not None:
        data["rows_affected"] = rows_affected

    return Breadcrumb(
        type=BreadcrumbType.QUERY,
        category="db.query",
        message=query[:100] + "..." if len(query) > 100 else query,
        data=data,
        level=BreadcrumbLevel.INFO,
    )
