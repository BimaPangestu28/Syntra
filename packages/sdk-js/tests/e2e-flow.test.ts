/**
 * E2E Integration Tests
 *
 * Verifies the full flow from SDK initialization through to the HTTP
 * transport sending correctly formatted payloads to the API endpoint.
 * Uses a mock HTTP server to capture and verify all outgoing requests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, captureException, captureMessage, setUser, setTag, startSpan, flush, close, addBreadcrumb } from '../src/client';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: {
    batch_id: string;
    timestamp: string;
    errors?: unknown[];
    spans?: unknown[];
    logs?: unknown[];
  };
}

// Capture all outgoing fetch calls
let capturedRequests: CapturedRequest[] = [];

function setupMockFetch() {
  capturedRequests = [];

  global.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k.toLowerCase()] = v;
      }
    }

    const body = init?.body ? JSON.parse(init.body as string) : {};

    capturedRequests.push({
      url: String(url),
      method: init?.method || 'GET',
      headers,
      body,
    });

    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success":true}'),
    };
  });
}

describe('E2E: SDK → API Flow', () => {
  beforeEach(() => {
    setupMockFetch();
  });

  afterEach(async () => {
    await close();
    vi.clearAllMocks();
  });

  describe('Initialization and Error Capture', () => {
    it('should send error to correct endpoint with proper headers', async () => {
      init({
        dsn: 'syn://pk_test_key@localhost:3000/proj_test_123',
        environment: 'test',
        release: '1.0.0',
        serviceId: 'test-service',
        deploymentId: 'dep-1',
      });

      captureException(new Error('Test error'));
      await flush();

      expect(capturedRequests.length).toBeGreaterThanOrEqual(1);

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      expect(errorReq).toBeDefined();

      // Verify endpoint URL
      expect(errorReq!.url).toBe('http://localhost:3000/api/v1/telemetry/errors');

      // Verify method
      expect(errorReq!.method).toBe('POST');

      // Verify auth headers
      expect(errorReq!.headers['x-syntra-key']).toBe('pk_test_key');
      expect(errorReq!.headers['x-syntra-project']).toBe('proj_test_123');
      expect(errorReq!.headers['content-type']).toBe('application/json');

      // Verify batch envelope
      expect(errorReq!.body.batch_id).toBeDefined();
      expect(errorReq!.body.timestamp).toBeDefined();
      expect(new Date(errorReq!.body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include complete error payload structure', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        environment: 'production',
        release: '2.0.0',
        serviceId: 'api-service',
        deploymentId: 'dep-prod',
      });

      const testError = new TypeError('Cannot read properties of null');
      captureException(testError, {
        tags: { module: 'auth', severity: 'high' },
        extra: { userId: '123', endpoint: '/api/login' },
      });
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      expect(errorReq).toBeDefined();

      const errors = errorReq!.body.errors as Array<{
        id: string;
        service_id: string;
        deployment_id: string;
        timestamp: string;
        type: string;
        message: string;
        stack_trace: unknown[];
        breadcrumbs: unknown[];
        context: {
          environment: string;
          release: string;
          tags: Record<string, string>;
          extra: Record<string, unknown>;
        };
        fingerprint: string[];
      }>;

      expect(errors).toHaveLength(1);
      const err = errors[0];

      // Required fields
      expect(err.id).toBeDefined();
      expect(err.service_id).toBe('api-service');
      expect(err.deployment_id).toBe('dep-prod');
      expect(err.timestamp).toBeDefined();
      expect(err.type).toBe('TypeError');
      expect(err.message).toBe('Cannot read properties of null');
      expect(Array.isArray(err.stack_trace)).toBe(true);
      expect(Array.isArray(err.breadcrumbs)).toBe(true);

      // Context
      expect(err.context.environment).toBe('production');
      expect(err.context.release).toBe('2.0.0');
      expect(err.context.tags).toMatchObject({ module: 'auth', severity: 'high' });
      expect(err.context.extra).toMatchObject({ userId: '123', endpoint: '/api/login' });

      // Fingerprint
      expect(Array.isArray(err.fingerprint)).toBe(true);
      expect(err.fingerprint.length).toBeGreaterThan(0);
    });

    it('should include user context in error payload', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
      });

      setUser({ id: 'user-456', email: 'test@example.com', username: 'testuser' });
      captureException(new Error('User error'));
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      const errors = errorReq!.body.errors as Array<{
        context: { user?: { id: string; email: string; username: string } };
      }>;

      expect(errors[0].context.user).toEqual({
        id: 'user-456',
        email: 'test@example.com',
        username: 'testuser',
      });
    });

    it('should include tags in error payload', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
      });

      setTag('version', '3.0');
      setTag('region', 'us-east-1');
      captureException(new Error('Tagged error'));
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      const errors = errorReq!.body.errors as Array<{
        context: { tags: Record<string, string> };
      }>;

      expect(errors[0].context.tags).toMatchObject({
        version: '3.0',
        region: 'us-east-1',
      });
    });
  });

  describe('Message Capture', () => {
    it('should send message events via error endpoint', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
      });

      captureMessage('User logged in', 'info');
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      expect(errorReq).toBeDefined();

      const errors = errorReq!.body.errors as Array<{
        type: string;
        message: string;
        context: { tags: Record<string, string> };
      }>;

      expect(errors[0].type).toBe('Message');
      expect(errors[0].message).toBe('User logged in');
      expect(errors[0].context.tags.level).toBe('info');
    });
  });

  describe('Breadcrumbs', () => {
    it('should include breadcrumbs with error events', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
      });

      addBreadcrumb({ category: 'navigation', message: 'Navigated to /dashboard', level: 'info' });
      addBreadcrumb({ category: 'http', message: 'GET /api/users', level: 'info', data: { status: 200 } });
      addBreadcrumb({ category: 'ui', message: 'Button clicked', level: 'info' });

      captureException(new Error('After breadcrumbs'));
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      const errors = errorReq!.body.errors as Array<{
        breadcrumbs: Array<{
          category: string;
          message: string;
          level: string;
          timestamp: string;
        }>;
      }>;

      expect(errors[0].breadcrumbs).toHaveLength(3);
      expect(errors[0].breadcrumbs[0].category).toBe('navigation');
      expect(errors[0].breadcrumbs[1].category).toBe('http');
      expect(errors[0].breadcrumbs[2].category).toBe('ui');
    });
  });

  describe('Tracing', () => {
    it('should send spans to correct endpoint with proper structure', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
        deploymentId: 'dep-1',
        tracesSampleRate: 1.0,
      });

      const span = startSpan({ name: 'processOrder', op: 'function' });
      span.setAttribute('order.id', 'order-789');
      span.setStatus({ code: 'ok' });
      span.end();

      // First flush: tracer queues spans into transport, transport may miss them
      await flush();
      // Second flush: transport now sends the queued spans
      await flush();

      const spanReq = capturedRequests.find((r) => r.url.includes('/spans'));
      expect(spanReq).toBeDefined();

      // Verify URL and headers
      expect(spanReq!.url).toBe('http://localhost:3000/api/v1/telemetry/spans');
      expect(spanReq!.headers['x-syntra-key']).toBe('pk_test');
      expect(spanReq!.headers['x-syntra-project']).toBe('proj_test');

      // Verify span payload
      const spans = spanReq!.body.spans as Array<{
        trace_id: string;
        span_id: string;
        service_id: string;
        deployment_id: string;
        operation_name: string;
        span_kind: string;
        start_time_ns: number;
        duration_ns: number;
        status: { code: string };
        attributes: Record<string, string | number | boolean>;
      }>;

      expect(spans.length).toBeGreaterThanOrEqual(1);
      const s = spans[0];
      expect(s.trace_id).toBeDefined();
      expect(s.span_id).toBeDefined();
      expect(s.service_id).toBe('test-svc');
      expect(s.deployment_id).toBe('dep-1');
      expect(s.operation_name).toBe('processOrder');
      expect(s.start_time_ns).toBeGreaterThan(0);
      expect(s.duration_ns).toBeGreaterThanOrEqual(0);
      expect(s.status.code).toBe('ok');
    });

    it('should propagate trace context to child spans', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
        tracesSampleRate: 1.0,
      });

      const parentSpan = startSpan({ name: 'parentOp', op: 'http' });
      const parentTraceId = parentSpan.traceId;
      const parentSpanId = parentSpan.spanId;

      const childSpan = startSpan({ name: 'childOp', op: 'db' });
      const childTraceId = childSpan.traceId;

      childSpan.end();
      parentSpan.end();
      // First flush: tracer queues spans into transport
      await flush();
      // Second flush: transport sends them to network
      await flush();

      // Child should share parent's trace ID
      expect(childTraceId).toBe(parentTraceId);

      // Verify spans were sent
      const spanReq = capturedRequests.find((r) => r.url.includes('/spans'));
      expect(spanReq).toBeDefined();

      const spans = spanReq!.body.spans as Array<{
        trace_id: string;
        span_id: string;
        parent_span_id?: string;
      }>;

      expect(spans.length).toBeGreaterThanOrEqual(2);
      const allTraceIds = spans.map((s) => s.trace_id);
      expect(new Set(allTraceIds).size).toBe(1); // All same trace
    });
  });

  describe('Sampling', () => {
    it('should not send events when sample rate is 0', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
        errorsSampleRate: 0,
        tracesSampleRate: 0,
      });

      captureException(new Error('Sampled out'));
      captureMessage('Also sampled out');
      await flush();

      // No requests should be made (except possibly empty flushes)
      const errorReqs = capturedRequests.filter((r) => r.url.includes('/errors'));
      expect(errorReqs).toHaveLength(0);
    });
  });

  describe('beforeSend Hook', () => {
    it('should drop events when beforeSend returns null', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
        beforeSend: () => null,
      });

      captureException(new Error('Should be dropped'));
      await flush();

      const errorReqs = capturedRequests.filter((r) => r.url.includes('/errors'));
      expect(errorReqs).toHaveLength(0);
    });

    it('should allow modifying events in beforeSend', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
        beforeSend: (event) => ({
          ...event,
          message: 'modified: ' + event.message,
        }),
      });

      captureException(new Error('original'));
      await flush();

      const errorReq = capturedRequests.find((r) => r.url.includes('/errors'));
      const errors = errorReq!.body.errors as Array<{ message: string }>;
      expect(errors[0].message).toBe('modified: original');
    });
  });

  describe('Multiple Events Batching', () => {
    it('should batch multiple errors in a single request', async () => {
      init({
        dsn: 'syn://pk_test@localhost:3000/proj_test',
        serviceId: 'test-svc',
      });

      for (let i = 0; i < 5; i++) {
        captureException(new Error(`Error ${i}`));
      }
      await flush();

      // All errors should be batched
      const errorReqs = capturedRequests.filter((r) => r.url.includes('/errors'));
      expect(errorReqs.length).toBeGreaterThanOrEqual(1);

      const totalErrors = errorReqs.reduce(
        (sum, req) => sum + ((req.body.errors as unknown[])?.length || 0),
        0
      );
      expect(totalErrors).toBe(5);
    });
  });

  describe('DSN Parsing in Full Flow', () => {
    it('should use HTTPS for non-localhost hosts', async () => {
      init({
        dsn: 'syn://pk_live_key@api.syntra.io/proj_live',
        serviceId: 'prod-svc',
      });

      captureMessage('Production message');
      await flush();

      const req = capturedRequests.find((r) => r.url.includes('/errors'));
      expect(req).toBeDefined();
      expect(req!.url.startsWith('https://api.syntra.io/')).toBe(true);
    });

    it('should use HTTP for localhost', async () => {
      init({
        dsn: 'syn://pk_test@localhost:4000/proj_dev',
        serviceId: 'dev-svc',
      });

      captureMessage('Dev message');
      await flush();

      const req = capturedRequests.find((r) => r.url.includes('/errors'));
      expect(req!.url.startsWith('http://localhost:4000/')).toBe(true);
    });
  });
});
