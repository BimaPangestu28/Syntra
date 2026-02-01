import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TracesWriter } from '../src/writers/traces';
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

function makeSpanMessage(overrides: Record<string, unknown> = {}): TelemetryMessage {
  return {
    id: 'msg-1',
    type: 'trace',
    timestamp: new Date().toISOString(),
    serviceId: 'svc-1',
    data: {
      trace_id: 'trace-abc',
      span_id: 'span-123',
      parent_span_id: 'span-000',
      service_id: 'svc-1',
      deployment_id: 'dep-1',
      operation_name: 'GET /api/users',
      span_kind: 'server',
      start_time_ns: 1700000000000000000,
      duration_ns: 5000000,
      status: { code: 'ok' },
      attributes: { 'http.method': 'GET', 'http.status_code': 200 },
      events: [{ name: 'log', timestamp_ns: 1700000000001000000, attributes: { message: 'handled' } }],
      ...overrides,
    },
  };
}

describe('TracesWriter', () => {
  let writer: TracesWriter;
  let clickhouse: ReturnType<typeof createMockClickHouse>;

  beforeEach(() => {
    clickhouse = createMockClickHouse();
    writer = new TracesWriter(clickhouse as unknown as ClickHouseWriter, 5);
  });

  it('should buffer messages and not flush below batch size', async () => {
    await writer.write([makeSpanMessage()]);
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should auto-flush when buffer reaches batch size', async () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeSpanMessage({ span_id: `span-${i}` })
    );
    await writer.write(messages);
    expect(clickhouse.insert).toHaveBeenCalledOnce();
    expect(clickhouse.insert).toHaveBeenCalledWith(
      'traces',
      expect.arrayContaining([
        expect.objectContaining({ span_id: 'span-0', trace_id: 'trace-abc' }),
      ])
    );
  });

  it('should flush remaining buffer on explicit flush', async () => {
    await writer.write([makeSpanMessage()]);
    expect(clickhouse.insert).not.toHaveBeenCalled();

    await writer.flush();
    expect(clickhouse.insert).toHaveBeenCalledOnce();
  });

  it('should not flush when buffer is empty', async () => {
    await writer.flush();
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should convert nanosecond timestamps to DateTime64 format', async () => {
    // 1700000000000 ms = 2023-11-14T22:13:20.000Z
    const msg = makeSpanMessage({ start_time_ns: 1700000000000000000 });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].start_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('should convert attributes to string values', async () => {
    const msg = makeSpanMessage({
      attributes: { 'http.status_code': 200, 'http.method': 'GET', 'cached': true },
    });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].attributes).toEqual({
      'http.status_code': '200',
      'http.method': 'GET',
      'cached': 'true',
    });
  });

  it('should serialize events to JSON string', async () => {
    const events = [{ name: 'exception', timestamp_ns: 123, attributes: { type: 'Error' } }];
    const msg = makeSpanMessage({ events });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(rows[0].events)).toEqual(events);
  });

  it('should handle empty parent_span_id', async () => {
    const msg = makeSpanMessage({ parent_span_id: undefined });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].parent_span_id).toBe('');
  });

  it('should handle empty status message', async () => {
    const msg = makeSpanMessage({ status: { code: 'error' } });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].status_code).toBe('error');
    expect(rows[0].status_message).toBe('');
  });

  it('should handle multiple writes accumulating in buffer', async () => {
    await writer.write([makeSpanMessage({ span_id: 'a' })]);
    await writer.write([makeSpanMessage({ span_id: 'b' })]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows).toHaveLength(2);
  });
});
