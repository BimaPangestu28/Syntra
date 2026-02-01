import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  init,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setExtra,
  addBreadcrumb,
  startSpan,
  flush,
  close,
  getClient,
} from '../src/client';

describe('Syntra Client', () => {
  const mockDSN = 'syn://pk_test123@localhost:3000/proj_test';

  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(async () => {
    await close();
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize the client with valid DSN', () => {
      init({ dsn: mockDSN });
      const client = getClient();
      expect(client).not.toBeNull();
    });

    it('should throw error for invalid DSN', () => {
      expect(() => init({ dsn: 'invalid' })).toThrow();
    });

    it('should apply custom options', () => {
      init({
        dsn: mockDSN,
        environment: 'testing',
        release: '1.0.0',
        debug: true,
      });

      const client = getClient();
      const options = client?.getOptions();
      expect(options?.environment).toBe('testing');
      expect(options?.release).toBe('1.0.0');
      expect(options?.debug).toBe(true);
    });
  });

  describe('captureException', () => {
    beforeEach(() => {
      init({ dsn: mockDSN, debug: false });
    });

    it('should capture an Error object', () => {
      const error = new Error('Test error');
      const eventId = captureException(error);
      expect(eventId).toBeTruthy();
      expect(typeof eventId).toBe('string');
    });

    it('should capture a string as error', () => {
      const eventId = captureException('String error');
      expect(eventId).toBeTruthy();
    });

    it('should respect sampling rate of 0', () => {
      close();
      init({ dsn: mockDSN, errorsSampleRate: 0 });
      const eventId = captureException(new Error('Test'));
      expect(eventId).toBe('');
    });
  });

  describe('captureMessage', () => {
    beforeEach(() => {
      init({ dsn: mockDSN });
    });

    it('should capture a message', () => {
      const eventId = captureMessage('Test message');
      expect(eventId).toBeTruthy();
    });

    it('should accept severity level', () => {
      const eventId = captureMessage('Warning message', 'warn');
      expect(eventId).toBeTruthy();
    });
  });

  describe('context management', () => {
    beforeEach(() => {
      init({ dsn: mockDSN });
    });

    it('should set user context', () => {
      setUser({ id: 'user-123', email: 'test@example.com' });
      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.user?.id).toBe('user-123');
      expect(scope?.user?.email).toBe('test@example.com');
    });

    it('should clear user context with null', () => {
      setUser({ id: 'user-123' });
      setUser(null);
      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.user).toBeUndefined();
    });

    it('should set tags', () => {
      setTag('environment', 'test');
      setTag('version', '1.0');
      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.tags['environment']).toBe('test');
      expect(scope?.tags['version']).toBe('1.0');
    });

    it('should set extra context', () => {
      setExtra('customData', { foo: 'bar' });
      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.extra['customData']).toEqual({ foo: 'bar' });
    });
  });

  describe('breadcrumbs', () => {
    beforeEach(() => {
      init({ dsn: mockDSN, maxBreadcrumbs: 5 });
    });

    it('should add breadcrumbs', () => {
      addBreadcrumb({
        type: 'http',
        category: 'fetch',
        message: 'GET /api/test',
        level: 'info',
      });

      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.breadcrumbs.length).toBe(1);
      expect(scope?.breadcrumbs[0].message).toBe('GET /api/test');
    });

    it('should respect max breadcrumbs limit', () => {
      for (let i = 0; i < 10; i++) {
        addBreadcrumb({
          type: 'default',
          category: 'test',
          message: `Breadcrumb ${i}`,
          level: 'info',
        });
      }

      const client = getClient();
      const scope = client?.getScope();
      expect(scope?.breadcrumbs.length).toBe(5);
      expect(scope?.breadcrumbs[0].message).toBe('Breadcrumb 5');
    });
  });

  describe('tracing', () => {
    beforeEach(() => {
      init({ dsn: mockDSN, tracesSampleRate: 1 });
    });

    it('should create a span', () => {
      const span = startSpan({ name: 'test-operation' });
      expect(span).toBeTruthy();
      expect(span.name).toBe('test-operation');
      expect(span.isRecording()).toBe(true);
      span.end();
      expect(span.isRecording()).toBe(false);
    });

    it('should set span attributes', () => {
      const span = startSpan({ name: 'test' });
      span.setAttribute('key', 'value');
      span.setAttributes({ num: 42, bool: true });
      span.end();
    });

    it('should add span events', () => {
      const span = startSpan({ name: 'test' });
      span.addEvent('checkpoint', { step: 1 });
      span.end();
    });

    it('should set span status', () => {
      const span = startSpan({ name: 'test' });
      span.setStatus({ code: 'error', message: 'Failed' });
      span.end();
    });

    it('should return noop span when sampling rate is 0', async () => {
      await close();
      init({ dsn: mockDSN, tracesSampleRate: 0 });
      const span = startSpan({ name: 'test' });
      expect(span.isRecording()).toBe(false);
    });
  });

  describe('flush and close', () => {
    beforeEach(() => {
      init({ dsn: mockDSN });
    });

    it('should flush pending data', async () => {
      captureMessage('Test');
      await flush();
      // Should not throw
    });

    it('should close the client', async () => {
      await close();
      const client = getClient();
      expect(client).toBeNull();
    });
  });
});
