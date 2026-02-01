"""Tests for Syntra SDK transports."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json

from syntra.transport.http import HttpTransport, create_http_transport
from syntra.transport.otlp import OtlpTransport, create_otlp_transport


class TestHttpTransport:
    """Test HTTP transport."""

    @pytest.mark.asyncio
    async def test_create_transport(self):
        """Should create transport with correct URL."""
        transport = create_http_transport(
            host="syntra.io",
            public_key="pk_test",
            project_id="proj_test",
        )

        assert transport.url == "https://syntra.io/api/v1/telemetry"
        assert transport.public_key == "pk_test"
        assert transport.project_id == "proj_test"

        await transport.close()

    @pytest.mark.asyncio
    async def test_create_transport_localhost(self):
        """Should use HTTP for localhost."""
        transport = create_http_transport(
            host="localhost:3000",
            public_key="pk_test",
            project_id="proj_test",
        )

        assert transport.url == "http://localhost:3000/api/v1/telemetry"
        await transport.close()

    @pytest.mark.asyncio
    async def test_send_error(self):
        """Should send error to API."""
        transport = HttpTransport(
            url="http://localhost:3000/api/v1/telemetry",
            public_key="pk_test",
            project_id="proj_test",
        )

        with patch.object(transport, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client.post.return_value = mock_response
            mock_get_client.return_value = mock_client

            error = {
                "id": "test-error",
                "service_id": "svc",
                "deployment_id": "dep",
                "timestamp": "2024-01-01T00:00:00Z",
                "type": "Error",
                "message": "Test",
                "stack_trace": [],
                "breadcrumbs": [],
                "context": {},
                "fingerprint": [],
            }

            await transport.send_error(error)
            await transport.flush()

            # Verify post was called
            mock_client.post.assert_called()

        await transport.close()

    @pytest.mark.asyncio
    async def test_send_spans(self):
        """Should send spans to API."""
        transport = HttpTransport(
            url="http://localhost:3000/api/v1/telemetry",
            public_key="pk_test",
            project_id="proj_test",
        )

        with patch.object(transport, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client.post.return_value = mock_response
            mock_get_client.return_value = mock_client

            spans = [{
                "trace_id": "abc123",
                "span_id": "def456",
                "service_id": "svc",
                "deployment_id": "dep",
                "operation_name": "test",
                "span_kind": "internal",
                "start_time_ns": 0,
                "duration_ns": 1000000,
                "status": {"code": "ok"},
                "attributes": {},
                "events": [],
            }]

            await transport.send_spans(spans)
            await transport.flush()

            mock_client.post.assert_called()

        await transport.close()


class TestOtlpTransport:
    """Test OTLP transport."""

    @pytest.mark.asyncio
    async def test_create_transport(self):
        """Should create OTLP transport."""
        transport = create_otlp_transport(
            endpoint="http://localhost:4318",
            project_id="proj_test",
            service_name="test-service",
            service_version="1.0.0",
        )

        assert transport.url == "http://localhost:4318"
        assert transport.project_id == "proj_test"
        assert transport.service_name == "test-service"

        await transport.close()

    @pytest.mark.asyncio
    async def test_convert_spans_to_otlp(self):
        """Should convert spans to OTLP format."""
        transport = OtlpTransport(
            url="http://localhost:4318",
            project_id="proj_test",
            service_name="test-service",
        )

        spans = [{
            "trace_id": "abc123",
            "span_id": "def456",
            "operation_name": "test",
            "span_kind": "server",
            "start_time_ns": 1000000000,
            "duration_ns": 1000000,
            "status": {"code": "ok"},
            "attributes": {"http.method": "GET"},
            "events": [],
        }]

        resource_spans = transport._convert_to_resource_spans(spans)

        assert "resource" in resource_spans
        assert "scope_spans" in resource_spans
        assert len(resource_spans["scope_spans"]) == 1
        assert len(resource_spans["scope_spans"][0]["spans"]) == 1

        otlp_span = resource_spans["scope_spans"][0]["spans"][0]
        assert otlp_span["name"] == "test"
        assert otlp_span["kind"] == 2  # server

        await transport.close()

    @pytest.mark.asyncio
    async def test_convert_logs_to_otlp(self):
        """Should convert logs to OTLP format."""
        transport = OtlpTransport(
            url="http://localhost:4318",
            project_id="proj_test",
        )

        logs = [{
            "timestamp": "2024-01-01T00:00:00Z",
            "level": "info",
            "message": "Test log",
            "attributes": {"key": "value"},
        }]

        resource_logs = transport._convert_to_resource_logs(logs)

        assert "resource" in resource_logs
        assert "scope_logs" in resource_logs
        assert len(resource_logs["scope_logs"]) == 1

        log_record = resource_logs["scope_logs"][0]["log_records"][0]
        assert log_record["severity_text"] == "INFO"

        await transport.close()

    def test_span_kind_conversion(self):
        """Should convert span kinds correctly."""
        transport = OtlpTransport(
            url="http://localhost:4318",
            project_id="proj_test",
        )

        assert transport._span_kind_to_number("internal") == 1
        assert transport._span_kind_to_number("server") == 2
        assert transport._span_kind_to_number("client") == 3
        assert transport._span_kind_to_number("producer") == 4
        assert transport._span_kind_to_number("consumer") == 5
        assert transport._span_kind_to_number("unknown") == 0

    def test_severity_conversion(self):
        """Should convert log levels correctly."""
        transport = OtlpTransport(
            url="http://localhost:4318",
            project_id="proj_test",
        )

        assert transport._level_to_severity_number("trace") == 1
        assert transport._level_to_severity_number("debug") == 5
        assert transport._level_to_severity_number("info") == 9
        assert transport._level_to_severity_number("warn") == 13
        assert transport._level_to_severity_number("error") == 17
        assert transport._level_to_severity_number("fatal") == 21
