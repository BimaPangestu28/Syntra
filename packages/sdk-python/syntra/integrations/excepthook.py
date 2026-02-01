"""Exception hook integration for Syntra SDK."""

from __future__ import annotations

import sys
from typing import Any

from syntra.client import capture_exception

_original_excepthook: Any = None


def install_excepthook() -> None:
    """Install the Syntra exception hook."""
    global _original_excepthook

    if _original_excepthook is not None:
        # Already installed
        return

    _original_excepthook = sys.excepthook

    def syntra_excepthook(
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_tb: Any,
    ) -> None:
        """Exception hook that captures exceptions to Syntra."""
        # Capture the exception
        capture_exception(exc_value)

        # Call original hook
        if _original_excepthook:
            _original_excepthook(exc_type, exc_value, exc_tb)

    sys.excepthook = syntra_excepthook


def uninstall_excepthook() -> None:
    """Uninstall the Syntra exception hook."""
    global _original_excepthook

    if _original_excepthook is not None:
        sys.excepthook = _original_excepthook
        _original_excepthook = None
