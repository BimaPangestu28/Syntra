/**
 * Local type definitions for telemetry data.
 * Mirrors @syntra/contracts telemetry types to avoid build dependency issues.
 */

export interface TelemetrySpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service_id: string;
  deployment_id: string;
  operation_name: string;
  span_kind: SpanKind;
  start_time_ns: number;
  duration_ns: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events?: SpanEvent[];
  links?: SpanLink[];
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface SpanStatus {
  code: 'unset' | 'ok' | 'error';
  message?: string;
}

export interface SpanEvent {
  name: string;
  timestamp_ns: number;
  attributes: Record<string, string | number | boolean>;
}

export interface SpanLink {
  trace_id: string;
  span_id: string;
  attributes: Record<string, string | number | boolean>;
}

export interface TelemetryLog {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  level: LogLevel;
  message: string;
  attributes: Record<string, unknown>;
  trace_id?: string;
  span_id?: string;
  source: 'stdout' | 'stderr' | 'sdk';
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface TelemetryMetric {
  timestamp: string;
  service_id: string;
  server_id?: string;
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  histogram_buckets?: HistogramBucket[];
}

export type MetricType = 'gauge' | 'counter' | 'histogram';

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface TelemetryError {
  timestamp: string;
  service_id: string;
  deployment_id: string;
  error_type: string;
  message: string;
  stack_trace?: string;
  fingerprint: string;
  trace_id?: string;
  span_id?: string;
  user_id?: string;
  attributes?: Record<string, unknown>;
}
