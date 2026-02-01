/**
 * Syntra SDK Type Definitions
 *
 * These types are compatible with @syntra/contracts but defined locally
 * to avoid circular dependency issues during build.
 */

// ===========================================
// Telemetry Types (compatible with contracts)
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
// SDK Types
// ===========================================

/**
 * DSN parsed components
 */
export interface ParsedDSN {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

/**
 * Syntra SDK configuration options
 */
export interface SyntraOptions {
  /** DSN in format: syn://<public_key>@<host>/<project_id> */
  dsn: string;
  /** Environment name (e.g., 'production', 'staging') */
  environment?: string;
  /** Application release/version */
  release?: string;
  /** Service ID for this application */
  serviceId?: string;
  /** Deployment ID for this deployment */
  deploymentId?: string;
  /** Sample rate for traces (0.0 to 1.0) */
  tracesSampleRate?: number;
  /** Sample rate for errors (0.0 to 1.0) */
  errorsSampleRate?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum breadcrumbs to keep */
  maxBreadcrumbs?: number;
  /** Enable sending PII */
  sendDefaultPii?: boolean;
  /** Integrations to enable */
  integrations?: IntegrationOptions;
  /** Transport type */
  transport?: 'http' | 'otlp';
  /** Custom OTLP endpoint (for local agent) */
  otlpEndpoint?: string;
  /** Before send hook for errors */
  beforeSend?: (event: TelemetryError) => TelemetryError | null;
  /** Before send hook for transactions */
  beforeSendTransaction?: (span: TelemetrySpan) => TelemetrySpan | null;
}

/**
 * Integration options
 */
export interface IntegrationOptions {
  /** Capture browser errors (window.onerror, unhandledrejection) */
  browserErrors?: boolean;
  /** Capture console messages as breadcrumbs */
  console?: boolean;
  /** Instrument fetch/XHR requests */
  http?: boolean;
}

/**
 * User context
 */
export interface User {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

/**
 * Scope for enriching events
 */
export interface ScopeData {
  user?: User;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  breadcrumbs: TelemetryBreadcrumb[];
  fingerprint?: string[];
}

/**
 * Span context for propagation
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Span start options
 */
export interface SpanOptions {
  name: string;
  op?: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  parentSpan?: Span;
}

/**
 * Active span interface
 */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTime: number;
  readonly kind: SpanKind;

  /** Set span status */
  setStatus(status: SpanStatus): void;
  /** Set attribute */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Set multiple attributes */
  setAttributes(attrs: Record<string, string | number | boolean>): void;
  /** Add event */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  /** End the span */
  end(): void;
  /** Check if span is recording */
  isRecording(): boolean;
  /** Get span context for propagation */
  spanContext(): SpanContext;
}

/**
 * Transport interface for sending telemetry
 */
export interface Transport {
  /** Send error event */
  sendError(error: TelemetryError): Promise<void>;
  /** Send spans */
  sendSpans(spans: TelemetrySpan[]): Promise<void>;
  /** Send logs */
  sendLogs(logs: TelemetryLog[]): Promise<void>;
  /** Flush pending data */
  flush(timeout?: number): Promise<void>;
}

/**
 * Integration interface
 */
export interface Integration {
  /** Integration name */
  name: string;
  /** Setup the integration */
  setup(client: SyntraClient): void;
  /** Teardown the integration */
  teardown?(): void;
}

/**
 * Main Syntra client interface
 */
export interface SyntraClient {
  /** Get current options */
  getOptions(): SyntraOptions;
  /** Get current scope */
  getScope(): ScopeData;
  /** Capture exception */
  captureException(error: Error | unknown, context?: Partial<TelemetryErrorContext>): string;
  /** Capture message */
  captureMessage(message: string, level?: LogLevel): string;
  /** Add breadcrumb */
  addBreadcrumb(breadcrumb: Omit<TelemetryBreadcrumb, 'timestamp'>): void;
  /** Set user */
  setUser(user: User | null): void;
  /** Set tag */
  setTag(key: string, value: string): void;
  /** Set extra context */
  setExtra(key: string, value: unknown): void;
  /** Start a new span */
  startSpan(options: SpanOptions): Span;
  /** Get active span */
  getActiveSpan(): Span | undefined;
  /** Flush pending data */
  flush(timeout?: number): Promise<void>;
  /** Close the client */
  close(): Promise<void>;
}

/**
 * Severity levels for messages
 */
export type Severity = LogLevel;

/**
 * Capture context for errors and messages
 */
export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: User;
  fingerprint?: string[];
  level?: LogLevel;
  request?: TelemetryErrorContext['request'];
}
