/**
 * Traces Writer
 *
 * Writes span data to ClickHouse traces table.
 */

import type { TelemetrySpan } from '../types';
import type { ClickHouseWriter } from '../clickhouse';
import type { TelemetryMessage } from '../consumer';

interface TraceRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_id: string;
  deployment_id: string;
  operation_name: string;
  span_kind: string;
  start_time: string;
  duration_ns: number;
  status_code: string;
  status_message: string;
  attributes: Record<string, string>;
  events: string;
}

export class TracesWriter {
  private clickhouse: ClickHouseWriter;
  private buffer: TraceRow[] = [];
  private batchSize: number;

  constructor(clickhouse: ClickHouseWriter, batchSize: number = 1000) {
    this.clickhouse = clickhouse;
    this.batchSize = batchSize;
  }

  async write(messages: TelemetryMessage[]): Promise<void> {
    for (const message of messages) {
      const span = message.data as unknown as TelemetrySpan;

      // Convert span to ClickHouse row format
      const row: TraceRow = {
        trace_id: span.trace_id,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id || '',
        service_id: span.service_id,
        deployment_id: span.deployment_id,
        operation_name: span.operation_name,
        span_kind: span.span_kind,
        start_time: this.nsToDateTime(span.start_time_ns),
        duration_ns: span.duration_ns,
        status_code: span.status.code,
        status_message: span.status.message || '',
        attributes: this.convertAttributes(span.attributes),
        events: JSON.stringify(span.events || []),
      };

      this.buffer.push(row);
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const rows = this.buffer;
    this.buffer = [];

    await this.clickhouse.insert('traces', rows as unknown as Record<string, unknown>[]);
  }

  /**
   * Convert nanosecond timestamp to ClickHouse DateTime64
   */
  private nsToDateTime(ns: number): string {
    const ms = ns / 1_000_000;
    return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Convert attributes to string map for ClickHouse
   */
  private convertAttributes(
    attrs: Record<string, string | number | boolean>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      result[key] = String(value);
    }
    return result;
  }
}
