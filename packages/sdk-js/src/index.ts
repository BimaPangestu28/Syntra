// Main exports
export {
  init,
  getClient,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  setTag,
  setExtra,
  startSpan,
  getActiveSpan,
  flush,
  close,
  SyntraClientImpl,
} from './client';

// Types
export type {
  SyntraOptions,
  SyntraClient,
  User,
  ScopeData,
  Span,
  SpanOptions,
  SpanContext,
  Transport,
  Integration,
  IntegrationOptions,
  CaptureContext,
  ParsedDSN,
  TelemetryError,
  TelemetrySpan,
  TelemetryLog,
  TelemetryBreadcrumb,
  TelemetryStackFrame,
  TelemetryErrorContext,
  SpanKind,
  SpanStatus,
  SpanEvent,
  LogLevel,
  Severity,
} from './types';

// Utilities
export { parseDSN, buildIngestUrl, isValidDSN } from './utils/dsn';
export { generateFingerprint, hashFingerprint } from './utils/fingerprint';
export { parseStackTrace } from './utils/stack-trace';

// Transport
export { BaseTransport, HttpTransport, OtlpTransport } from './transport';
export { createHttpTransport } from './transport/http';
export { createOtlpTransport } from './transport/otlp';

// Tracing
export {
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
  getCurrentContext,
  setCurrentContext,
  injectTraceContext,
  extractTraceContext,
  TRACEPARENT_HEADER,
  TRACESTATE_HEADER,
} from './tracing';
export { Tracer } from './tracing/tracer';
export { SpanImpl, NoopSpan } from './tracing/span';

// Scope
export { Scope, ScopeManager } from './scope';

// Breadcrumbs
export {
  BreadcrumbBuffer,
  createBreadcrumb,
  createHttpBreadcrumb,
  createConsoleBreadcrumb,
  createNavigationBreadcrumb,
  createUIBreadcrumb,
} from './breadcrumbs/buffer';

// Integrations
export {
  BrowserErrorsIntegration,
  browserErrorsIntegration,
  ConsoleIntegration,
  consoleIntegration,
  FetchIntegration,
  fetchIntegration,
} from './integrations';

// Convenience namespace export (Sentry-like API)
import * as Syntra from './client';
export { Syntra };

// Default export
export default Syntra;
