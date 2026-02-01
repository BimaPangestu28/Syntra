import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogsWriter } from '../src/writers/logs';
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

function makeLogMessage(overrides: Record<string, unknown> = {}): TelemetryMessage {
  return {
    id: 'msg-1',
    type: 'log',
    timestamp: new Date().toISOString(),
    serviceId: 'svc-1',
    data: {
      timestamp: '2024-01-15T10:30:00.123Z',
      service_id: 'svc-1',
      deployment_id: 'dep-1',
      level: 'info',
      message: 'Request processed successfully',
      attributes: { request_id: 'req-123', duration_ms: 45 },
      trace_id: 'trace-abc',
      span_id: 'span-123',
      source: 'sdk',
      ...overrides,
    },
  };
}

describe('LogsWriter', () => {
  let writer: LogsWriter;
  let clickhouse: ReturnType<typeof createMockClickHouse>;

  beforeEach(() => {
    clickhouse = createMockClickHouse();
    writer = new LogsWriter(clickhouse as unknown as ClickHouseWriter, 5);
  });

  it('should buffer messages and not flush below batch size', async () => {
    await writer.write([makeLogMessage()]);
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should auto-flush when buffer reaches batch size', async () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeLogMessage({ message: `Log ${i}` })
    );
    await writer.write(messages);
    expect(clickhouse.insert).toHaveBeenCalledOnce();
    expect(clickhouse.insert).toHaveBeenCalledWith(
      'logs',
      expect.arrayContaining([
        expect.objectContaining({ message: 'Log 0', level: 'info' }),
      ])
    );
  });

  it('should flush remaining buffer on explicit flush', async () => {
    await writer.write([makeLogMessage()]);
    await writer.flush();
    expect(clickhouse.insert).toHaveBeenCalledOnce();
  });

  it('should not flush when buffer is empty', async () => {
    await writer.flush();
    expect(clickhouse.insert).not.toHaveBeenCalled();
  });

  it('should convert ISO timestamp to ClickHouse DateTime64 format', async () => {
    const msg = makeLogMessage({ timestamp: '2024-01-15T10:30:00.123Z' });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].timestamp).toBe('2024-01-15 10:30:00.123');
  });

  it('should convert object attributes to JSON strings', async () => {
    const msg = makeLogMessage({
      attributes: {
        simple: 'value',
        nested: { key: 'nested-value' },
        number: 42,
      },
    });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].attributes).toEqual({
      simple: 'value',
      nested: '{"key":"nested-value"}',
      number: '42',
    });
  });

  it('should handle null trace_id and span_id', async () => {
    const msg = makeLogMessage({ trace_id: undefined, span_id: undefined });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].trace_id).toBeNull();
    expect(rows[0].span_id).toBeNull();
  });

  it('should preserve trace correlation fields', async () => {
    const msg = makeLogMessage({ trace_id: 'trace-xyz', span_id: 'span-456' });
    await writer.write([msg]);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows[0].trace_id).toBe('trace-xyz');
    expect(rows[0].span_id).toBe('span-456');
  });

  it('should handle all log levels', async () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    const messages = levels.map((level) => makeLogMessage({ level }));
    await writer.write(messages);
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows.map((r: { level: string }) => r.level)).toEqual(levels);
  });

  it('should handle all source types', async () => {
    for (const source of ['stdout', 'stderr', 'sdk']) {
      const msg = makeLogMessage({ source });
      await writer.write([msg]);
    }
    await writer.flush();

    const rows = (clickhouse.insert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rows.map((r: { source: string }) => r.source)).toEqual(['stdout', 'stderr', 'sdk']);
  });
});
