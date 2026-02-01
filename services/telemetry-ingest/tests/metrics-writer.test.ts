import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsWriter } from '../src/writers/metrics';
import type { ClickHouseWriter } from '../src/clickhouse';
import type { TelemetryMessage } from '../src/consumer';

function createMockClickHouse() {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    close: vi.fn(),
    query: vi.fn(),
    exec: vi.fn(),
  } as unknown as ClickHouseWriter;
}

function makeMetricMessage(overrides: Record<string, unknown> = {}): TelemetryMessage {
  return {
    id: 'msg-1',
    type: 'metric',
    timestamp: new Date().toISOString(),
    serviceId: 'svc-1',
    data: {
      timestamp: '2024-01-15T10:30:00.000Z',
      service_id: 'svc-1',
      server_id: 'srv-1',
      name: 'http_request_duration_seconds',
      type: 'gauge',
      value: 0.125,
      labels: { method: 'GET', path: '/api/users', status: '200' },
      ...overrides,
    },
  };
}

describe('MetricsWriter', () => {
  let writer: MetricsWriter;
  let clickhouse: ReturnType<typeof createMockClickHouse>;

  beforeEach(() => {
    clickhouse = createMockClickHouse();
    writer = new MetricsWriter(clickhouse as unknown as ClickHouseWriter, 5);
  });

  it('should buffer messages and not flush below batch size', async () => {
    await writer.write([makeMetricMessage()]);
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should auto-flush when buffer reaches batch size', async () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeMetricMessage({ name: `metric_${i}` })
    );
    await writer.write(messages);
    expect(clickhouse.insert).toHaveBeenCalledOnce();
    expect(clickhouse.insert).toHaveBeenCalledWith(
      'metrics_raw',
      expect.arrayContaining([
        expect.objectContaining({ metric_name: 'metric_0', metric_type: 'gauge' }),
      ])
    );
  });

  it('should flush remaining buffer on explicit flush', async () => {
    await writer.write([makeMetricMessage()]);
    await writer.flush();
    expect(clickhouse.insert).toHaveBeenCalledOnce();
  });

  it('should not flush when buffer is empty', async () => {
    await writer.flush();
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should convert ISO timestamp to ClickHouse DateTime format', async () => {
    const msg = makeMetricMessage({ timestamp: '2024-01-15T10:30:00.000Z' });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // DateTime (not DateTime64) - truncated to seconds
    expect(rows[0].timestamp).toBe('2024-01-15 10:30:00');
  });

  it('should handle gauge metrics', async () => {
    const msg = makeMetricMessage({ type: 'gauge', value: 42.5 });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].metric_type).toBe('gauge');
    expect(rows[0].value).toBe(42.5);
  });

  it('should handle counter metrics', async () => {
    const msg = makeMetricMessage({ type: 'counter', value: 100, name: 'requests_total' });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].metric_type).toBe('counter');
    expect(rows[0].metric_name).toBe('requests_total');
    expect(rows[0].value).toBe(100);
  });

  it('should expand histogram buckets into separate rows', async () => {
    const msg = makeMetricMessage({
      type: 'histogram',
      name: 'request_duration',
      histogram_buckets: [
        { le: 0.1, count: 5 },
        { le: 0.5, count: 10 },
        { le: 1.0, count: 12 },
        { le: Infinity, count: 15 },
      ],
      labels: { method: 'GET' },
    });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows).toHaveLength(4);

    // Each bucket becomes its own row
    expect(rows[0]).toMatchObject({
      metric_name: 'request_duration_bucket',
      metric_type: 'histogram',
      value: 5,
      labels: { method: 'GET', le: '0.1' },
    });
    expect(rows[1]).toMatchObject({
      value: 10,
      labels: { method: 'GET', le: '0.5' },
    });
    expect(rows[3]).toMatchObject({
      value: 15,
      labels: { method: 'GET', le: 'Infinity' },
    });
  });

  it('should preserve labels on regular metrics', async () => {
    const msg = makeMetricMessage({
      labels: { region: 'us-east-1', service: 'api' },
    });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].labels).toEqual({ region: 'us-east-1', service: 'api' });
  });

  it('should handle missing server_id with empty string', async () => {
    const msg = makeMetricMessage({ server_id: undefined });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].server_id).toBe('');
  });

  it('should handle multiple writes accumulating in buffer', async () => {
    await writer.write([makeMetricMessage({ name: 'metric_a' })]);
    await writer.write([makeMetricMessage({ name: 'metric_b' })]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows).toHaveLength(2);
    expect(rows[0].metric_name).toBe('metric_a');
    expect(rows[1].metric_name).toBe('metric_b');
  });
});
