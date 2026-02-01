import type {
  SyntraClient,
  SyntraOptions,
  User,
  ScopeData,
  Span,
  SpanOptions,
  Transport,
  Integration,
  TelemetryError,
  TelemetryBreadcrumb,
  TelemetryErrorContext,
  LogLevel,
  CaptureContext,
} from './types';
import { normalizeOptions, shouldSample, createDebugLogger } from './config';
import { parseDSN } from './utils/dsn';
import { parseStackTrace } from './utils/stack-trace';
import { generateFingerprint } from './utils/fingerprint';
import { Scope, ScopeManager } from './scope';
import { createHttpTransport } from './transport/http';
import { createOtlpTransport } from './transport/otlp';
import { Tracer } from './tracing/tracer';
import {
  browserErrorsIntegration,
  consoleIntegration,
  fetchIntegration,
} from './integrations';

/**
 * Main Syntra client implementation
 */
export class SyntraClientImpl implements SyntraClient {
  private options: Required<SyntraOptions>;
  private scopeManager: ScopeManager;
  private transport: Transport;
  private tracer: Tracer;
  private integrations: Integration[] = [];
  private isInitialized = false;
  private logger: ReturnType<typeof createDebugLogger>;

  constructor(options: SyntraOptions) {
    this.options = normalizeOptions(options);
    this.logger = createDebugLogger(this.options.debug);
    this.scopeManager = new ScopeManager(this.options.maxBreadcrumbs);

    // Parse DSN
    const dsn = parseDSN(this.options.dsn);

    // Create transport
    if (this.options.transport === 'otlp' && this.options.otlpEndpoint) {
      this.transport = createOtlpTransport(
        this.options.otlpEndpoint,
        dsn.projectId,
        {
          serviceName: this.options.serviceId,
          serviceVersion: this.options.release,
        }
      );
    } else {
      this.transport = createHttpTransport(
        dsn.host,
        dsn.publicKey,
        dsn.projectId,
        { debug: this.options.debug }
      );
    }

    // Create tracer
    this.tracer = new Tracer({
      serviceId: this.options.serviceId,
      deploymentId: this.options.deploymentId,
      sampleRate: this.options.tracesSampleRate,
      transport: this.transport,
      debug: this.options.debug,
    });

    this.logger.log('Client created', { dsn: dsn.host, projectId: dsn.projectId });
  }

  /**
   * Initialize integrations
   */
  init(): void {
    if (this.isInitialized) return;

    // Setup integrations based on options
    const { integrations } = this.options;

    if (integrations.browserErrors) {
      this.addIntegration(browserErrorsIntegration());
    }

    if (integrations.console) {
      this.addIntegration(consoleIntegration());
    }

    if (integrations.http) {
      this.addIntegration(fetchIntegration());
    }

    this.isInitialized = true;
    this.logger.log('Client initialized');
  }

  /**
   * Add an integration
   */
  addIntegration(integration: Integration): void {
    integration.setup(this);
    this.integrations.push(integration);
    this.logger.log('Integration added:', integration.name);
  }

  /**
   * Get current options
   */
  getOptions(): SyntraOptions {
    return { ...this.options };
  }

  /**
   * Get current scope
   */
  getScope(): ScopeData {
    return this.scopeManager.getCurrentScope().applyToContext();
  }

  /**
   * Capture an exception
   */
  captureException(
    error: Error | unknown,
    context?: Partial<TelemetryErrorContext>
  ): string {
    // Sampling check
    if (!shouldSample(this.options.errorsSampleRate)) {
      return '';
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const scope = this.scopeManager.getCurrentScope();

    // Parse stack trace
    const stackFrames = parseStackTrace(err);

    // Generate fingerprint
    const fingerprint =
      scope.fingerprint ?? generateFingerprint(err.name, err.message, stackFrames);

    // Build error event
    const event: TelemetryError = {
      id: crypto.randomUUID(),
      service_id: this.options.serviceId,
      deployment_id: this.options.deploymentId,
      timestamp: new Date().toISOString(),
      type: err.name,
      message: err.message,
      stack_trace: stackFrames,
      breadcrumbs: scope.breadcrumbs,
      context: {
        environment: this.options.environment,
        release: this.options.release,
        user: scope.user
          ? {
              id: scope.user.id,
              email: scope.user.email,
              username: scope.user.username,
            }
          : undefined,
        tags: { ...scope.tags, ...context?.tags },
        extra: { ...scope.extra, ...context?.extra },
        request: context?.request,
        browser: context?.browser ?? this.getBrowserInfo(),
        os: context?.os,
        device: context?.device,
      },
      fingerprint,
    };

    // Apply beforeSend hook
    const processed = this.options.beforeSend(event);
    if (!processed) {
      this.logger.log('Event dropped by beforeSend');
      return '';
    }

    // Send event
    this.transport.sendError(processed).catch((err) => {
      this.logger.error('Failed to send error:', err);
    });

    this.logger.log('Captured exception:', processed.id);
    return processed.id;
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: LogLevel = 'info'): string {
    if (!shouldSample(this.options.errorsSampleRate)) {
      return '';
    }

    const scope = this.scopeManager.getCurrentScope();

    // Create a synthetic error for messages
    const event: TelemetryError = {
      id: crypto.randomUUID(),
      service_id: this.options.serviceId,
      deployment_id: this.options.deploymentId,
      timestamp: new Date().toISOString(),
      type: 'Message',
      message,
      stack_trace: [],
      breadcrumbs: scope.breadcrumbs,
      context: {
        environment: this.options.environment,
        release: this.options.release,
        user: scope.user
          ? {
              id: scope.user.id,
              email: scope.user.email,
              username: scope.user.username,
            }
          : undefined,
        tags: { ...scope.tags, level },
        extra: scope.extra,
      },
      fingerprint: [level, message],
    };

    const processed = this.options.beforeSend(event);
    if (!processed) return '';

    this.transport.sendError(processed).catch((err) => {
      this.logger.error('Failed to send message:', err);
    });

    this.logger.log('Captured message:', processed.id);
    return processed.id;
  }

  /**
   * Add a breadcrumb
   */
  addBreadcrumb(breadcrumb: Omit<TelemetryBreadcrumb, 'timestamp'>): void {
    this.scopeManager.getCurrentScope().addBreadcrumb(breadcrumb);
  }

  /**
   * Set user context
   */
  setUser(user: User | null): void {
    this.scopeManager.getCurrentScope().setUser(user);
    this.logger.log('User set:', user?.id ?? 'null');
  }

  /**
   * Set a tag
   */
  setTag(key: string, value: string): void {
    this.scopeManager.getCurrentScope().setTag(key, value);
  }

  /**
   * Set extra context
   */
  setExtra(key: string, value: unknown): void {
    this.scopeManager.getCurrentScope().setExtra(key, value);
  }

  /**
   * Start a new span
   */
  startSpan(options: SpanOptions): Span {
    return this.tracer.startSpan(options);
  }

  /**
   * Get the active span
   */
  getActiveSpan(): Span | undefined {
    return this.tracer.getActiveSpan();
  }

  /**
   * Run a function with an isolated scope
   */
  withScope<T>(callback: (scope: Scope) => T): T {
    return this.scopeManager.withScope(callback);
  }

  /**
   * Flush pending data
   */
  async flush(timeout?: number): Promise<void> {
    await Promise.all([
      this.transport.flush(timeout),
      this.tracer.flush(),
    ]);
    this.logger.log('Flushed');
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    // Teardown integrations
    for (const integration of this.integrations) {
      if (integration.teardown) {
        integration.teardown();
      }
    }

    // Flush and close
    await this.flush();
    await this.tracer.close();

    this.isInitialized = false;
    this.logger.log('Client closed');
  }

  /**
   * Get browser info if available
   */
  private getBrowserInfo(): TelemetryErrorContext['browser'] | undefined {
    if (typeof navigator === 'undefined') return undefined;

    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = '';

    // Simple browser detection
    if (ua.includes('Firefox/')) {
      name = 'Firefox';
      version = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '';
    } else if (ua.includes('Chrome/')) {
      name = 'Chrome';
      version = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      name = 'Safari';
      version = ua.match(/Version\/([\d.]+)/)?.[1] ?? '';
    } else if (ua.includes('Edge/')) {
      name = 'Edge';
      version = ua.match(/Edge\/([\d.]+)/)?.[1] ?? '';
    }

    return { name, version };
  }
}

// Singleton instance
let globalClient: SyntraClientImpl | null = null;

/**
 * Initialize the Syntra SDK
 */
export function init(options: SyntraOptions): void {
  if (globalClient) {
    globalClient.close();
  }

  globalClient = new SyntraClientImpl(options);
  globalClient.init();
}

/**
 * Get the current client
 */
export function getClient(): SyntraClient | null {
  return globalClient;
}

/**
 * Capture an exception
 */
export function captureException(
  error: Error | unknown,
  context?: CaptureContext
): string {
  if (!globalClient) return '';
  return globalClient.captureException(error, context);
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level?: LogLevel): string {
  if (!globalClient) return '';
  return globalClient.captureMessage(message, level);
}

/**
 * Add a breadcrumb
 */
export function addBreadcrumb(
  breadcrumb: Omit<TelemetryBreadcrumb, 'timestamp'>
): void {
  if (!globalClient) return;
  globalClient.addBreadcrumb(breadcrumb);
}

/**
 * Set user context
 */
export function setUser(user: User | null): void {
  if (!globalClient) return;
  globalClient.setUser(user);
}

/**
 * Set a tag
 */
export function setTag(key: string, value: string): void {
  if (!globalClient) return;
  globalClient.setTag(key, value);
}

/**
 * Set extra context
 */
export function setExtra(key: string, value: unknown): void {
  if (!globalClient) return;
  globalClient.setExtra(key, value);
}

/**
 * Start a span
 */
export function startSpan(options: SpanOptions): Span {
  if (!globalClient) {
    // Return noop span
    return {
      traceId: '',
      spanId: '',
      name: options.name,
      startTime: 0,
      kind: 'internal',
      setStatus: () => {},
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      end: () => {},
      isRecording: () => false,
      spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
    };
  }
  return globalClient.startSpan(options);
}

/**
 * Get active span
 */
export function getActiveSpan(): Span | undefined {
  if (!globalClient) return undefined;
  return globalClient.getActiveSpan();
}

/**
 * Flush pending data
 */
export function flush(timeout?: number): Promise<void> {
  if (!globalClient) return Promise.resolve();
  return globalClient.flush(timeout);
}

/**
 * Close the SDK
 */
export function close(): Promise<void> {
  if (!globalClient) return Promise.resolve();
  const client = globalClient;
  globalClient = null;
  return client.close();
}
