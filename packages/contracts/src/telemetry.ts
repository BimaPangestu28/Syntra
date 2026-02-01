// Telemetry Data Types (SDK -> Agent -> Control Plane)

// ===========================================
// Telemetry Batch
// ===========================================

export interface TelemetryBatch {
  batch_id: string;
  agent_id: string;
  compression: 'zstd' | 'none';
  data: TelemetryData | string; // string if compressed
}

export interface TelemetryData {
  errors: TelemetryError[];
  traces: TelemetrySpan[];
  logs: TelemetryLog[];
  metrics: TelemetryMetric[];
  health_checks: TelemetryHealthCheck[];
}

// ===========================================
// Errors
// ===========================================

export interface TelemetryError {
  id: string;
  service_id: string;
  deployment_id: string;
  timestamp: string;
  type: string;
  message: string;
  stack_trace: TelemetryStackFrame[];
  breadcrumbs: TelemetryBreadcrumb[];
  context: TelemetryErrorContext;
  fingerprint: string[];
}

export interface TelemetryStackFrame {
  filename: string;
  function: string;
  lineno: number;
  colno?: number;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app: boolean;
  module?: string;
}

export interface TelemetryBreadcrumb {
  timestamp: string;
  type: 'http' | 'navigation' | 'ui' | 'console' | 'error' | 'query' | 'default';
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
}

export interface TelemetryErrorContext {
  environment: string;
  release: string;
  user?: {
    id: string;
    email?: string;
    username?: string;
  };
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  request?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
  browser?: {
    name: string;
    version: string;
  };
  os?: {
    name: string;
    version: string;
  };
  device?: {
    family: string;
    model?: string;
    brand?: string;
  };
}

// ===========================================
// Traces (OpenTelemetry compatible)
// ===========================================

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
  events: SpanEvent[];
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
  attributes?: Record<string, string | number | boolean>;
}

// ===========================================
// Logs
// ===========================================

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

// ===========================================
// Metrics
// ===========================================

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

// ===========================================
// Health Checks
// ===========================================

export interface TelemetryHealthCheck {
  service_id: string;
  timestamp: string;
  is_healthy: boolean;
  status_code?: number;
  response_time_ms: number;
  error?: string;
}

// ===========================================
// SDK Configuration
// ===========================================

export interface SyntraSDKConfig {
  dsn: string;
  environment?: string;
  release?: string;
  traces_sample_rate?: number;
  profiles_sample_rate?: number;
  errors_sample_rate?: number;
  integrations?: SDKIntegrations;
  send_default_pii?: boolean;
  before_send?: (event: TelemetryError) => TelemetryError | null;
}

export interface SDKIntegrations {
  http?: boolean;
  database?: boolean;
  framework?: boolean;
  console?: boolean;
}

// ===========================================
// OTLP Export Format
// ===========================================

export interface OTLPExportRequest {
  resource_spans?: OTLPResourceSpans[];
  resource_logs?: OTLPResourceLogs[];
  resource_metrics?: OTLPResourceMetrics[];
}

export interface OTLPResourceSpans {
  resource: OTLPResource;
  scope_spans: OTLPScopeSpans[];
}

export interface OTLPResource {
  attributes: OTLPAttribute[];
}

export interface OTLPAttribute {
  key: string;
  value: OTLPAttributeValue;
}

export interface OTLPAttributeValue {
  string_value?: string;
  int_value?: number;
  double_value?: number;
  bool_value?: boolean;
}

export interface OTLPScopeSpans {
  scope: OTLPInstrumentationScope;
  spans: OTLPSpan[];
}

export interface OTLPInstrumentationScope {
  name: string;
  version?: string;
}

export interface OTLPSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: number;
  start_time_unix_nano: string;
  end_time_unix_nano: string;
  attributes: OTLPAttribute[];
  status: {
    code: number;
    message?: string;
  };
  events: OTLPSpanEvent[];
}

export interface OTLPSpanEvent {
  name: string;
  time_unix_nano: string;
  attributes: OTLPAttribute[];
}

export interface OTLPResourceLogs {
  resource: OTLPResource;
  scope_logs: OTLPScopeLogs[];
}

export interface OTLPScopeLogs {
  scope: OTLPInstrumentationScope;
  log_records: OTLPLogRecord[];
}

export interface OTLPLogRecord {
  time_unix_nano: string;
  severity_number: number;
  severity_text: string;
  body: OTLPAttributeValue;
  attributes: OTLPAttribute[];
  trace_id?: string;
  span_id?: string;
}

export interface OTLPResourceMetrics {
  resource: OTLPResource;
  scope_metrics: OTLPScopeMetrics[];
}

export interface OTLPScopeMetrics {
  scope: OTLPInstrumentationScope;
  metrics: OTLPMetric[];
}

export interface OTLPMetric {
  name: string;
  description?: string;
  unit?: string;
  gauge?: OTLPGauge;
  sum?: OTLPSum;
  histogram?: OTLPHistogram;
}

export interface OTLPGauge {
  data_points: OTLPNumberDataPoint[];
}

export interface OTLPSum {
  data_points: OTLPNumberDataPoint[];
  aggregation_temporality: number;
  is_monotonic: boolean;
}

export interface OTLPHistogram {
  data_points: OTLPHistogramDataPoint[];
  aggregation_temporality: number;
}

export interface OTLPNumberDataPoint {
  time_unix_nano: string;
  as_double?: number;
  as_int?: string;
  attributes: OTLPAttribute[];
}

export interface OTLPHistogramDataPoint {
  time_unix_nano: string;
  count: string;
  sum: number;
  bucket_counts: string[];
  explicit_bounds: number[];
  attributes: OTLPAttribute[];
}
