"""E2E Integration Tests for Syntra Python SDK.

Verifies the full flow from SDK initialization through HTTP transport
to correctly formatted API payloads. Mocks at the transport send_payload
level to capture outgoing payloads after the full processing pipeline.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from dataclasses import dataclass, field
from typing import Any

import syntra.client as client_module
from syntra.client import SyntraClient, init, get_client
from syntra.types import BreadcrumbType, BreadcrumbLevel, LogLevel


@pytest.fixture(autouse=True)
def reset_global_client():
    """Reset the global client before each test to avoid stale mocks."""
    client_module._client = None
    yield
    client_module._client = None


@dataclass
class CapturedPayload:
    payload_type: str
    payload: list[dict[str, Any]]


class PayloadCapture:
    """Captures all transport send_payload calls."""

    def __init__(self) -> None:
        self.payloads: list[CapturedPayload] = []

    async def mock_send_payload(
        self, payload_type: str, payload: list[dict[str, Any]]
    ) -> None:
        self.payloads.append(CapturedPayload(payload_type=payload_type, payload=payload))

    def find(self, payload_type: str) -> CapturedPayload | None:
        for p in self.payloads:
            if p.payload_type == payload_type:
                return p
        return None

    def find_all(self, payload_type: str) -> list[CapturedPayload]:
        return [p for p in self.payloads if p.payload_type == payload_type]

    @property
    def errors(self) -> list[dict[str, Any]]:
        result = []
        for p in self.payloads:
            if p.payload_type == "errors":
                result.extend(p.payload)
        return result


def init_with_capture(capture: PayloadCapture, **kwargs: Any) -> SyntraClient:
    """Initialize SDK and patch transport to capture payloads."""
    init(**kwargs)
    client = get_client()
    assert client is not None
    # Patch the transport's send_payload to capture outgoing data
    client._transport.send_payload = capture.mock_send_payload  # type: ignore
    return client


async def capture_and_flush(client: SyntraClient, error: BaseException, **kwargs: Any) -> None:
    """Capture exception and flush, awaiting any pending tasks."""
    client.capture_exception(error, **kwargs)
    # Let the create_task fire
    await asyncio.sleep(0)
    await client.flush()


async def message_and_flush(client: SyntraClient, message: str, **kwargs: Any) -> None:
    """Capture message and flush."""
    client.capture_message(message, **kwargs)
    await asyncio.sleep(0)
    await client.flush()


class TestErrorCapture:
    """Test full error capture flow."""

    @pytest.mark.asyncio
    async def test_capture_exception_payload_structure(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test_key@localhost:3000/proj_test_123",
            environment="test",
            release="1.0.0",
            service_id="test-service",
            deployment_id="dep-1",
        )

        try:
            raise ValueError("Test error message")
        except ValueError as e:
            await capture_and_flush(client, e)

        assert len(capture.errors) == 1
        err = capture.errors[0]

        assert err["id"]
        assert err["service_id"] == "test-service"
        assert err["deployment_id"] == "dep-1"
        assert err["timestamp"]
        assert err["type"] == "ValueError"
        assert err["message"] == "Test error message"
        assert isinstance(err["stack_trace"], list)
        assert isinstance(err["breadcrumbs"], list)
        assert isinstance(err["fingerprint"], list)

        ctx = err["context"]
        assert ctx["environment"] == "test"
        assert ctx["release"] == "1.0.0"

        await client.close()

    @pytest.mark.asyncio
    async def test_error_with_tags_and_extra(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            environment="production",
            release="2.0.0",
            service_id="api-service",
            deployment_id="dep-prod",
        )

        try:
            raise TypeError("Cannot read property")
        except TypeError as e:
            await capture_and_flush(client, e, tags={"module": "auth"}, extra={"endpoint": "/login"})

        err = capture.errors[0]
        assert err["type"] == "TypeError"
        assert err["message"] == "Cannot read property"
        assert err["context"]["tags"]["module"] == "auth"
        assert err["context"]["extra"]["endpoint"] == "/login"

        await client.close()

    @pytest.mark.asyncio
    async def test_user_context_in_error(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        client.set_user({"id": "user-456", "email": "test@example.com"})

        try:
            raise RuntimeError("User error")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        err = capture.errors[0]
        assert err["context"]["user"] == {"id": "user-456", "email": "test@example.com"}

        await client.close()

    @pytest.mark.asyncio
    async def test_tags_accumulated_in_scope(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        client.set_tag("version", "3.0")
        client.set_tag("region", "us-east-1")

        try:
            raise RuntimeError("Tagged error")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        tags = capture.errors[0]["context"]["tags"]
        assert tags["version"] == "3.0"
        assert tags["region"] == "us-east-1"

        await client.close()


class TestMessageCapture:
    """Test message capture flow."""

    @pytest.mark.asyncio
    async def test_capture_message(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        await message_and_flush(client, "User logged in", level="info")

        err = capture.errors[0]
        assert err["type"] == "Message"
        assert err["message"] == "User logged in"
        assert err["context"]["tags"]["level"] == "info"

        await client.close()


class TestBreadcrumbs:
    """Test breadcrumb integration."""

    @pytest.mark.asyncio
    async def test_breadcrumbs_included_in_error(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        client.add_breadcrumb(
            type=BreadcrumbType.NAVIGATION,
            category="navigation",
            message="Navigated to /dashboard",
        )
        client.add_breadcrumb(
            type=BreadcrumbType.HTTP,
            category="http",
            message="GET /api/users",
            data={"status": 200},
        )

        try:
            raise RuntimeError("After breadcrumbs")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        breadcrumbs = capture.errors[0]["breadcrumbs"]
        assert len(breadcrumbs) == 2
        assert breadcrumbs[0]["category"] == "navigation"
        assert breadcrumbs[1]["category"] == "http"

        await client.close()


class TestSampling:
    """Test sampling behavior."""

    @pytest.mark.asyncio
    async def test_zero_sample_rate_drops_events(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
            errors_sample_rate=0.0,
        )

        try:
            raise RuntimeError("Sampled out")
        except RuntimeError as e:
            event_id = client.capture_exception(e)

        assert event_id == ""
        await asyncio.sleep(0)
        await client.flush()
        assert len(capture.errors) == 0

        await client.close()


class TestBeforeSend:
    """Test before_send hook."""

    @pytest.mark.asyncio
    async def test_before_send_drops_event(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
            before_send=lambda event: None,
        )

        try:
            raise RuntimeError("Should be dropped")
        except RuntimeError as e:
            event_id = client.capture_exception(e)

        assert event_id == ""
        await asyncio.sleep(0)
        await client.flush()
        assert len(capture.errors) == 0

        await client.close()

    @pytest.mark.asyncio
    async def test_before_send_modifies_event(self):
        def modify_event(event):
            event.message = "modified: " + event.message
            return event

        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
            before_send=modify_event,
        )

        try:
            raise RuntimeError("original")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        assert capture.errors[0]["message"] == "modified: original"

        await client.close()


class TestTransportURL:
    """Test transport URL construction from DSN."""

    @pytest.mark.asyncio
    async def test_https_for_production_host(self):
        init(dsn="syn://pk_live@api.syntra.io/proj_live", service_id="prod-svc")
        client = get_client()
        assert client._transport.url == "https://api.syntra.io/api/v1/telemetry"
        await client.close()

    @pytest.mark.asyncio
    async def test_http_for_localhost(self):
        init(dsn="syn://pk_test@localhost:4000/proj_dev", service_id="dev-svc")
        client = get_client()
        assert client._transport.url == "http://localhost:4000/api/v1/telemetry"
        await client.close()

    @pytest.mark.asyncio
    async def test_auth_headers_from_dsn(self):
        init(dsn="syn://pk_my_key@localhost:3000/proj_xyz", service_id="svc")
        client = get_client()
        assert client._transport.public_key == "pk_my_key"
        assert client._transport.project_id == "proj_xyz"
        await client.close()


class TestRuntimeContext:
    """Test runtime context in error payloads."""

    @pytest.mark.asyncio
    async def test_includes_python_runtime_info(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        try:
            raise RuntimeError("Runtime test")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        ctx = capture.errors[0]["context"]
        assert ctx["runtime"]["name"] == "python"
        assert ctx["runtime"]["version"]  # Should have Python version string
        assert ctx["os"]["name"]  # Should have OS name

        await client.close()

    @pytest.mark.asyncio
    async def test_stack_trace_has_frames(self):
        capture = PayloadCapture()
        client = init_with_capture(
            capture,
            dsn="syn://pk_test@localhost:3000/proj_test",
            service_id="test-svc",
        )

        try:
            raise RuntimeError("Stack trace test")
        except RuntimeError as e:
            await capture_and_flush(client, e)

        frames = capture.errors[0]["stack_trace"]
        assert len(frames) > 0
        # Each frame should have filename, function, lineno
        frame = frames[0]
        assert "filename" in frame
        assert "function" in frame
        assert "lineno" in frame

        await client.close()
