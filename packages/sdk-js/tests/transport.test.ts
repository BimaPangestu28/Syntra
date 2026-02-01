import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpTransport, createHttpTransport } from '../src/transport/http';
import { parseDSN } from '../src/utils/dsn';

describe('HTTP Transport', () => {
  let transport: HttpTransport;

  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });

    transport = createHttpTransport('localhost:3000', 'pk_test123', 'proj_test', {
      flushInterval: 0, // Disable auto-flush for tests
    });
  });

  afterEach(() => {
    transport.stop();
    vi.clearAllMocks();
  });

  describe('sendError', () => {
    it('should queue error and flush on batch size', async () => {
      const error = {
        id: 'test-error-id',
        service_id: 'svc-123',
        deployment_id: 'dep-123',
        timestamp: new Date().toISOString(),
        type: 'Error',
        message: 'Test error',
        stack_trace: [],
        breadcrumbs: [],
        context: {
          environment: 'test',
          release: '1.0.0',
          tags: {},
          extra: {},
        },
        fingerprint: ['Error', 'Test error'],
      };

      await transport.sendError(error);
      await transport.flush();

      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('sendSpans', () => {
    it('should queue spans and flush', async () => {
      const spans = [
        {
          trace_id: 'trace-123',
          span_id: 'span-123',
          service_id: 'svc-123',
          deployment_id: 'dep-123',
          operation_name: 'test',
          span_kind: 'internal' as const,
          start_time_ns: Date.now() * 1_000_000,
          duration_ns: 1_000_000,
          status: { code: 'ok' as const },
          attributes: {},
          events: [],
        },
      ];

      await transport.sendSpans(spans);
      await transport.flush();

      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
      });

      transport = createHttpTransport('localhost:3000', 'pk_test', 'proj_test', {
        flushInterval: 0,
        maxRetries: 3,
      });

      const error = {
        id: 'test',
        service_id: 'svc',
        deployment_id: 'dep',
        timestamp: new Date().toISOString(),
        type: 'Error',
        message: 'Test',
        stack_trace: [],
        breadcrumbs: [],
        context: { environment: 'test', release: '', tags: {}, extra: {} },
        fingerprint: [],
      };

      await transport.sendError(error);
      await transport.flush();

      // Should have retried
      expect(attempts).toBe(3);
    });
  });
});

describe('DSN Parsing', () => {
  it('should parse valid DSN', () => {
    const dsn = parseDSN('syn://pk_abc123@syntra.io/proj_xyz');
    expect(dsn.protocol).toBe('syn');
    expect(dsn.publicKey).toBe('pk_abc123');
    expect(dsn.host).toBe('syntra.io');
    expect(dsn.projectId).toBe('proj_xyz');
  });

  it('should parse HTTPS DSN', () => {
    const dsn = parseDSN('https://pk_abc123@api.syntra.io/proj_xyz');
    expect(dsn.protocol).toBe('https');
    expect(dsn.host).toBe('api.syntra.io');
  });

  it('should throw for invalid DSN', () => {
    expect(() => parseDSN('')).toThrow('DSN is required');
    expect(() => parseDSN('invalid')).toThrow('Invalid DSN format');
    expect(() => parseDSN('syn://host/project')).toThrow('Invalid DSN format');
  });
});
