/**
 * ClickHouse Client for Dashboard Queries
 *
 * Provides query helpers for traces, logs, and metrics stored in ClickHouse.
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client';

// Singleton client
let client: ClickHouseClient | null = null;

/**
 * Get or create the ClickHouse client
 */
export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'syntra_telemetry',
      username: process.env.CLICKHOUSE_USERNAME || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
    });
  }
  return client;
}

// Type definitions for query results
export interface TraceSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  service_id: string;
  deployment_id: string;
  operation_name: string;
  span_kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
  start_time: string;
  duration_ns: number;
  status_code: 'unset' | 'ok' | 'error';
  status_message: string;
  attributes: Record<string, string>;
  events: string;
  // Materialized columns
  http_method?: string;
  http_status_code?: number;
  http_route?: string;
}

export interface LogEntry {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  attributes: Record<string, string>;
  trace_id: string | null;
  span_id: string | null;
  source: 'stdout' | 'stderr' | 'sdk';
}

export interface MetricPoint {
  timestamp: string;
  service_id: string;
  server_id: string;
  metric_name: string;
  metric_type: 'gauge' | 'counter' | 'histogram';
  value: number;
  labels: Record<string, string>;
}

export interface AggregatedMetric {
  timestamp: string;
  service_id: string;
  server_id: string;
  metric_name: string;
  metric_type: string;
  min_value: number;
  max_value: number;
  avg_value: number;
  sum_value: number;
  count: number;
  labels: Record<string, string>;
}

// Query options
export interface TraceQueryOptions {
  serviceId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  minDurationMs?: number;
  operation?: string;
  statusCode?: 'unset' | 'ok' | 'error';
}

export interface LogQueryOptions {
  serviceId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  level?: string;
  search?: string;
  traceId?: string;
}

export interface MetricQueryOptions {
  serviceId?: string;
  serverId?: string;
  startTime?: Date;
  endTime?: Date;
  metricName?: string;
  aggregated?: boolean;
}

/**
 * Query traces with filtering
 */
export async function queryTraces(options: TraceQueryOptions = {}): Promise<TraceSpan[]> {
  const client = getClickHouseClient();

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.serviceId) {
    conditions.push('service_id = {serviceId:UUID}');
    params.serviceId = options.serviceId;
  }

  if (options.startTime) {
    conditions.push('start_time >= {startTime:DateTime64(9)}');
    params.startTime = options.startTime.toISOString().replace('T', ' ').replace('Z', '');
  }

  if (options.endTime) {
    conditions.push('start_time <= {endTime:DateTime64(9)}');
    params.endTime = options.endTime.toISOString().replace('T', ' ').replace('Z', '');
  }

  if (options.minDurationMs) {
    conditions.push('duration_ns >= {minDuration:UInt64}');
    params.minDuration = options.minDurationMs * 1_000_000;
  }

  if (options.operation) {
    conditions.push('operation_name LIKE {operation:String}');
    params.operation = `%${options.operation}%`;
  }

  if (options.statusCode) {
    conditions.push('status_code = {statusCode:String}');
    params.statusCode = options.statusCode;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const query = `
    SELECT
      trace_id,
      span_id,
      parent_span_id,
      service_id,
      deployment_id,
      operation_name,
      span_kind,
      start_time,
      duration_ns,
      status_code,
      status_message,
      attributes,
      events,
      http_method,
      http_status_code,
      http_route
    FROM traces
    ${whereClause}
    ORDER BY start_time DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  const result = await client.query({
    query,
    query_params: { ...params, limit, offset },
    format: 'JSONEachRow',
  });

  return result.json();
}

/**
 * Get a complete trace by ID (all spans)
 */
export async function getTraceById(traceId: string): Promise<TraceSpan[]> {
  const client = getClickHouseClient();

  const query = `
    SELECT
      trace_id,
      span_id,
      parent_span_id,
      service_id,
      deployment_id,
      operation_name,
      span_kind,
      start_time,
      duration_ns,
      status_code,
      status_message,
      attributes,
      events,
      http_method,
      http_status_code,
      http_route
    FROM traces
    WHERE trace_id = {traceId:String}
    ORDER BY start_time ASC
  `;

  const result = await client.query({
    query,
    query_params: { traceId },
    format: 'JSONEachRow',
  });

  return result.json();
}

/**
 * Query logs with filtering and full-text search
 */
export async function queryLogs(options: LogQueryOptions = {}): Promise<LogEntry[]> {
  const client = getClickHouseClient();

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.serviceId) {
    conditions.push('service_id = {serviceId:UUID}');
    params.serviceId = options.serviceId;
  }

  if (options.startTime) {
    conditions.push('timestamp >= {startTime:DateTime64(9)}');
    params.startTime = options.startTime.toISOString().replace('T', ' ').replace('Z', '');
  }

  if (options.endTime) {
    conditions.push('timestamp <= {endTime:DateTime64(9)}');
    params.endTime = options.endTime.toISOString().replace('T', ' ').replace('Z', '');
  }

  if (options.level) {
    conditions.push('level = {level:String}');
    params.level = options.level;
  }

  if (options.traceId) {
    conditions.push('trace_id = {traceId:String}');
    params.traceId = options.traceId;
  }

  if (options.search) {
    conditions.push('message ILIKE {search:String}');
    params.search = `%${options.search}%`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const query = `
    SELECT
      timestamp,
      service_id,
      deployment_id,
      level,
      message,
      attributes,
      trace_id,
      span_id,
      source
    FROM logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  const result = await client.query({
    query,
    query_params: { ...params, limit, offset },
    format: 'JSONEachRow',
  });

  return result.json();
}

/**
 * Query metrics (raw or aggregated)
 */
export async function queryMetrics(options: MetricQueryOptions = {}): Promise<(MetricPoint | AggregatedMetric)[]> {
  const client = getClickHouseClient();

  const table = options.aggregated ? 'metrics_1m' : 'metrics_raw';
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.serviceId) {
    conditions.push('service_id = {serviceId:UUID}');
    params.serviceId = options.serviceId;
  }

  if (options.serverId) {
    conditions.push('server_id = {serverId:UUID}');
    params.serverId = options.serverId;
  }

  if (options.startTime) {
    conditions.push('timestamp >= {startTime:DateTime}');
    params.startTime = options.startTime.toISOString().replace('T', ' ').slice(0, 19);
  }

  if (options.endTime) {
    conditions.push('timestamp <= {endTime:DateTime}');
    params.endTime = options.endTime.toISOString().replace('T', ' ').slice(0, 19);
  }

  if (options.metricName) {
    conditions.push('metric_name = {metricName:String}');
    params.metricName = options.metricName;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query: string;
  if (options.aggregated) {
    query = `
      SELECT
        timestamp,
        service_id,
        server_id,
        metric_name,
        metric_type,
        min_value,
        max_value,
        avg_value,
        sum_value,
        count,
        labels
      FROM ${table}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT 1000
    `;
  } else {
    query = `
      SELECT
        timestamp,
        service_id,
        server_id,
        metric_name,
        metric_type,
        value,
        labels
      FROM ${table}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT 1000
    `;
  }

  const result = await client.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
  });

  return result.json();
}

/**
 * Get trace statistics for a service
 */
export async function getTraceStats(
  serviceId: string,
  startTime: Date,
  endTime: Date
): Promise<{
  totalTraces: number;
  avgDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  errorRate: number;
}> {
  const client = getClickHouseClient();

  const query = `
    SELECT
      count(DISTINCT trace_id) as total_traces,
      avg(duration_ns) / 1000000 as avg_duration_ms,
      quantile(0.95)(duration_ns) / 1000000 as p95_duration_ms,
      quantile(0.99)(duration_ns) / 1000000 as p99_duration_ms,
      countIf(status_code = 'error') / count() * 100 as error_rate
    FROM traces
    WHERE service_id = {serviceId:UUID}
      AND start_time >= {startTime:DateTime64(9)}
      AND start_time <= {endTime:DateTime64(9)}
  `;

  const result = await client.query({
    query,
    query_params: {
      serviceId,
      startTime: startTime.toISOString().replace('T', ' ').replace('Z', ''),
      endTime: endTime.toISOString().replace('T', ' ').replace('Z', ''),
    },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{
    total_traces: string;
    avg_duration_ms: string;
    p95_duration_ms: string;
    p99_duration_ms: string;
    error_rate: string;
  }[]>();

  const row = rows[0] || {};

  return {
    totalTraces: parseInt(row.total_traces || '0', 10),
    avgDurationMs: parseFloat(row.avg_duration_ms || '0'),
    p95DurationMs: parseFloat(row.p95_duration_ms || '0'),
    p99DurationMs: parseFloat(row.p99_duration_ms || '0'),
    errorRate: parseFloat(row.error_rate || '0'),
  };
}
