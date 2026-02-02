/**
 * Errors Writer
 *
 * Writes error data to ClickHouse errors table.
 */

import type { TelemetryError } from '../types';
import type { ClickHouseWriter } from '../clickhouse';
import type { TelemetryMessage } from '../consumer';

interface ErrorRow {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  error_type: string;
  message: string;
  stack_trace: string;
  fingerprint: string;
  trace_id: string | null;
  span_id: string | null;
  user_id: string | null;
  attributes: Record<string, string>;
}

export class ErrorsWriter {
  private clickhouse: ClickHouseWriter;
  private buffer: ErrorRow[] = [];
  private batchSize: number;

  constructor(clickhouse: ClickHouseWriter, batchSize: number = 1000) {
    this.clickhouse = clickhouse;
    this.batchSize = batchSize;
  }

  async write(messages: TelemetryMessage[]): Promise<void> {
    for (const message of messages) {
      const error = message.data as unknown as TelemetryError;

      const row: ErrorRow = {
        timestamp: this.toDateTime(error.timestamp),
        service_id: error.service_id,
        deployment_id: error.deployment_id,
        error_type: error.error_type,
        message: error.message,
        stack_trace: error.stack_trace || '',
        fingerprint: error.fingerprint,
        trace_id: error.trace_id || null,
        span_id: error.span_id || null,
        user_id: error.user_id || null,
        attributes: this.convertAttributes(error.attributes || {}),
      };

      this.buffer.push(row);
    }

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const rows = this.buffer;
    this.buffer = [];

    await this.clickhouse.insert('errors', rows as unknown as Record<string, unknown>[]);
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
