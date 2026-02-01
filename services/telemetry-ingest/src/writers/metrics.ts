/**
 * Metrics Writer
 *
 * Writes metric data to ClickHouse metrics_raw table.
 * Aggregation to metrics_1m is handled by ClickHouse materialized view.
 */

import type { TelemetryMetric } from '../types';
import type { ClickHouseWriter } from '../clickhouse';
import type { TelemetryMessage } from '../consumer';

interface MetricRow {
  timestamp: string;
  service_id: string;
  server_id: string;
  metric_name: string;
  metric_type: string;
  value: number;
  labels: Record<string, string>;
}

export class MetricsWriter {
  private clickhouse: ClickHouseWriter;
  private buffer: MetricRow[] = [];
  private batchSize: number;

  constructor(clickhouse: ClickHouseWriter, batchSize: number = 1000) {
    this.clickhouse = clickhouse;
    this.batchSize = batchSize;
  }

  async write(messages: TelemetryMessage[]): Promise<void> {
    for (const message of messages) {
      const metric = message.data as unknown as TelemetryMetric;

      // Handle histogram buckets
      if (metric.type === 'histogram' && metric.histogram_buckets) {
        for (const bucket of metric.histogram_buckets) {
          const row: MetricRow = {
            timestamp: this.toDateTime(metric.timestamp),
            service_id: metric.service_id,
            server_id: metric.server_id || '',
            metric_name: `${metric.name}_bucket`,
            metric_type: 'histogram',
            value: bucket.count,
            labels: {
              ...metric.labels,
              le: String(bucket.le),
            },
          };
          this.buffer.push(row);
        }
      } else {
        // Regular metric
        const row: MetricRow = {
          timestamp: this.toDateTime(metric.timestamp),
          service_id: metric.service_id,
          server_id: metric.server_id || '',
          metric_name: metric.name,
          metric_type: metric.type,
          value: metric.value,
          labels: metric.labels,
        };
        this.buffer.push(row);
      }
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

    await this.clickhouse.insert('metrics_raw', rows as unknown as Record<string, unknown>[]);
  }

  /**
   * Convert ISO timestamp to ClickHouse DateTime format
   */
  private toDateTime(timestamp: string): string {
    // ClickHouse DateTime (not DateTime64) format
    return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19);
  }
}
