/**
 * Logs Writer
 *
 * Writes log data to ClickHouse logs table.
 */

import type { TelemetryLog } from '../types';
import type { ClickHouseWriter } from '../clickhouse';
import type { TelemetryMessage } from '../consumer';

interface LogRow {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  level: string;
  message: string;
  attributes: Record<string, string>;
  trace_id: string | null;
  span_id: string | null;
  source: string;
}

export class LogsWriter {
  private clickhouse: ClickHouseWriter;
  private buffer: LogRow[] = [];
  private batchSize: number;

  constructor(clickhouse: ClickHouseWriter, batchSize: number = 1000) {
    this.clickhouse = clickhouse;
    this.batchSize = batchSize;
  }

  async write(messages: TelemetryMessage[]): Promise<void> {
    for (const message of messages) {
      const log = message.data as unknown as TelemetryLog;

      // Convert log to ClickHouse row format
      const row: LogRow = {
        timestamp: this.toDateTime(log.timestamp),
        service_id: log.service_id,
        deployment_id: log.deployment_id,
        level: log.level,
        message: log.message,
        attributes: this.convertAttributes(log.attributes),
        trace_id: log.trace_id || null,
        span_id: log.span_id || null,
        source: log.source,
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

    await this.clickhouse.insert('logs', rows as unknown as Record<string, unknown>[]);
  }

  /**
   * Convert ISO timestamp to ClickHouse DateTime64 format
   */
  private toDateTime(timestamp: string): string {
    return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Convert attributes to string map for ClickHouse
   */
  private convertAttributes(attrs: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'object') {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = String(value);
      }
    }
    return result;
  }
}
