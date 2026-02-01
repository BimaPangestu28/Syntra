import type { SyntraOptions, IntegrationOptions } from './types';
import { parseDSN } from './utils/dsn';

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Partial<SyntraOptions> = {
  environment: 'production',
  tracesSampleRate: 1.0,
  errorsSampleRate: 1.0,
  debug: false,
  maxBreadcrumbs: 100,
  sendDefaultPii: false,
  transport: 'http',
  integrations: {
    browserErrors: true,
    console: true,
    http: true,
  },
};

/**
 * Validate and normalize configuration options
 */
export function normalizeOptions(options: SyntraOptions): Required<SyntraOptions> {
  // Validate DSN
  const dsn = parseDSN(options.dsn);

  // Merge with defaults
  const normalized: Required<SyntraOptions> = {
    dsn: options.dsn,
    environment: options.environment ?? DEFAULT_OPTIONS.environment!,
    release: options.release ?? '',
    serviceId: options.serviceId ?? dsn.projectId,
    deploymentId: options.deploymentId ?? '',
    tracesSampleRate: clampSampleRate(options.tracesSampleRate ?? DEFAULT_OPTIONS.tracesSampleRate!),
    errorsSampleRate: clampSampleRate(options.errorsSampleRate ?? DEFAULT_OPTIONS.errorsSampleRate!),
    debug: options.debug ?? DEFAULT_OPTIONS.debug!,
    maxBreadcrumbs: Math.max(0, Math.min(options.maxBreadcrumbs ?? DEFAULT_OPTIONS.maxBreadcrumbs!, 1000)),
    sendDefaultPii: options.sendDefaultPii ?? DEFAULT_OPTIONS.sendDefaultPii!,
    integrations: normalizeIntegrations(options.integrations),
    transport: options.transport ?? DEFAULT_OPTIONS.transport!,
    otlpEndpoint: options.otlpEndpoint ?? '',
    beforeSend: options.beforeSend ?? ((event) => event),
    beforeSendTransaction: options.beforeSendTransaction ?? ((span) => span),
  };

  return normalized;
}

/**
 * Normalize integration options
 */
function normalizeIntegrations(integrations?: IntegrationOptions): Required<IntegrationOptions> {
  const defaults = DEFAULT_OPTIONS.integrations!;
  return {
    browserErrors: integrations?.browserErrors ?? defaults.browserErrors!,
    console: integrations?.console ?? defaults.console!,
    http: integrations?.http ?? defaults.http!,
  };
}

/**
 * Clamp sample rate to valid range [0, 1]
 */
function clampSampleRate(rate: number): number {
  return Math.max(0, Math.min(rate, 1));
}

/**
 * Check if an event should be sampled
 */
export function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

/**
 * Debug logger
 */
export function createDebugLogger(enabled: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (enabled) console.log('[Syntra]', ...args);
    },
    warn: (...args: unknown[]) => {
      if (enabled) console.warn('[Syntra]', ...args);
    },
    error: (...args: unknown[]) => {
      if (enabled) console.error('[Syntra]', ...args);
    },
  };
}
