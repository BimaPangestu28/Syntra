import type { Span, SpanOptions, SpanContext, Transport, TelemetrySpan } from '../types';
import { SpanImpl, NoopSpan } from './span';
import {
  getCurrentContext,
  setCurrentContext,
  withContext,
  withContextAsync,
  TRACE_FLAG_SAMPLED,
} from './context';

/**
 * Tracer options
 */
export interface TracerOptions {
  serviceId: string;
  deploymentId: string;
  sampleRate: number;
  transport: Transport;
  debug?: boolean;
}

/**
 * Tracer manages span creation and context propagation
 */
export class Tracer {
  private options: TracerOptions;
  private activeSpans: Map<string, SpanImpl> = new Map();
  private finishedSpans: TelemetrySpan[] = [];
  private flushPromise: Promise<void> | null = null;

  constructor(options: TracerOptions) {
    this.options = options;
  }

  /**
   * Start a new span
   */
  startSpan(spanOptions: SpanOptions): Span {
    // Sampling decision
    if (!this.shouldSample()) {
      return new NoopSpan();
    }

    // Get parent context
    let parentContext: SpanContext | undefined;
    if (spanOptions.parentSpan) {
      parentContext = spanOptions.parentSpan.spanContext();
    } else {
      const current = getCurrentContext();
      if (current) {
        parentContext = current;
      }
    }

    // Create span
    const span = new SpanImpl({
      name: spanOptions.name,
      kind: spanOptions.kind,
      traceId: parentContext?.traceId,
      parentSpanId: parentContext?.spanId,
      attributes: spanOptions.attributes,
    });

    // Add operation attribute if provided
    if (spanOptions.op) {
      span.setAttribute('syntra.op', spanOptions.op);
    }

    // Track active span
    this.activeSpans.set(span.spanId, span);

    // Set as current context
    setCurrentContext(span.spanContext());

    // Wrap end() to capture finished span
    const originalEnd = span.end.bind(span);
    span.end = () => {
      originalEnd();
      this.onSpanEnd(span);
    };

    return span;
  }

  /**
   * Get the currently active span
   */
  getActiveSpan(): Span | undefined {
    const context = getCurrentContext();
    if (!context) return undefined;
    return this.activeSpans.get(context.spanId);
  }

  /**
   * Run a function within a span
   */
  withSpan<T>(name: string, fn: (span: Span) => T, options?: Partial<SpanOptions>): T {
    const span = this.startSpan({ name, ...options });
    try {
      const result = withContext(span.spanContext(), () => fn(span));
      span.setStatus({ code: 'ok' });
      return result;
    } catch (error) {
      span.setStatus({
        code: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Run an async function within a span
   */
  async withSpanAsync<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: Partial<SpanOptions>
  ): Promise<T> {
    const span = this.startSpan({ name, ...options });
    try {
      const result = await withContextAsync(span.spanContext(), () => fn(span));
      span.setStatus({ code: 'ok' });
      return result;
    } catch (error) {
      span.setStatus({
        code: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Create a child span of the current active span
   */
  startChildSpan(name: string, options?: Partial<SpanOptions>): Span {
    const parentSpan = this.getActiveSpan();
    return this.startSpan({
      name,
      ...options,
      parentSpan,
    });
  }

  /**
   * Flush all finished spans
   */
  async flush(): Promise<void> {
    if (this.finishedSpans.length === 0) return;

    // Avoid concurrent flushes
    if (this.flushPromise) {
      await this.flushPromise;
    }

    const spans = this.finishedSpans.splice(0);
    this.flushPromise = this.options.transport.sendSpans(spans);

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Close the tracer (flush and cleanup)
   */
  async close(): Promise<void> {
    await this.flush();
    this.activeSpans.clear();
  }

  /**
   * Called when a span ends
   */
  private onSpanEnd(span: SpanImpl): void {
    // Remove from active spans
    this.activeSpans.delete(span.spanId);

    // Restore parent context
    if (span.parentSpanId) {
      const parentSpan = this.activeSpans.get(span.parentSpanId);
      if (parentSpan) {
        setCurrentContext(parentSpan.spanContext());
      } else {
        setCurrentContext(null);
      }
    } else {
      setCurrentContext(null);
    }

    // Add to finished queue
    const telemetrySpan = span.toTelemetrySpan(
      this.options.serviceId,
      this.options.deploymentId
    );
    this.finishedSpans.push(telemetrySpan);

    // Auto-flush if queue is large
    if (this.finishedSpans.length >= 100) {
      this.flush().catch((err) => {
        if (this.options.debug) {
          console.error('[Syntra] Auto-flush spans error:', err);
        }
      });
    }
  }

  /**
   * Check if this span should be sampled
   */
  private shouldSample(): boolean {
    if (this.options.sampleRate >= 1) return true;
    if (this.options.sampleRate <= 0) return false;

    // If there's a parent context with sampled flag, follow it
    const context = getCurrentContext();
    if (context && (context.traceFlags & TRACE_FLAG_SAMPLED) !== 0) {
      return true;
    }

    return Math.random() < this.options.sampleRate;
  }
}
