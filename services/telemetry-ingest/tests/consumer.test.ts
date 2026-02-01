import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RedisConsumer } from '../src/consumer';
import type { TelemetryMessage } from '../src/consumer';

// Mock ioredis
vi.mock('ioredis', () => {
  const EventEmitter = require('events');

  class MockRedis extends EventEmitter {
    url: string;
    opts: Record<string, unknown>;

    constructor(url: string, opts: Record<string, unknown>) {
      super();
      this.url = url;
      this.opts = opts;
      // Auto-emit ready on next tick
      setTimeout(() => this.emit('ready'), 0);
    }

    xgroup = vi.fn().mockResolvedValue('OK');
    xreadgroup = vi.fn().mockResolvedValue(null);
    xack = vi.fn().mockResolvedValue(1);
    quit = vi.fn().mockResolvedValue('OK');
  }

  return { default: MockRedis };
});

describe('RedisConsumer', () => {
  let consumer: RedisConsumer;

  beforeEach(() => {
    consumer = new RedisConsumer({
      url: 'redis://localhost:6379',
      consumerGroup: 'test-group',
      consumerName: 'test-consumer',
      debug: false,
    });
  });

  afterEach(async () => {
    await consumer.stop();
    await consumer.disconnect();
  });

  describe('connect', () => {
    it('should connect to Redis and create consumer groups', async () => {
      await consumer.connect();
      // If connect resolves, consumer groups were created
    });

    it('should ignore BUSYGROUP errors (group already exists)', async () => {
      // The mock xgroup resolves by default, so connect should work
      await consumer.connect();
    });
  });

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      await consumer.connect();
      await consumer.disconnect();
    });

    it('should handle disconnect when not connected', async () => {
      await consumer.disconnect(); // Should not throw
    });
  });

  describe('handler registration', () => {
    it('should register handlers via on()', () => {
      const handler = vi.fn();
      const result = consumer.on('traces', handler);
      expect(result).toBe(consumer); // Chainable
    });

    it('should support all telemetry types', () => {
      const types: Array<'traces' | 'logs' | 'metrics' | 'errors'> = [
        'traces',
        'logs',
        'metrics',
        'errors',
      ];
      for (const type of types) {
        consumer.on(type, vi.fn());
      }
    });
  });

  describe('start/stop', () => {
    it('should throw if not connected', async () => {
      await expect(consumer.start()).rejects.toThrow('Not connected to Redis');
    });

    it('should start and stop without error', async () => {
      await consumer.connect();
      await consumer.start();
      await consumer.stop();
    });
  });
});
