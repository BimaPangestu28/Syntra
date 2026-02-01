"""Logging integration for Syntra SDK."""

from __future__ import annotations

import logging
from typing import Any

from syntra.client import add_breadcrumb, capture_exception, capture_message
from syntra.types import BreadcrumbLevel, BreadcrumbType, LogLevel


class SyntraLoggingHandler(logging.Handler):
    """
    Logging handler that sends records to Syntra.

    Records at WARNING level become breadcrumbs.
    Records at ERROR/CRITICAL level with exceptions are captured as exceptions.
    Records at ERROR/CRITICAL level without exceptions are captured as messages.

    Usage:
        import logging
        import syntra
        from syntra.integrations.logging import SyntraLoggingHandler

        syntra.init(dsn="...")

        logger = logging.getLogger()
        logger.addHandler(SyntraLoggingHandler())
    """

    def __init__(
        self,
        level: int = logging.DEBUG,
        capture_errors: bool = True,
        capture_warnings: bool = True,
        add_breadcrumbs: bool = True,
    ) -> None:
        super().__init__(level=level)
        self.capture_errors = capture_errors
        self.capture_warnings = capture_warnings
        self.add_breadcrumbs = add_breadcrumbs

    def emit(self, record: logging.LogRecord) -> None:
        """Emit a record."""
        try:
            self._handle_record(record)
        except Exception:
            self.handleError(record)

    def _handle_record(self, record: logging.LogRecord) -> None:
        """Handle a logging record."""
        # Add breadcrumb
        if self.add_breadcrumbs:
            self._add_breadcrumb(record)

        # Capture errors
        if self.capture_errors and record.levelno >= logging.ERROR:
            if record.exc_info and record.exc_info[1]:
                capture_exception(
                    record.exc_info[1],
                    tags={"logger": record.name},
                    extra={
                        "logger.name": record.name,
                        "logger.level": record.levelname,
                        "logger.pathname": record.pathname,
                        "logger.lineno": record.lineno,
                    },
                )
            else:
                capture_message(
                    self.format(record),
                    level=self._map_level(record.levelno),
                )

    def _add_breadcrumb(self, record: logging.LogRecord) -> None:
        """Add a logging record as breadcrumb."""
        data: dict[str, Any] = {
            "logger": record.name,
            "level": record.levelname,
        }

        if record.pathname:
            data["pathname"] = record.pathname
        if record.lineno:
            data["lineno"] = record.lineno

        add_breadcrumb(
            type=BreadcrumbType.DEFAULT,
            category="logging",
            message=self.format(record),
            data=data,
            level=self._map_breadcrumb_level(record.levelno),
        )

    def _map_level(self, levelno: int) -> LogLevel:
        """Map logging level to Syntra LogLevel."""
        if levelno >= logging.CRITICAL:
            return LogLevel.FATAL
        if levelno >= logging.ERROR:
            return LogLevel.ERROR
        if levelno >= logging.WARNING:
            return LogLevel.WARN
        if levelno >= logging.INFO:
            return LogLevel.INFO
        if levelno >= logging.DEBUG:
            return LogLevel.DEBUG
        return LogLevel.TRACE

    def _map_breadcrumb_level(self, levelno: int) -> BreadcrumbLevel:
        """Map logging level to Syntra BreadcrumbLevel."""
        if levelno >= logging.CRITICAL:
            return BreadcrumbLevel.FATAL
        if levelno >= logging.ERROR:
            return BreadcrumbLevel.ERROR
        if levelno >= logging.WARNING:
            return BreadcrumbLevel.WARNING
        if levelno >= logging.DEBUG:
            return BreadcrumbLevel.DEBUG
        return BreadcrumbLevel.INFO
