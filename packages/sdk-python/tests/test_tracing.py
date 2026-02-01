"""Comprehensive unit tests for the Syntra SDK tracing module.

Covers: Span creation, status, events, nesting, context propagation,
Tracer lifecycle, @trace decorator, and W3C traceparent inject/extract.
"""

import asyncio
import time

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from syntra.tracing.context import (
    TRACE_FLAG_NONE,
    TRACE_FLAG_SAMPLED,
    TRACEPARENT_HEADER,
    TRACESTATE_HEADER,
    SpanContext,
    create_traceparent,
    extract_trace_context,
    generate_span_id,
    generate_trace_id,
    get_current_context,
    inject_trace_context,
    parse_traceparent,
    parse_tracestate,
    create_tracestate,
    reset_current_context,
    set_current_context,
)
from syntra.tracing.decorators import trace
from syntra.tracing.span import NoopSpan, Span, SpanImpl
from syntra.tracing.tracer import Tracer, get_tracer, set_tracer, start_span, get_active_span
from syntra.types import SpanKind, SpanStatus, SpanStatusCode


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_transport() -> MagicMock:
    """Create a mock transport with an async send_spans method."""
    transport = MagicMock()
    transport.send_spans = AsyncMock()
    return transport


def _make_tracer(
    sample_rate: float = 1.0,
    service_id: str = "svc-test",
    deployment_id: str = "dep-test",
    debug: bool = False,
) -> Tracer:
    """Create a Tracer backed by a mock transport."""
    return Tracer(
        service_id=service_id,
        deployment_id=deployment_id,
        sample_rate=sample_rate,
        transport=_make_mock_transport(),
        debug=debug,
    )


@pytest.fixture(autouse=True)
def _reset_context():
    """Ensure each test starts with a clean span context."""
    token = set_current_context(None)
    yield
    set_current_context(None)


@pytest.fixture(autouse=True)
def _reset_global_tracer():
    """Ensure each test starts with no global tracer."""
    set_tracer(None)
    yield
    set_tracer(None)


# ===================================================================
# 1. Span Creation
# ===================================================================

class TestSpanCreation:
    """Test SpanImpl creation with various parameters."""

    def test_span_has_name(self):
        """Span should store the name passed at construction."""
        span = SpanImpl(name="my-operation")
        assert span.name == "my-operation"

    def test_span_generates_valid_trace_id(self):
        """Span should auto-generate a 32-char lowercase hex trace_id."""
        span = SpanImpl(name="t")
        assert len(span.trace_id) == 32
        assert all(c in "0123456789abcdef" for c in span.trace_id)

    def test_span_generates_valid_span_id(self):
        """Span should auto-generate a 16-char lowercase hex span_id."""
        span = SpanImpl(name="t")
        assert len(span.span_id) == 16
        assert all(c in "0123456789abcdef" for c in span.span_id)

    def test_span_uses_provided_trace_id(self):
        """Span should use the trace_id supplied at construction."""
        tid = "a" * 32
        span = SpanImpl(name="t", trace_id=tid)
        assert span.trace_id == tid

    def test_span_parent_span_id_default_none(self):
        """Span should have no parent by default."""
        span = SpanImpl(name="t")
        assert span.parent_span_id is None

    def test_span_parent_span_id_stored(self):
        """Span should store the parent_span_id when supplied."""
        span = SpanImpl(name="t", parent_span_id="b" * 16)
        assert span.parent_span_id == "b" * 16

    def test_span_default_kind_is_internal(self):
        """Span kind should default to INTERNAL."""
        span = SpanImpl(name="t")
        assert span.kind == SpanKind.INTERNAL

    def test_span_custom_kind(self):
        """Span kind should accept SERVER, CLIENT, etc."""
        span = SpanImpl(name="t", kind=SpanKind.SERVER)
        assert span.kind == SpanKind.SERVER

    def test_span_initial_attributes(self):
        """Span should accept initial attributes dict."""
        span = SpanImpl(name="t", attributes={"env": "test", "count": 5})
        assert span.attributes == {"env": "test", "count": 5}

    def test_span_initial_attributes_default_empty(self):
        """Span should default to empty attributes."""
        span = SpanImpl(name="t")
        assert span.attributes == {}

    def test_span_start_time_ns_set_on_creation(self):
        """Span should record a start time in nanoseconds upon creation."""
        before = time.time_ns()
        span = SpanImpl(name="t")
        after = time.time_ns()
        assert before <= span.start_time_ns <= after

    def test_span_is_recording_on_creation(self):
        """A new span should be in recording state."""
        span = SpanImpl(name="t")
        assert span.is_recording() is True

    def test_span_duration_ns_zero_before_end(self):
        """Duration should be 0 while the span is still recording."""
        span = SpanImpl(name="t")
        assert span.duration_ns == 0

    def test_span_unique_ids(self):
        """Two spans should get different span_ids and trace_ids."""
        s1 = SpanImpl(name="a")
        s2 = SpanImpl(name="b")
        assert s1.span_id != s2.span_id
        assert s1.trace_id != s2.trace_id


# ===================================================================
# 2. Span Status
# ===================================================================

class TestSpanStatus:
    """Test SpanImpl set_status behaviour."""

    def test_default_status_is_unset(self):
        """Status should be UNSET when span is created."""
        span = SpanImpl(name="t")
        assert span.status.code == SpanStatusCode.UNSET
        assert span.status.message is None

    def test_set_status_ok(self):
        """Setting status to OK should persist."""
        span = SpanImpl(name="t")
        span.set_status(SpanStatusCode.OK)
        assert span.status.code == SpanStatusCode.OK
        assert span.status.message is None

    def test_set_status_error_with_message(self):
        """Setting ERROR status with a message should persist both."""
        span = SpanImpl(name="t")
        span.set_status(SpanStatusCode.ERROR, "something broke")
        assert span.status.code == SpanStatusCode.ERROR
        assert span.status.message == "something broke"

    def test_set_status_ignored_after_end(self):
        """Status changes should be ignored after span.end()."""
        span = SpanImpl(name="t")
        span.set_status(SpanStatusCode.OK)
        span.end()
        span.set_status(SpanStatusCode.ERROR, "late")
        assert span.status.code == SpanStatusCode.OK

    def test_status_to_dict(self):
        """SpanStatus.to_dict should produce the correct dictionary."""
        status = SpanStatus(code=SpanStatusCode.ERROR, message="fail")
        d = status.to_dict()
        assert d == {"code": "error", "message": "fail"}

    def test_status_to_dict_without_message(self):
        """SpanStatus.to_dict should omit message when it is None."""
        status = SpanStatus(code=SpanStatusCode.OK)
        d = status.to_dict()
        assert d == {"code": "ok"}


# ===================================================================
# 3. Span Events
# ===================================================================

class TestSpanEvents:
    """Test SpanImpl add_event behaviour."""

    def test_add_event_basic(self):
        """Should record an event with the given name."""
        span = SpanImpl(name="t")
        span.add_event("cache.miss")
        assert len(span.events) == 1
        assert span.events[0].name == "cache.miss"

    def test_add_event_with_attributes(self):
        """Should record event attributes."""
        span = SpanImpl(name="t")
        span.add_event("db.query", attributes={"table": "users", "rows": 42})
        evt = span.events[0]
        assert evt.attributes == {"table": "users", "rows": 42}

    def test_add_event_timestamp_ns(self):
        """Event timestamp should be a recent nanosecond value."""
        before = time.time_ns()
        span = SpanImpl(name="t")
        span.add_event("tick")
        after = time.time_ns()
        assert before <= span.events[0].timestamp_ns <= after

    def test_multiple_events_ordered(self):
        """Events should be stored in order of insertion."""
        span = SpanImpl(name="t")
        span.add_event("first")
        span.add_event("second")
        span.add_event("third")
        names = [e.name for e in span.events]
        assert names == ["first", "second", "third"]

    def test_add_event_ignored_after_end(self):
        """Events should not be added after span.end()."""
        span = SpanImpl(name="t")
        span.end()
        span.add_event("late")
        assert len(span.events) == 0

    def test_event_to_dict(self):
        """SpanEvent.to_dict should produce the correct dictionary."""
        span = SpanImpl(name="t")
        span.add_event("evt", attributes={"k": "v"})
        d = span.events[0].to_dict()
        assert d["name"] == "evt"
        assert "timestamp_ns" in d
        assert d["attributes"] == {"k": "v"}


# ===================================================================
# 4. Span End and Duration
# ===================================================================

class TestSpanEnd:
    """Test span ending and duration calculation."""

    def test_end_stops_recording(self):
        """Calling end() should flip is_recording to False."""
        span = SpanImpl(name="t")
        span.end()
        assert span.is_recording() is False

    def test_duration_ns_positive_after_end(self):
        """Duration should be > 0 after end() when some time has passed."""
        span = SpanImpl(name="t")
        # Ensure some time elapses
        time.sleep(0.001)
        span.end()
        assert span.duration_ns > 0

    def test_double_end_is_noop(self):
        """Calling end() twice should not change duration."""
        span = SpanImpl(name="t")
        span.end()
        dur1 = span.duration_ns
        span.end()
        dur2 = span.duration_ns
        assert dur1 == dur2

    def test_set_attribute_ignored_after_end(self):
        """Attributes should not be modified after end()."""
        span = SpanImpl(name="t")
        span.set_attribute("before", True)
        span.end()
        span.set_attribute("after", True)
        assert "after" not in span.attributes
        assert "before" in span.attributes

    def test_set_attributes_ignored_after_end(self):
        """Bulk set_attributes should be ignored after end()."""
        span = SpanImpl(name="t")
        span.end()
        span.set_attributes({"a": 1, "b": 2})
        assert span.attributes == {}


# ===================================================================
# 5. Span as Context Manager
# ===================================================================

class TestSpanContextManager:
    """Test Span used via with-statement."""

    def test_context_manager_ends_span(self):
        """Exiting the with block should end the span."""
        span = SpanImpl(name="ctx-test")
        with span:
            assert span.is_recording() is True
        assert span.is_recording() is False

    def test_context_manager_sets_error_on_exception(self):
        """An exception inside the with block should set ERROR status."""
        span = SpanImpl(name="ctx-err")
        with pytest.raises(ValueError, match="boom"):
            with span:
                raise ValueError("boom")

        assert span.status.code == SpanStatusCode.ERROR
        assert span.status.message == "boom"
        assert span.is_recording() is False

    def test_context_manager_no_error_on_success(self):
        """Status should remain UNSET when with block succeeds."""
        span = SpanImpl(name="ctx-ok")
        with span:
            pass
        assert span.status.code == SpanStatusCode.UNSET


# ===================================================================
# 6. Span Context (W3C traceparent)
# ===================================================================

class TestSpanContext:
    """Test SpanContext generation and W3C traceparent round-trip."""

    def test_span_context_fields(self):
        """span_context() should return matching trace_id and span_id."""
        span = SpanImpl(name="t")
        ctx = span.span_context()
        assert ctx.trace_id == span.trace_id
        assert ctx.span_id == span.span_id
        assert ctx.trace_flags == TRACE_FLAG_SAMPLED

    def test_create_traceparent_format(self):
        """create_traceparent should produce version-traceId-spanId-flags."""
        ctx = SpanContext(
            trace_id="4bf92f3577b34da6a3ce929d0e0e4736",
            span_id="00f067aa0ba902b7",
            trace_flags=TRACE_FLAG_SAMPLED,
        )
        tp = create_traceparent(ctx)
        assert tp == "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

    def test_create_traceparent_unsampled(self):
        """Unsampled flag should produce '00' as the last segment."""
        ctx = SpanContext(
            trace_id="a" * 32,
            span_id="b" * 16,
            trace_flags=TRACE_FLAG_NONE,
        )
        tp = create_traceparent(ctx)
        assert tp.endswith("-00")

    def test_parse_traceparent_valid(self):
        """parse_traceparent should decode a well-formed header."""
        header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        ctx = parse_traceparent(header)
        assert ctx is not None
        assert ctx.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert ctx.span_id == "00f067aa0ba902b7"
        assert ctx.trace_flags == 1

    def test_parse_traceparent_roundtrip(self):
        """Parsing a created traceparent should yield the same context."""
        original = SpanContext(
            trace_id="abcdef1234567890abcdef1234567890",
            span_id="1234567890abcdef",
            trace_flags=1,
        )
        header = create_traceparent(original)
        parsed = parse_traceparent(header)
        assert parsed is not None
        assert parsed.trace_id == original.trace_id
        assert parsed.span_id == original.span_id
        assert parsed.trace_flags == original.trace_flags

    def test_parse_traceparent_empty(self):
        """Empty string should return None."""
        assert parse_traceparent("") is None

    def test_parse_traceparent_wrong_segment_count(self):
        """Fewer or more than 4 segments should return None."""
        assert parse_traceparent("00-abc-def") is None
        assert parse_traceparent("00-a-b-c-d") is None

    def test_parse_traceparent_wrong_version(self):
        """Only version '00' is supported; others return None."""
        header = "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_invalid_trace_id_length(self):
        """trace_id must be exactly 32 hex chars."""
        header = "00-short-00f067aa0ba902b7-01"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_all_zero_trace_id(self):
        """All-zero trace_id should be rejected."""
        header = f"00-{'0' * 32}-00f067aa0ba902b7-01"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_invalid_span_id_length(self):
        """span_id must be exactly 16 hex chars."""
        header = f"00-{'a' * 32}-short-01"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_all_zero_span_id(self):
        """All-zero span_id should be rejected."""
        header = f"00-{'a' * 32}-{'0' * 16}-01"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_invalid_flags(self):
        """Non-hex flags should return None."""
        header = f"00-{'a' * 32}-{'b' * 16}-zz"
        assert parse_traceparent(header) is None

    def test_parse_traceparent_case_insensitive(self):
        """Upper-case hex in trace_id/span_id should parse, lowered."""
        header = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01"
        ctx = parse_traceparent(header)
        assert ctx is not None
        assert ctx.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert ctx.span_id == "00f067aa0ba902b7"


# ===================================================================
# 7. Tracestate
# ===================================================================

class TestTracestate:
    """Test W3C tracestate parsing and creation."""

    def test_parse_tracestate_single_pair(self):
        """Should parse a single key=value pair."""
        state = parse_tracestate("vendor=opaquevalue")
        assert state == {"vendor": "opaquevalue"}

    def test_parse_tracestate_multiple_pairs(self):
        """Should parse comma-separated pairs."""
        state = parse_tracestate("a=1,b=2,c=3")
        assert state == {"a": "1", "b": "2", "c": "3"}

    def test_parse_tracestate_empty(self):
        """Empty string should return empty dict."""
        assert parse_tracestate("") == {}

    def test_parse_tracestate_with_whitespace(self):
        """Whitespace around pairs should be trimmed."""
        state = parse_tracestate(" a=1 , b=2 ")
        assert state == {"a": "1", "b": "2"}

    def test_create_tracestate(self):
        """Should produce a comma-separated string."""
        header = create_tracestate({"vendor": "value", "other": "data"})
        assert "vendor=value" in header
        assert "other=data" in header


# ===================================================================
# 8. ID Generation
# ===================================================================

class TestIDGeneration:
    """Test trace_id and span_id generators."""

    def test_generate_trace_id_length(self):
        """Trace ID should be 32 hex chars (16 bytes)."""
        tid = generate_trace_id()
        assert len(tid) == 32

    def test_generate_trace_id_hex(self):
        """Trace ID should only contain hex digits."""
        tid = generate_trace_id()
        int(tid, 16)  # should not raise

    def test_generate_span_id_length(self):
        """Span ID should be 16 hex chars (8 bytes)."""
        sid = generate_span_id()
        assert len(sid) == 16

    def test_generate_span_id_hex(self):
        """Span ID should only contain hex digits."""
        sid = generate_span_id()
        int(sid, 16)  # should not raise

    def test_generate_ids_unique(self):
        """Consecutive calls should produce unique IDs."""
        ids = {generate_trace_id() for _ in range(100)}
        assert len(ids) == 100

        sids = {generate_span_id() for _ in range(100)}
        assert len(sids) == 100


# ===================================================================
# 9. Span Nesting (parent-child propagation)
# ===================================================================

class TestSpanNesting:
    """Test parent-child trace_id propagation and parent_span_id."""

    def test_child_inherits_trace_id(self):
        """A child span should share the parent trace_id."""
        parent = SpanImpl(name="parent")
        child = SpanImpl(
            name="child",
            trace_id=parent.trace_id,
            parent_span_id=parent.span_id,
        )
        assert child.trace_id == parent.trace_id
        assert child.parent_span_id == parent.span_id

    def test_grandchild_inherits_trace_id(self):
        """A grandchild span should share the original trace_id."""
        root = SpanImpl(name="root")
        child = SpanImpl(name="child", trace_id=root.trace_id, parent_span_id=root.span_id)
        grandchild = SpanImpl(
            name="grandchild",
            trace_id=child.trace_id,
            parent_span_id=child.span_id,
        )
        assert grandchild.trace_id == root.trace_id
        assert grandchild.parent_span_id == child.span_id

    def test_sibling_spans_share_trace_id_different_span_ids(self):
        """Siblings should share trace_id but have distinct span_ids."""
        parent = SpanImpl(name="parent")
        child_a = SpanImpl(name="a", trace_id=parent.trace_id, parent_span_id=parent.span_id)
        child_b = SpanImpl(name="b", trace_id=parent.trace_id, parent_span_id=parent.span_id)
        assert child_a.trace_id == child_b.trace_id
        assert child_a.span_id != child_b.span_id
        assert child_a.parent_span_id == child_b.parent_span_id


# ===================================================================
# 10. Tracer
# ===================================================================

class TestTracer:
    """Test Tracer class: start_span, active tracking, sampling, flush."""

    def test_start_span_returns_span_impl(self):
        """start_span should return a SpanImpl when sampled."""
        tracer = _make_tracer(sample_rate=1.0)
        span = tracer.start_span("test-op")
        assert isinstance(span, SpanImpl)
        assert span.name == "test-op"

    def test_start_span_with_op_attribute(self):
        """op parameter should be stored as syntra.op attribute."""
        tracer = _make_tracer()
        span = tracer.start_span("op-test", op="db.query")
        assert isinstance(span, SpanImpl)
        assert span.attributes.get("syntra.op") == "db.query"

    def test_start_span_zero_sample_rate_returns_noop(self):
        """Zero sample rate should return NoopSpan."""
        tracer = _make_tracer(sample_rate=0.0)
        span = tracer.start_span("noop-test")
        assert isinstance(span, NoopSpan)

    def test_start_span_full_sample_rate_returns_real(self):
        """Sample rate of 1.0 should always return a real span."""
        tracer = _make_tracer(sample_rate=1.0)
        for _ in range(20):
            span = tracer.start_span("real")
            assert isinstance(span, SpanImpl)

    def test_active_span_tracking(self):
        """get_active_span should return the most recently started span."""
        tracer = _make_tracer()
        span = tracer.start_span("active")
        active = tracer.get_active_span()
        assert active is span

    def test_active_span_none_initially(self):
        """get_active_span should return None when nothing is started."""
        tracer = _make_tracer()
        assert tracer.get_active_span() is None

    def test_on_span_end_removes_active_span(self):
        """Ending a span should remove it from active spans."""
        tracer = _make_tracer()
        span = tracer.start_span("to-end")
        assert isinstance(span, SpanImpl)
        span.end()
        tracer.on_span_end(span)
        assert tracer.get_active_span() is None

    def test_on_span_end_restores_parent_context(self):
        """Ending a child span should restore the parent as active."""
        tracer = _make_tracer()
        parent = tracer.start_span("parent")
        child = tracer.start_span("child", parent_span=parent)
        assert isinstance(child, SpanImpl)
        child.end()
        tracer.on_span_end(child)
        assert tracer.get_active_span() is parent

    def test_on_span_end_adds_to_finished_queue(self):
        """Ending a span should enqueue a telemetry dict."""
        tracer = _make_tracer()
        span = tracer.start_span("q-test")
        assert isinstance(span, SpanImpl)
        span.end()
        tracer.on_span_end(span)
        assert len(tracer._finished_spans) == 1
        finished = tracer._finished_spans[0]
        assert finished["operation_name"] == "q-test"
        assert finished["service_id"] == "svc-test"
        assert finished["deployment_id"] == "dep-test"

    def test_start_span_child_inherits_trace_id_from_parent(self):
        """A child span created via Tracer should share the parent trace_id."""
        tracer = _make_tracer()
        parent = tracer.start_span("parent")
        child = tracer.start_span("child", parent_span=parent)
        assert isinstance(parent, SpanImpl)
        assert isinstance(child, SpanImpl)
        assert child.trace_id == parent.trace_id
        assert child.parent_span_id == parent.span_id

    def test_start_span_inherits_context_implicitly(self):
        """Without parent_span, Tracer should use current context."""
        tracer = _make_tracer()
        parent = tracer.start_span("parent")
        # Do not pass parent_span; Tracer should pick up the current context
        child = tracer.start_span("implicit-child")
        assert isinstance(parent, SpanImpl)
        assert isinstance(child, SpanImpl)
        assert child.trace_id == parent.trace_id
        assert child.parent_span_id == parent.span_id

    @pytest.mark.asyncio
    async def test_flush_sends_spans(self):
        """flush() should send finished spans via transport."""
        tracer = _make_tracer()
        span = tracer.start_span("flush-test")
        assert isinstance(span, SpanImpl)
        span.end()
        tracer.on_span_end(span)

        await tracer.flush()

        tracer.transport.send_spans.assert_awaited_once()
        args = tracer.transport.send_spans.call_args[0][0]
        assert len(args) == 1
        assert args[0]["operation_name"] == "flush-test"

    @pytest.mark.asyncio
    async def test_flush_clears_queue(self):
        """flush() should clear the finished spans list."""
        tracer = _make_tracer()
        span = tracer.start_span("clear-test")
        assert isinstance(span, SpanImpl)
        span.end()
        tracer.on_span_end(span)

        await tracer.flush()
        assert len(tracer._finished_spans) == 0

    @pytest.mark.asyncio
    async def test_flush_noop_when_empty(self):
        """flush() with no finished spans should not call transport."""
        tracer = _make_tracer()
        await tracer.flush()
        tracer.transport.send_spans.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_close_flushes_and_clears(self):
        """close() should flush pending spans and clear active tracking."""
        tracer = _make_tracer()
        span = tracer.start_span("close-test")
        assert isinstance(span, SpanImpl)
        span.end()
        tracer.on_span_end(span)

        await tracer.close()
        assert len(tracer._finished_spans) == 0
        assert len(tracer._active_spans) == 0


# ===================================================================
# 11. Global Tracer Functions
# ===================================================================

class TestGlobalTracer:
    """Test module-level get_tracer / set_tracer / start_span / get_active_span."""

    def test_get_tracer_initially_none(self):
        """Global tracer should be None before set_tracer is called."""
        assert get_tracer() is None

    def test_set_and_get_tracer(self):
        """set_tracer should make the tracer available via get_tracer."""
        tracer = _make_tracer()
        set_tracer(tracer)
        assert get_tracer() is tracer

    def test_global_start_span_without_tracer_returns_noop(self):
        """start_span should return NoopSpan when no global tracer is set."""
        span = start_span("no-tracer")
        assert isinstance(span, NoopSpan)

    def test_global_start_span_with_tracer(self):
        """start_span should delegate to the global tracer."""
        tracer = _make_tracer()
        set_tracer(tracer)
        span = start_span("global-op", op="http.request")
        assert isinstance(span, SpanImpl)
        assert span.name == "global-op"

    def test_global_get_active_span_without_tracer(self):
        """get_active_span should return None when no tracer is set."""
        assert get_active_span() is None

    def test_global_get_active_span_with_tracer(self):
        """get_active_span should return the active span."""
        tracer = _make_tracer()
        set_tracer(tracer)
        span = start_span("active-global")
        assert get_active_span() is span


# ===================================================================
# 12. Sampling
# ===================================================================

class TestSampling:
    """Test Tracer._should_sample at boundary rates."""

    def test_sample_rate_one_always_samples(self):
        """sample_rate=1.0 should always produce SpanImpl."""
        tracer = _make_tracer(sample_rate=1.0)
        for _ in range(50):
            assert isinstance(tracer.start_span("s"), SpanImpl)

    def test_sample_rate_zero_never_samples(self):
        """sample_rate=0.0 should always produce NoopSpan."""
        tracer = _make_tracer(sample_rate=0.0)
        for _ in range(50):
            assert isinstance(tracer.start_span("s"), NoopSpan)

    def test_sample_rate_zero_overrides_parent_sampled_flag(self):
        """sample_rate=0 should return NoopSpan even with a sampled parent.

        The implementation checks sample_rate <= 0 before inspecting parent
        context, so a zero rate always suppresses sampling.
        """
        tracer = _make_tracer(sample_rate=0.0)
        ctx = SpanContext(trace_id="a" * 32, span_id="b" * 16, trace_flags=TRACE_FLAG_SAMPLED)
        set_current_context(ctx)
        span = tracer.start_span("should-noop")
        assert isinstance(span, NoopSpan)

    def test_fractional_sample_rate_respects_parent_sampled_flag(self):
        """With a fractional rate (0 < rate < 1), parent sampled flag forces sampling."""
        tracer = _make_tracer(sample_rate=0.001)  # Very low but > 0
        ctx = SpanContext(trace_id="a" * 32, span_id="b" * 16, trace_flags=TRACE_FLAG_SAMPLED)
        set_current_context(ctx)
        # Parent has SAMPLED flag so this should always produce a real span
        for _ in range(20):
            span = tracer.start_span("should-sample")
            assert isinstance(span, SpanImpl)


# ===================================================================
# 13. to_telemetry_span
# ===================================================================

class TestToTelemetrySpan:
    """Test SpanImpl.to_telemetry_span conversion."""

    def test_telemetry_span_fields(self):
        """to_telemetry_span should map all fields correctly."""
        span = SpanImpl(
            name="tel-test",
            kind=SpanKind.CLIENT,
            trace_id="a" * 32,
            parent_span_id="b" * 16,
            attributes={"key": "val"},
        )
        span.set_status(SpanStatusCode.OK)
        span.add_event("evt")
        span.end()

        ts = span.to_telemetry_span("svc-1", "dep-1")

        assert ts.trace_id == "a" * 32
        assert ts.span_id == span.span_id
        assert ts.parent_span_id == "b" * 16
        assert ts.service_id == "svc-1"
        assert ts.deployment_id == "dep-1"
        assert ts.operation_name == "tel-test"
        assert ts.span_kind == SpanKind.CLIENT
        assert ts.start_time_ns > 0
        assert ts.duration_ns > 0
        assert ts.status.code == SpanStatusCode.OK
        assert ts.attributes["key"] == "val"
        assert len(ts.events) == 1

    def test_telemetry_span_to_dict(self):
        """to_dict should produce a JSON-serializable dictionary."""
        span = SpanImpl(name="dict-test")
        span.end()
        ts = span.to_telemetry_span("svc", "dep")
        d = ts.to_dict()

        assert d["operation_name"] == "dict-test"
        assert d["service_id"] == "svc"
        assert d["span_kind"] == "internal"
        assert isinstance(d["status"], dict)
        assert isinstance(d["events"], list)

    def test_telemetry_span_to_dict_omits_none_parent(self):
        """parent_span_id should be absent from dict when None."""
        span = SpanImpl(name="no-parent")
        span.end()
        d = span.to_telemetry_span("svc", "dep").to_dict()
        assert "parent_span_id" not in d


# ===================================================================
# 14. NoopSpan
# ===================================================================

class TestNoopSpan:
    """Test NoopSpan does nothing harmful and returns sensible defaults."""

    def test_noop_is_not_recording(self):
        """NoopSpan should always report is_recording() as False."""
        span = NoopSpan()
        assert span.is_recording() is False

    def test_noop_operations_are_silent(self):
        """All mutating operations on NoopSpan should be no-ops."""
        span = NoopSpan()
        span.set_status(SpanStatusCode.ERROR, "msg")
        span.set_attribute("k", "v")
        span.set_attributes({"a": 1})
        span.add_event("e")
        span.end()
        # No assertions needed; just verifying no exceptions

    def test_noop_span_context_has_zero_flags(self):
        """NoopSpan context should have trace_flags=0 (not sampled)."""
        span = NoopSpan()
        ctx = span.span_context()
        assert ctx.trace_flags == TRACE_FLAG_NONE

    def test_noop_name(self):
        """NoopSpan name should be 'noop'."""
        span = NoopSpan()
        assert span.name == "noop"

    def test_noop_parent_span_id_none(self):
        """NoopSpan parent_span_id should be None."""
        span = NoopSpan()
        assert span.parent_span_id is None

    def test_noop_span_context_from_provided_context(self):
        """NoopSpan should use the provided SpanContext if given."""
        ctx = SpanContext(trace_id="c" * 32, span_id="d" * 16, trace_flags=0)
        span = NoopSpan(context=ctx)
        assert span.trace_id == "c" * 32
        assert span.span_id == "d" * 16

    def test_noop_as_context_manager(self):
        """NoopSpan should work as a context manager without error."""
        with NoopSpan() as span:
            span.set_attribute("ignored", True)


# ===================================================================
# 15. Context Propagation (inject / extract)
# ===================================================================

class TestContextPropagation:
    """Test inject_trace_context and extract_trace_context."""

    def test_inject_into_empty_headers(self):
        """inject should add traceparent to an empty dict."""
        ctx = SpanContext(
            trace_id="a" * 32,
            span_id="b" * 16,
            trace_flags=TRACE_FLAG_SAMPLED,
        )
        headers: dict[str, str] = {}
        inject_trace_context(headers, ctx)

        assert TRACEPARENT_HEADER in headers
        assert headers[TRACEPARENT_HEADER] == f"00-{'a' * 32}-{'b' * 16}-01"

    def test_inject_includes_tracestate_when_present(self):
        """inject should add tracestate header when context has trace_state."""
        ctx = SpanContext(
            trace_id="a" * 32,
            span_id="b" * 16,
            trace_flags=1,
            trace_state="vendor=abc",
        )
        headers: dict[str, str] = {}
        inject_trace_context(headers, ctx)

        assert headers.get(TRACESTATE_HEADER) == "vendor=abc"

    def test_inject_noop_when_no_context(self):
        """inject with no context and no current context should be a no-op."""
        headers: dict[str, str] = {}
        inject_trace_context(headers)
        assert TRACEPARENT_HEADER not in headers

    def test_inject_uses_current_context_if_not_provided(self):
        """inject without explicit context should use get_current_context."""
        ctx = SpanContext(trace_id="e" * 32, span_id="f" * 16, trace_flags=1)
        set_current_context(ctx)

        headers: dict[str, str] = {}
        inject_trace_context(headers)
        assert TRACEPARENT_HEADER in headers
        assert "e" * 32 in headers[TRACEPARENT_HEADER]

    def test_extract_valid_traceparent(self):
        """extract should parse a valid traceparent from headers."""
        headers = {
            "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        }
        ctx = extract_trace_context(headers)
        assert ctx is not None
        assert ctx.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert ctx.span_id == "00f067aa0ba902b7"

    def test_extract_with_tracestate(self):
        """extract should also capture the tracestate header."""
        headers = {
            "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            "tracestate": "vendor=opaque",
        }
        ctx = extract_trace_context(headers)
        assert ctx is not None
        assert ctx.trace_state == "vendor=opaque"

    def test_extract_missing_traceparent(self):
        """extract should return None when traceparent is absent."""
        assert extract_trace_context({}) is None

    def test_extract_invalid_traceparent(self):
        """extract should return None for a malformed traceparent."""
        headers = {"traceparent": "garbage"}
        assert extract_trace_context(headers) is None

    def test_extract_with_capitalized_header(self):
        """extract should handle capitalized 'Traceparent' header."""
        headers = {
            "Traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        }
        ctx = extract_trace_context(headers)
        assert ctx is not None
        assert ctx.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"

    def test_inject_extract_roundtrip(self):
        """Injecting then extracting should yield equivalent context."""
        original = SpanContext(
            trace_id="abcdef1234567890abcdef1234567890",
            span_id="1234567890abcdef",
            trace_flags=TRACE_FLAG_SAMPLED,
            trace_state="syntra=test",
        )
        headers: dict[str, str] = {}
        inject_trace_context(headers, original)

        recovered = extract_trace_context(headers)
        assert recovered is not None
        assert recovered.trace_id == original.trace_id
        assert recovered.span_id == original.span_id
        assert recovered.trace_flags == original.trace_flags
        assert recovered.trace_state == original.trace_state


# ===================================================================
# 16. @trace Decorator -- synchronous
# ===================================================================

class TestTraceDecoratorSync:
    """Test the @trace decorator on synchronous functions."""

    def test_trace_wraps_sync_function(self):
        """Decorated sync function should return the correct result."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="test")
        def add(a: int, b: int) -> int:
            return a + b

        result = add(3, 7)
        assert result == 10

    def test_trace_creates_span_for_sync(self):
        """Decorated sync function should create and finish a span."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="compute")
        def multiply(x: int, y: int) -> int:
            return x * y

        multiply(4, 5)
        assert len(tracer._finished_spans) == 1
        assert tracer._finished_spans[0]["operation_name"] == "multiply"

    def test_trace_default_name_is_function_name(self):
        """When no name is given, span name should be the function name."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace()
        def my_cool_func() -> str:
            return "ok"

        my_cool_func()
        assert tracer._finished_spans[0]["operation_name"] == "my_cool_func"

    def test_trace_custom_name(self):
        """Explicit name should override the function name."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(name="custom-name", op="custom")
        def foo() -> None:
            pass

        foo()
        assert tracer._finished_spans[0]["operation_name"] == "custom-name"

    def test_trace_captures_exception_sync(self):
        """Decorator should set ERROR status and re-raise exceptions."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="fail")
        def boom() -> None:
            raise RuntimeError("kaboom")

        with pytest.raises(RuntimeError, match="kaboom"):
            boom()

        assert len(tracer._finished_spans) == 1
        span_dict = tracer._finished_spans[0]
        assert span_dict["status"]["code"] == "error"
        assert span_dict["status"]["message"] == "kaboom"

    def test_trace_sets_ok_status_on_success_sync(self):
        """On success, the span status should be OK."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="ok")
        def succeed() -> str:
            return "done"

        succeed()
        assert tracer._finished_spans[0]["status"]["code"] == "ok"

    def test_trace_preserves_function_metadata(self):
        """functools.wraps should preserve __name__ and __doc__."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace()
        def documented_func() -> None:
            """This is my docstring."""
            pass

        assert documented_func.__name__ == "documented_func"
        assert documented_func.__doc__ == "This is my docstring."

    def test_trace_without_tracer_calls_function_directly(self):
        """When no tracer is set, decorator should just call the function."""
        # No tracer set
        @trace(op="noop")
        def simple() -> int:
            return 42

        assert simple() == 42

    def test_trace_with_attributes_sync(self):
        """Static attributes should appear on the span."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="attrs", attributes={"env": "test", "version": 2})
        def with_attrs() -> None:
            pass

        with_attrs()
        attrs = tracer._finished_spans[0]["attributes"]
        assert attrs["env"] == "test"
        assert attrs["version"] == 2


# ===================================================================
# 17. @trace Decorator -- asynchronous
# ===================================================================

class TestTraceDecoratorAsync:
    """Test the @trace decorator on async functions."""

    @pytest.mark.asyncio
    async def test_trace_wraps_async_function(self):
        """Decorated async function should return the correct result."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="async-test")
        async def async_add(a: int, b: int) -> int:
            return a + b

        result = await async_add(2, 3)
        assert result == 5

    @pytest.mark.asyncio
    async def test_trace_creates_span_for_async(self):
        """Decorated async function should create and finish a span."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="async-compute")
        async def async_multiply(x: int, y: int) -> int:
            return x * y

        await async_multiply(6, 7)
        assert len(tracer._finished_spans) == 1
        assert tracer._finished_spans[0]["operation_name"] == "async_multiply"

    @pytest.mark.asyncio
    async def test_trace_captures_exception_async(self):
        """Decorator should set ERROR status and re-raise async exceptions."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="async-fail")
        async def async_boom() -> None:
            raise ValueError("async-kaboom")

        with pytest.raises(ValueError, match="async-kaboom"):
            await async_boom()

        span_dict = tracer._finished_spans[0]
        assert span_dict["status"]["code"] == "error"
        assert span_dict["status"]["message"] == "async-kaboom"

    @pytest.mark.asyncio
    async def test_trace_sets_ok_status_on_success_async(self):
        """Async success should set OK status."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace(op="async-ok")
        async def async_succeed() -> str:
            return "done"

        await async_succeed()
        assert tracer._finished_spans[0]["status"]["code"] == "ok"

    @pytest.mark.asyncio
    async def test_trace_preserves_async_function_metadata(self):
        """functools.wraps should preserve async function metadata."""
        tracer = _make_tracer()
        set_tracer(tracer)

        @trace()
        async def async_documented() -> None:
            """Async docstring."""
            pass

        assert async_documented.__name__ == "async_documented"
        assert async_documented.__doc__ == "Async docstring."

    @pytest.mark.asyncio
    async def test_trace_without_tracer_async(self):
        """Without a tracer, decorator should just await the function."""

        @trace(op="noop-async")
        async def async_simple() -> int:
            return 99

        assert await async_simple() == 99


# ===================================================================
# 18. Current Context Management
# ===================================================================

class TestCurrentContext:
    """Test get_current_context / set_current_context / reset_current_context."""

    def test_initial_context_is_none(self):
        """Current context should be None initially."""
        assert get_current_context() is None

    def test_set_and_get_context(self):
        """set_current_context should make context available via get."""
        ctx = SpanContext(trace_id="a" * 32, span_id="b" * 16)
        set_current_context(ctx)
        assert get_current_context() is ctx

    def test_reset_context_with_token(self):
        """reset_current_context should restore the previous value."""
        ctx1 = SpanContext(trace_id="a" * 32, span_id="b" * 16)
        set_current_context(ctx1)

        ctx2 = SpanContext(trace_id="c" * 32, span_id="d" * 16)
        token = set_current_context(ctx2)
        assert get_current_context() is ctx2

        reset_current_context(token)
        assert get_current_context() is ctx1

    def test_set_context_to_none(self):
        """Setting context to None should clear it."""
        ctx = SpanContext(trace_id="a" * 32, span_id="b" * 16)
        set_current_context(ctx)
        set_current_context(None)
        assert get_current_context() is None
