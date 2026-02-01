import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
  getCurrentContext,
  setCurrentContext,
  injectTraceContext,
  extractTraceContext,
  TRACEPARENT_HEADER,
} from '../src/tracing/context';
import { SpanImpl, NoopSpan } from '../src/tracing/span';

describe('Trace Context', () => {
  describe('ID generation', () => {
    it('should generate valid trace IDs', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);
    });

    it('should generate valid span IDs', () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(200);
    });
  });

  describe('traceparent parsing', () => {
    it('should parse valid traceparent header', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const context = parseTraceparent(header);

      expect(context).not.toBeNull();
      expect(context?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(context?.spanId).toBe('00f067aa0ba902b7');
      expect(context?.traceFlags).toBe(1);
    });

    it('should return null for invalid header', () => {
      expect(parseTraceparent('')).toBeNull();
      expect(parseTraceparent('invalid')).toBeNull();
      expect(parseTraceparent('00-123-456-01')).toBeNull();
      // All zeros trace ID
      expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull();
      // All zeros span ID
      expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBeNull();
    });

    it('should reject unsupported version', () => {
      expect(parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBeNull();
    });
  });

  describe('traceparent creation', () => {
    it('should create valid traceparent header', () => {
      const context = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 1,
      };

      const header = createTraceparent(context);
      expect(header).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('should handle unsampled flag', () => {
      const context = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 0,
      };

      const header = createTraceparent(context);
      expect(header.endsWith('-00')).toBe(true);
    });
  });

  describe('context injection/extraction', () => {
    it('should inject trace context into headers', () => {
      const context = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 1,
      };

      const headers: Record<string, string> = {};
      injectTraceContext(headers, context);

      expect(headers[TRACEPARENT_HEADER]).toBeDefined();
      expect(headers[TRACEPARENT_HEADER]).toContain(context.traceId);
    });

    it('should extract trace context from headers', () => {
      const headers = {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      };

      const context = extractTraceContext(headers);
      expect(context).not.toBeNull();
      expect(context?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });
  });

  describe('current context management', () => {
    afterEach(() => {
      setCurrentContext(null);
    });

    it('should get and set current context', () => {
      expect(getCurrentContext()).toBeNull();

      const context = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        traceFlags: 1,
      };

      setCurrentContext(context);
      expect(getCurrentContext()).toEqual(context);

      setCurrentContext(null);
      expect(getCurrentContext()).toBeNull();
    });
  });
});

describe('Span', () => {
  describe('SpanImpl', () => {
    it('should create span with correct properties', () => {
      const span = new SpanImpl({ name: 'test-operation' });

      expect(span.name).toBe('test-operation');
      expect(span.traceId).toHaveLength(32);
      expect(span.spanId).toHaveLength(16);
      expect(span.kind).toBe('internal');
      expect(span.isRecording()).toBe(true);
    });

    it('should inherit trace ID from parent', () => {
      const parentTraceId = generateTraceId();
      const parentSpanId = generateSpanId();

      const span = new SpanImpl({
        name: 'child-span',
        traceId: parentTraceId,
        parentSpanId: parentSpanId,
      });

      expect(span.traceId).toBe(parentTraceId);
      expect(span.parentSpanId).toBe(parentSpanId);
    });

    it('should set and get attributes', () => {
      const span = new SpanImpl({ name: 'test' });

      span.setAttribute('key', 'value');
      span.setAttributes({ num: 42, bool: true });

      expect(span.attributes).toEqual({
        key: 'value',
        num: 42,
        bool: true,
      });
    });

    it('should add events', () => {
      const span = new SpanImpl({ name: 'test' });

      span.addEvent('checkpoint');
      span.addEvent('error', { code: 500 });

      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('checkpoint');
      expect(span.events[1].name).toBe('error');
      expect(span.events[1].attributes.code).toBe(500);
    });

    it('should set status', () => {
      const span = new SpanImpl({ name: 'test' });

      span.setStatus({ code: 'error', message: 'Failed' });

      expect(span.status.code).toBe('error');
      expect(span.status.message).toBe('Failed');
    });

    it('should end span and calculate duration', () => {
      const span = new SpanImpl({ name: 'test' });
      expect(span.isRecording()).toBe(true);

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait
      }

      span.end();

      expect(span.isRecording()).toBe(false);
      expect(span.durationNs).toBeGreaterThan(0);
    });

    it('should not modify span after end', () => {
      const span = new SpanImpl({ name: 'test' });
      span.end();

      span.setAttribute('new', 'value');
      span.setStatus({ code: 'ok' });
      span.addEvent('after-end');

      expect(span.attributes['new']).toBeUndefined();
      expect(span.status.code).toBe('unset');
      expect(span.events).toHaveLength(0);
    });

    it('should convert to telemetry span', () => {
      const span = new SpanImpl({ name: 'test' });
      span.setAttribute('http.method', 'GET');
      span.end();

      const telemetrySpan = span.toTelemetrySpan('svc-123', 'dep-456');

      expect(telemetrySpan.service_id).toBe('svc-123');
      expect(telemetrySpan.deployment_id).toBe('dep-456');
      expect(telemetrySpan.operation_name).toBe('test');
      expect(telemetrySpan.attributes['http.method']).toBe('GET');
    });
  });

  describe('NoopSpan', () => {
    it('should not record anything', () => {
      const span = new NoopSpan();

      expect(span.isRecording()).toBe(false);
      span.setAttribute('key', 'value');
      span.setStatus({ code: 'ok' });
      span.addEvent('event');
      span.end();

      // Should not throw
    });
  });
});
