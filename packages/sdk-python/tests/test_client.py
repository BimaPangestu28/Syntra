"""Tests for Syntra SDK client."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

import syntra
from syntra.config import parse_dsn, is_valid_dsn
from syntra.scope import Scope, get_current_scope
from syntra.types import BreadcrumbType, BreadcrumbLevel


class TestDSNParsing:
    """Test DSN parsing functionality."""

    def test_parse_valid_dsn(self):
        """Should parse a valid DSN."""
        dsn = parse_dsn("syn://pk_abc123@syntra.io/proj_xyz")
        assert dsn.protocol == "syn"
        assert dsn.public_key == "pk_abc123"
        assert dsn.host == "syntra.io"
        assert dsn.project_id == "proj_xyz"

    def test_parse_https_dsn(self):
        """Should parse HTTPS DSN."""
        dsn = parse_dsn("https://pk_abc123@api.syntra.io/proj_xyz")
        assert dsn.protocol == "https"
        assert dsn.host == "api.syntra.io"

    def test_invalid_dsn_empty(self):
        """Should raise for empty DSN."""
        with pytest.raises(ValueError, match="DSN is required"):
            parse_dsn("")

    def test_invalid_dsn_format(self):
        """Should raise for invalid format."""
        with pytest.raises(ValueError, match="Invalid DSN format"):
            parse_dsn("invalid")

    def test_is_valid_dsn(self):
        """Should validate DSN format."""
        assert is_valid_dsn("syn://pk_test@host.com/proj")
        assert not is_valid_dsn("invalid")
        assert not is_valid_dsn("")


class TestScope:
    """Test scope management."""

    def test_scope_user(self):
        """Should set and clear user."""
        scope = Scope()

        scope.set_user({"id": "user-123", "email": "test@example.com"})
        assert scope.user is not None
        assert scope.user["id"] == "user-123"

        scope.set_user(None)
        assert scope.user is None

    def test_scope_tags(self):
        """Should set tags."""
        scope = Scope()

        scope.set_tag("env", "test")
        scope.set_tags({"version": "1.0", "region": "us"})

        assert scope.tags["env"] == "test"
        assert scope.tags["version"] == "1.0"
        assert scope.tags["region"] == "us"

    def test_scope_extra(self):
        """Should set extra context."""
        scope = Scope()

        scope.set_extra("data", {"foo": "bar"})
        scope.set_extras({"count": 42})

        assert scope.extra["data"] == {"foo": "bar"}
        assert scope.extra["count"] == 42

    def test_scope_breadcrumbs(self):
        """Should add breadcrumbs with ring buffer."""
        scope = Scope(_max_breadcrumbs=3)

        for i in range(5):
            scope.add_breadcrumb(
                type=BreadcrumbType.DEFAULT,
                category="test",
                message=f"Breadcrumb {i}",
            )

        # Should only have last 3
        assert len(scope.breadcrumbs) == 3
        assert scope.breadcrumbs[0].message == "Breadcrumb 2"
        assert scope.breadcrumbs[2].message == "Breadcrumb 4"

    def test_scope_clone(self):
        """Should clone scope."""
        scope = Scope()
        scope.set_user({"id": "user-123"})
        scope.set_tag("env", "test")

        cloned = scope.clone()

        # Should be independent
        cloned.set_tag("env", "prod")
        assert scope.tags["env"] == "test"
        assert cloned.tags["env"] == "prod"

    def test_scope_clear(self):
        """Should clear all scope data."""
        scope = Scope()
        scope.set_user({"id": "user-123"})
        scope.set_tag("env", "test")
        scope.add_breadcrumb(type=BreadcrumbType.DEFAULT, category="test")

        scope.clear()

        assert scope.user is None
        assert scope.tags == {}
        assert scope.breadcrumbs == []


class TestClientInitialization:
    """Test client initialization."""

    def test_init_with_valid_dsn(self):
        """Should initialize with valid DSN."""
        with patch("syntra.client.SyntraClient") as MockClient:
            mock_instance = MagicMock()
            MockClient.return_value = mock_instance

            syntra.init(dsn="syn://pk_test@localhost/proj_test")

            MockClient.assert_called_once()

    def test_init_with_options(self):
        """Should pass options to client."""
        with patch("syntra.client.SyntraClient") as MockClient:
            mock_instance = MagicMock()
            MockClient.return_value = mock_instance

            syntra.init(
                dsn="syn://pk_test@localhost/proj_test",
                environment="testing",
                release="1.0.0",
                debug=True,
            )

            MockClient.assert_called_once()
            # Check options were passed
            call_args = MockClient.call_args
            options = call_args[0][0]
            assert options.environment == "testing"
            assert options.release == "1.0.0"
            assert options.debug is True


class TestTracing:
    """Test tracing functionality."""

    def test_trace_id_generation(self):
        """Should generate valid trace IDs."""
        from syntra.tracing.context import generate_trace_id

        trace_id = generate_trace_id()
        assert len(trace_id) == 32
        assert all(c in "0123456789abcdef" for c in trace_id)

    def test_span_id_generation(self):
        """Should generate valid span IDs."""
        from syntra.tracing.context import generate_span_id

        span_id = generate_span_id()
        assert len(span_id) == 16
        assert all(c in "0123456789abcdef" for c in span_id)

    def test_traceparent_parsing(self):
        """Should parse traceparent header."""
        from syntra.tracing.context import parse_traceparent

        header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        context = parse_traceparent(header)

        assert context is not None
        assert context.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert context.span_id == "00f067aa0ba902b7"
        assert context.trace_flags == 1

    def test_traceparent_creation(self):
        """Should create traceparent header."""
        from syntra.tracing.context import create_traceparent, SpanContext

        context = SpanContext(
            trace_id="4bf92f3577b34da6a3ce929d0e0e4736",
            span_id="00f067aa0ba902b7",
            trace_flags=1,
        )

        header = create_traceparent(context)
        assert header == "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

    def test_span_creation(self):
        """Should create span with correct properties."""
        from syntra.tracing.span import SpanImpl
        from syntra.types import SpanKind

        span = SpanImpl(name="test-operation")

        assert span.name == "test-operation"
        assert len(span.trace_id) == 32
        assert len(span.span_id) == 16
        assert span.kind == SpanKind.INTERNAL
        assert span.is_recording() is True

    def test_span_attributes(self):
        """Should set span attributes."""
        from syntra.tracing.span import SpanImpl

        span = SpanImpl(name="test")
        span.set_attribute("key", "value")
        span.set_attributes({"num": 42, "bool": True})

        assert span.attributes["key"] == "value"
        assert span.attributes["num"] == 42
        assert span.attributes["bool"] is True

    def test_span_end(self):
        """Should end span and stop recording."""
        from syntra.tracing.span import SpanImpl

        span = SpanImpl(name="test")
        assert span.is_recording() is True

        span.end()

        assert span.is_recording() is False
        assert span.duration_ns > 0

    def test_span_context_manager(self):
        """Should work as context manager."""
        from syntra.tracing.span import SpanImpl
        from syntra.types import SpanStatusCode

        with SpanImpl(name="test") as span:
            span.set_attribute("inside", True)

        assert span.is_recording() is False

    def test_noop_span(self):
        """Should not record in noop span."""
        from syntra.tracing.span import NoopSpan
        from syntra.types import SpanStatusCode

        span = NoopSpan()
        assert span.is_recording() is False

        # Should not raise
        span.set_attribute("key", "value")
        span.set_status(SpanStatusCode.OK)
        span.add_event("event")
        span.end()


class TestDecorators:
    """Test tracing decorators."""

    def test_trace_decorator_sync(self):
        """Should trace synchronous function."""
        from syntra.tracing.decorators import trace
        from syntra.tracing.tracer import set_tracer
        from unittest.mock import MagicMock

        mock_tracer = MagicMock()
        mock_span = MagicMock()
        mock_tracer.start_span.return_value = mock_span
        set_tracer(mock_tracer)

        @trace(op="test")
        def my_function(x: int) -> int:
            return x * 2

        result = my_function(5)

        assert result == 10
        set_tracer(None)

    @pytest.mark.asyncio
    async def test_trace_decorator_async(self):
        """Should trace asynchronous function."""
        from syntra.tracing.decorators import trace
        from syntra.tracing.tracer import set_tracer
        from unittest.mock import MagicMock

        mock_tracer = MagicMock()
        mock_span = MagicMock()
        mock_tracer.start_span.return_value = mock_span
        set_tracer(mock_tracer)

        @trace(op="async_test")
        async def my_async_function(x: int) -> int:
            return x * 2

        result = await my_async_function(5)

        assert result == 10
        set_tracer(None)
