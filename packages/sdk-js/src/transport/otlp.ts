import type { TelemetrySpan, TelemetryLog } from '../types';
import { BaseTransport, type TransportOptions } from './base';

// OTLP types (compatible with OpenTelemetry Protocol)
interface OTLPAttribute {
  key: string;
  value: {
    string_value?: string;
    int_value?: number;
    double_value?: number;
    bool_value?: boolean;
  };
}

interface OTLPResource {
  attributes: OTLPAttribute[];
}

interface OTLPInstrumentationScope {
  name: string;
  version?: string;
}

interface OTLPSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: number;
  start_time_unix_nano: string;
  end_time_unix_nano: string;
  attributes: OTLPAttribute[];
  status: { code: number; message?: string };
  events: Array<{ name: string; time_unix_nano: string; attributes: OTLPAttribute[] }>;
}

interface OTLPResourceSpans {
  resource: OTLPResource;
  scope_spans: Array<{ scope: OTLPInstrumentationScope; spans: OTLPSpan[] }>;
}

interface OTLPLogRecord {
  time_unix_nano: string;
  severity_number: number;
  severity_text: string;
  body: { string_value: string };
  attributes: OTLPAttribute[];
  trace_id?: string;
  span_id?: string;
}

interface OTLPResourceLogs {
  resource: OTLPResource;
  scope_logs: Array<{ scope: OTLPInstrumentationScope; log_records: OTLPLogRecord[] }>;
}

interface OTLPExportRequest {
  resource_spans?: OTLPResourceSpans[];
  resource_logs?: OTLPResourceLogs[];
}

/**
 * OTLP transport - sends telemetry to local agent via OpenTelemetry Protocol
 */
export class OtlpTransport extends BaseTransport {
  private serviceName: string;
  private serviceVersion: string;

  constructor(
    options: TransportOptions & {
      serviceName?: string;
      serviceVersion?: string;
    }
  ) {
    super(options);
    this.serviceName = options.serviceName ?? 'unknown-service';
    this.serviceVersion = options.serviceVersion ?? '0.0.0';
  }

  /**
   * Send payload via OTLP HTTP/JSON
   */
  protected async sendPayload(
    type: 'errors' | 'spans' | 'logs',
    payload: unknown
  ): Promise<void> {
    let endpoint: string;
    let body: OTLPExportRequest;

    switch (type) {
      case 'spans':
        endpoint = '/v1/traces';
        body = {
          resource_spans: [this.convertToResourceSpans(payload as TelemetrySpan[])],
        };
        break;
      case 'logs':
        endpoint = '/v1/logs';
        body = {
          resource_logs: [this.convertToResourceLogs(payload as TelemetryLog[])],
        };
        break;
      case 'errors':
        // Errors are sent as logs in OTLP
        endpoint = '/v1/logs';
        body = {
          resource_logs: [this.convertErrorsToResourceLogs(payload as unknown[])],
        };
        break;
      default:
        throw new Error(`Unknown payload type: ${type}`);
    }

    const url = `${this.options.url}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeout),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`OTLP ${response.status}: ${text}`);
    }
  }

  /**
   * Convert Syntra spans to OTLP ResourceSpans
   */
  private convertToResourceSpans(spans: TelemetrySpan[]): OTLPResourceSpans {
    const otlpSpans: OTLPSpan[] = spans.map((span) => ({
      trace_id: span.trace_id,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id,
      name: span.operation_name,
      kind: this.spanKindToNumber(span.span_kind),
      start_time_unix_nano: String(span.start_time_ns),
      end_time_unix_nano: String(span.start_time_ns + span.duration_ns),
      attributes: this.convertAttributes(span.attributes),
      status: {
        code: this.statusCodeToNumber(span.status.code),
        message: span.status.message,
      },
      events: span.events.map((event) => ({
        name: event.name,
        time_unix_nano: String(event.timestamp_ns),
        attributes: this.convertAttributes(event.attributes),
      })),
    }));

    return {
      resource: {
        attributes: [
          { key: 'service.name', value: { string_value: this.serviceName } },
          { key: 'service.version', value: { string_value: this.serviceVersion } },
          { key: 'syntra.project_id', value: { string_value: this.options.projectId } },
        ],
      },
      scope_spans: [
        {
          scope: {
            name: '@syntra/sdk',
            version: '0.1.0',
          },
          spans: otlpSpans,
        },
      ],
    };
  }

  /**
   * Convert Syntra logs to OTLP ResourceLogs
   */
  private convertToResourceLogs(logs: TelemetryLog[]): OTLPResourceLogs {
    const logRecords: OTLPLogRecord[] = logs.map((log) => ({
      time_unix_nano: String(new Date(log.timestamp).getTime() * 1_000_000),
      severity_number: this.levelToSeverityNumber(log.level),
      severity_text: log.level.toUpperCase(),
      body: { string_value: log.message },
      attributes: this.convertAttributes(log.attributes as Record<string, string | number | boolean>),
      trace_id: log.trace_id,
      span_id: log.span_id,
    }));

    return {
      resource: {
        attributes: [
          { key: 'service.name', value: { string_value: this.serviceName } },
          { key: 'service.version', value: { string_value: this.serviceVersion } },
          { key: 'syntra.project_id', value: { string_value: this.options.projectId } },
        ],
      },
      scope_logs: [
        {
          scope: {
            name: '@syntra/sdk',
            version: '0.1.0',
          },
          log_records: logRecords,
        },
      ],
    };
  }

  /**
   * Convert errors to OTLP logs (errors are sent as exception logs)
   */
  private convertErrorsToResourceLogs(errors: unknown[]): OTLPResourceLogs {
    const logRecords: OTLPLogRecord[] = errors.map((error) => {
      const err = error as Record<string, unknown>;
      return {
        time_unix_nano: String(new Date(err.timestamp as string).getTime() * 1_000_000),
        severity_number: 17, // ERROR
        severity_text: 'ERROR',
        body: { string_value: err.message as string },
        attributes: [
          { key: 'exception.type', value: { string_value: err.type as string } },
          { key: 'exception.message', value: { string_value: err.message as string } },
          {
            key: 'exception.stacktrace',
            value: { string_value: JSON.stringify(err.stack_trace) },
          },
        ],
      };
    });

    return {
      resource: {
        attributes: [
          { key: 'service.name', value: { string_value: this.serviceName } },
          { key: 'service.version', value: { string_value: this.serviceVersion } },
          { key: 'syntra.project_id', value: { string_value: this.options.projectId } },
        ],
      },
      scope_logs: [
        {
          scope: {
            name: '@syntra/sdk',
            version: '0.1.0',
          },
          log_records: logRecords,
        },
      ],
    };
  }

  /**
   * Convert attributes object to OTLP format
   */
  private convertAttributes(
    attrs: Record<string, string | number | boolean>
  ): OTLPAttribute[] {
    return Object.entries(attrs).map(([key, value]) => {
      if (typeof value === 'string') {
        return { key, value: { string_value: value } };
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return { key, value: { int_value: value } };
        }
        return { key, value: { double_value: value } };
      } else if (typeof value === 'boolean') {
        return { key, value: { bool_value: value } };
      }
      return { key, value: { string_value: String(value) } };
    });
  }

  /**
   * Convert span kind to OTLP number
   */
  private spanKindToNumber(kind: string): number {
    const kinds: Record<string, number> = {
      internal: 1,
      server: 2,
      client: 3,
      producer: 4,
      consumer: 5,
    };
    return kinds[kind] ?? 0;
  }

  /**
   * Convert status code to OTLP number
   */
  private statusCodeToNumber(code: string): number {
    const codes: Record<string, number> = {
      unset: 0,
      ok: 1,
      error: 2,
    };
    return codes[code] ?? 0;
  }

  /**
   * Convert log level to OTLP severity number
   */
  private levelToSeverityNumber(level: string): number {
    const levels: Record<string, number> = {
      trace: 1,
      debug: 5,
      info: 9,
      warn: 13,
      error: 17,
      fatal: 21,
    };
    return levels[level] ?? 9;
  }
}

/**
 * Create OTLP transport for local agent
 */
export function createOtlpTransport(
  endpoint: string,
  projectId: string,
  options?: {
    serviceName?: string;
    serviceVersion?: string;
    timeout?: number;
    maxBatchSize?: number;
  }
): OtlpTransport {
  return new OtlpTransport({
    url: endpoint,
    publicKey: '', // Not needed for local OTLP
    projectId,
    serviceName: options?.serviceName,
    serviceVersion: options?.serviceVersion,
    timeout: options?.timeout,
    maxBatchSize: options?.maxBatchSize,
  });
}
