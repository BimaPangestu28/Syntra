import type { SpanContext } from '../types';

/**
 * W3C Trace Context header names
 */
export const TRACEPARENT_HEADER = 'traceparent';
export const TRACESTATE_HEADER = 'tracestate';

/**
 * Trace flags
 */
export const TRACE_FLAG_NONE = 0x00;
export const TRACE_FLAG_SAMPLED = 0x01;

/**
 * Generate a random trace ID (32 hex characters = 16 bytes)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random span ID (16 hex characters = 8 bytes)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse a W3C traceparent header
 * Format: version-traceId-spanId-traceFlags
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function parseTraceparent(header: string): SpanContext | null {
  if (!header) return null;

  const parts = header.trim().split('-');
  if (parts.length !== 4) return null;

  const [version, traceId, spanId, flagsHex] = parts;

  // Only support version 00
  if (version !== '00') return null;

  // Validate trace ID (32 hex chars, not all zeros)
  if (!/^[0-9a-f]{32}$/i.test(traceId) || traceId === '00000000000000000000000000000000') {
    return null;
  }

  // Validate span ID (16 hex chars, not all zeros)
  if (!/^[0-9a-f]{16}$/i.test(spanId) || spanId === '0000000000000000') {
    return null;
  }

  // Parse trace flags
  const traceFlags = parseInt(flagsHex, 16);
  if (isNaN(traceFlags)) return null;

  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags,
  };
}

/**
 * Create a W3C traceparent header from span context
 */
export function createTraceparent(context: SpanContext): string {
  const version = '00';
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `${version}-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse a W3C tracestate header
 * Format: key1=value1,key2=value2
 */
export function parseTracestate(header: string): Map<string, string> {
  const state = new Map<string, string>();
  if (!header) return state;

  const pairs = header.split(',');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      state.set(key, value);
    }
  }

  return state;
}

/**
 * Create a W3C tracestate header from map
 */
export function createTracestate(state: Map<string, string>): string {
  const pairs: string[] = [];
  for (const [key, value] of state) {
    pairs.push(`${key}=${value}`);
  }
  return pairs.join(',');
}

/**
 * Context storage for the current span
 * Uses a simple variable for sync operations
 * For async operations, consider using AsyncLocalStorage in Node.js
 */
let currentContext: SpanContext | null = null;

/**
 * Get current span context
 */
export function getCurrentContext(): SpanContext | null {
  return currentContext;
}

/**
 * Set current span context
 */
export function setCurrentContext(context: SpanContext | null): void {
  currentContext = context;
}

/**
 * Run a function with a specific context
 */
export function withContext<T>(context: SpanContext, fn: () => T): T {
  const prev = currentContext;
  currentContext = context;
  try {
    return fn();
  } finally {
    currentContext = prev;
  }
}

/**
 * Async version of withContext
 */
export async function withContextAsync<T>(
  context: SpanContext,
  fn: () => Promise<T>
): Promise<T> {
  const prev = currentContext;
  currentContext = context;
  try {
    return await fn();
  } finally {
    currentContext = prev;
  }
}

/**
 * Inject trace context into headers object
 */
export function injectTraceContext(
  headers: Record<string, string>,
  context?: SpanContext
): void {
  const ctx = context ?? getCurrentContext();
  if (!ctx) return;

  headers[TRACEPARENT_HEADER] = createTraceparent(ctx);

  if (ctx.traceState) {
    headers[TRACESTATE_HEADER] = ctx.traceState;
  }
}

/**
 * Extract trace context from headers object
 */
export function extractTraceContext(
  headers: Record<string, string | undefined>
): SpanContext | null {
  const traceparent = headers[TRACEPARENT_HEADER] || headers['Traceparent'];
  if (!traceparent) return null;

  const context = parseTraceparent(traceparent);
  if (!context) return null;

  const tracestate = headers[TRACESTATE_HEADER] || headers['Tracestate'];
  if (tracestate) {
    context.traceState = tracestate;
  }

  return context;
}
