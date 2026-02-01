"""Scope management for Syntra SDK."""

from __future__ import annotations

import contextvars
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

from syntra.types import Breadcrumb, BreadcrumbLevel, BreadcrumbType, User

T = TypeVar("T")

# Context variable for scope isolation
_current_scope: contextvars.ContextVar[Scope | None] = contextvars.ContextVar(
    "syntra_scope", default=None
)


@dataclass
class Scope:
    """
    Scope manages contextual data for events.

    Includes user info, tags, extra data, and breadcrumbs.
    """

    user: User | None = None
    tags: dict[str, str] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)
    breadcrumbs: list[Breadcrumb] = field(default_factory=list)
    fingerprint: list[str] | None = None
    _max_breadcrumbs: int = field(default=100, repr=False)

    def set_user(self, user: User | None) -> None:
        """Set user context."""
        self.user = user

    def set_tag(self, key: str, value: str) -> None:
        """Set a tag."""
        self.tags[key] = value

    def set_tags(self, tags: dict[str, str]) -> None:
        """Set multiple tags."""
        self.tags.update(tags)

    def set_extra(self, key: str, value: Any) -> None:
        """Set extra context."""
        self.extra[key] = value

    def set_extras(self, extras: dict[str, Any]) -> None:
        """Set multiple extra values."""
        self.extra.update(extras)

    def set_fingerprint(self, fingerprint: list[str]) -> None:
        """Set fingerprint for grouping."""
        self.fingerprint = fingerprint

    def add_breadcrumb(
        self,
        type: BreadcrumbType = BreadcrumbType.DEFAULT,
        category: str = "default",
        message: str | None = None,
        data: dict[str, Any] | None = None,
        level: BreadcrumbLevel = BreadcrumbLevel.INFO,
    ) -> None:
        """Add a breadcrumb (ring buffer - oldest removed when full)."""
        breadcrumb = Breadcrumb(
            type=type,
            category=category,
            message=message,
            data=data,
            level=level,
            timestamp=datetime.now(timezone.utc).isoformat() + "Z",
        )
        self.breadcrumbs.append(breadcrumb)

        # Maintain ring buffer size
        while len(self.breadcrumbs) > self._max_breadcrumbs:
            self.breadcrumbs.pop(0)

    def clear_breadcrumbs(self) -> None:
        """Clear all breadcrumbs."""
        self.breadcrumbs = []

    def clear(self) -> None:
        """Clear all scope data."""
        self.user = None
        self.tags = {}
        self.extra = {}
        self.breadcrumbs = []
        self.fingerprint = None

    def clone(self) -> Scope:
        """Clone scope for isolation."""
        return Scope(
            user=dict(self.user) if self.user else None,  # type: ignore
            tags=dict(self.tags),
            extra=dict(self.extra),
            breadcrumbs=list(self.breadcrumbs),
            fingerprint=list(self.fingerprint) if self.fingerprint else None,
            _max_breadcrumbs=self._max_breadcrumbs,
        )


class ScopeManager:
    """Manages scopes including global and isolation scopes."""

    def __init__(self, max_breadcrumbs: int = 100) -> None:
        self._global_scope = Scope(_max_breadcrumbs=max_breadcrumbs)
        self._max_breadcrumbs = max_breadcrumbs

    def get_current_scope(self) -> Scope:
        """Get the current active scope."""
        scope = _current_scope.get()
        return scope if scope is not None else self._global_scope

    def get_global_scope(self) -> Scope:
        """Get the global scope."""
        return self._global_scope


# Global scope manager instance
_scope_manager: ScopeManager | None = None


def get_scope_manager() -> ScopeManager:
    """Get the global scope manager."""
    global _scope_manager
    if _scope_manager is None:
        _scope_manager = ScopeManager()
    return _scope_manager


def set_scope_manager(manager: ScopeManager) -> None:
    """Set the global scope manager."""
    global _scope_manager
    _scope_manager = manager


def get_current_scope() -> Scope:
    """Get the current scope."""
    return get_scope_manager().get_current_scope()


def with_scope(callback: Callable[[Scope], T]) -> T:
    """
    Run a function with an isolated scope.

    Args:
        callback: Function to run with the isolated scope

    Returns:
        The return value of the callback

    Example:
        def process():
            with_scope(lambda scope: (
                scope.set_tag("operation", "process"),
                do_something()
            ))
    """
    manager = get_scope_manager()
    scope = manager.get_current_scope().clone()

    token = _current_scope.set(scope)
    try:
        return callback(scope)
    finally:
        _current_scope.reset(token)


async def with_scope_async(callback: Callable[[Scope], Any]) -> Any:
    """
    Run an async function with an isolated scope.

    Args:
        callback: Async function to run with the isolated scope

    Returns:
        The return value of the callback
    """
    manager = get_scope_manager()
    scope = manager.get_current_scope().clone()

    token = _current_scope.set(scope)
    try:
        return await callback(scope)
    finally:
        _current_scope.reset(token)
