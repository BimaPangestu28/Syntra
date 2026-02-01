import type {
  Span as ISpan,
  SpanContext,
  SpanKind,
  SpanStatus,
  SpanEvent,
  TelemetrySpan,
} from '../types';
import { generateSpanId, generateTraceId, TRACE_FLAG_SAMPLED } from './context';

/**
 * Span implementation
 */
export class SpanImpl implements ISpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTime: number;
  readonly kind: SpanKind;

  private _status: SpanStatus = { code: 'unset' };
  private _attributes: Record<string, string | number | boolean> = {};
  private _events: SpanEvent[] = [];
  private _endTime: number | null = null;
  private _recording = true;

  constructor(options: {
    name: string;
    kind?: SpanKind;
    traceId?: string;
    parentSpanId?: string;
    attributes?: Record<string, string | number | boolean>;
  }) {
    this.name = options.name;
    this.kind = options.kind ?? 'internal';
    this.traceId = options.traceId ?? generateTraceId();
    this.spanId = generateSpanId();
    this.parentSpanId = options.parentSpanId;
    this.startTime = Date.now() * 1_000_000; // nanoseconds

    if (options.attributes) {
      this._attributes = { ...options.attributes };
    }
  }

  /**
   * Set span status
   */
  setStatus(status: SpanStatus): void {
    if (!this._recording) return;
    this._status = status;
  }

  /**
   * Set a single attribute
   */
  setAttribute(key: string, value: string | number | boolean): void {
    if (!this._recording) return;
    this._attributes[key] = value;
  }

  /**
   * Set multiple attributes
   */
  setAttributes(attrs: Record<string, string | number | boolean>): void {
    if (!this._recording) return;
    Object.assign(this._attributes, attrs);
  }

  /**
   * Add an event to the span
   */
  addEvent(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    if (!this._recording) return;

    this._events.push({
      name,
      timestamp_ns: Date.now() * 1_000_000,
      attributes: attributes ?? {},
    });
  }

  /**
   * End the span
   */
  end(): void {
    if (!this._recording) return;

    this._endTime = Date.now() * 1_000_000;
    this._recording = false;
  }

  /**
   * Check if span is still recording
   */
  isRecording(): boolean {
    return this._recording;
  }

  /**
   * Get span context for propagation
   */
  spanContext(): SpanContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceFlags: TRACE_FLAG_SAMPLED,
    };
  }

  /**
   * Get attributes
   */
  get attributes(): Record<string, string | number | boolean> {
    return { ...this._attributes };
  }

  /**
   * Get events
   */
  get events(): SpanEvent[] {
    return [...this._events];
  }

  /**
   * Get status
   */
  get status(): SpanStatus {
    return { ...this._status };
  }

  /**
   * Get duration in nanoseconds (0 if not ended)
   */
  get durationNs(): number {
    if (this._endTime === null) return 0;
    return this._endTime - this.startTime;
  }

  /**
   * Convert to TelemetrySpan format for transport
   */
  toTelemetrySpan(serviceId: string, deploymentId: string): TelemetrySpan {
    return {
      trace_id: this.traceId,
      span_id: this.spanId,
      parent_span_id: this.parentSpanId,
      service_id: serviceId,
      deployment_id: deploymentId,
      operation_name: this.name,
      span_kind: this.kind,
      start_time_ns: this.startTime,
      duration_ns: this.durationNs,
      status: this._status,
      attributes: this._attributes,
      events: this._events,
    };
  }
}

/**
 * No-op span for when sampling decides not to record
 */
export class NoopSpan implements ISpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTime: number = 0;
  readonly kind: SpanKind = 'internal';

  constructor(context?: SpanContext) {
    this.traceId = context?.traceId ?? generateTraceId();
    this.spanId = context?.spanId ?? generateSpanId();
    this.name = 'noop';
  }

  setStatus(_status: SpanStatus): void {}
  setAttribute(_key: string, _value: string | number | boolean): void {}
  setAttributes(_attrs: Record<string, string | number | boolean>): void {}
  addEvent(_name: string, _attributes?: Record<string, string | number | boolean>): void {}
  end(): void {}
  isRecording(): boolean {
    return false;
  }
  spanContext(): SpanContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceFlags: 0,
    };
  }
}
