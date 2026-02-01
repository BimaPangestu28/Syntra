import type { TelemetryBreadcrumb } from '../types';

/**
 * Ring buffer for breadcrumbs
 * Automatically removes oldest entries when capacity is reached
 */
export class BreadcrumbBuffer {
  private buffer: TelemetryBreadcrumb[];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = Math.max(1, maxSize);
    this.buffer = [];
  }

  /**
   * Add a breadcrumb to the buffer
   */
  add(breadcrumb: Omit<TelemetryBreadcrumb, 'timestamp'>): void {
    const entry: TelemetryBreadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(entry);

    // Remove oldest if over capacity
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get all breadcrumbs (oldest first)
   */
  getAll(): TelemetryBreadcrumb[] {
    return [...this.buffer];
  }

  /**
   * Get the last N breadcrumbs
   */
  getLast(n: number): TelemetryBreadcrumb[] {
    return this.buffer.slice(-n);
  }

  /**
   * Clear all breadcrumbs
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get current count
   */
  get count(): number {
    return this.buffer.length;
  }

  /**
   * Get max capacity
   */
  get capacity(): number {
    return this.maxSize;
  }
}

/**
 * Helper to create a breadcrumb
 */
export function createBreadcrumb(
  type: TelemetryBreadcrumb['type'],
  category: string,
  message?: string,
  data?: Record<string, unknown>,
  level: TelemetryBreadcrumb['level'] = 'info'
): Omit<TelemetryBreadcrumb, 'timestamp'> {
  return {
    type,
    category,
    message,
    data,
    level,
  };
}

/**
 * Create an HTTP breadcrumb
 */
export function createHttpBreadcrumb(
  method: string,
  url: string,
  statusCode?: number,
  duration?: number
): Omit<TelemetryBreadcrumb, 'timestamp'> {
  const level: TelemetryBreadcrumb['level'] =
    statusCode && statusCode >= 400 ? 'error' : 'info';

  return createBreadcrumb(
    'http',
    'http',
    `${method} ${url}`,
    {
      method,
      url,
      status_code: statusCode,
      duration_ms: duration,
    },
    level
  );
}

/**
 * Create a console breadcrumb
 */
export function createConsoleBreadcrumb(
  consoleLevel: 'log' | 'info' | 'warn' | 'error' | 'debug',
  args: unknown[]
): Omit<TelemetryBreadcrumb, 'timestamp'> {
  const levelMap: Record<string, TelemetryBreadcrumb['level']> = {
    log: 'info',
    info: 'info',
    warn: 'warning',
    error: 'error',
    debug: 'debug',
  };

  return createBreadcrumb(
    'console',
    'console',
    formatConsoleArgs(args),
    { arguments: args },
    levelMap[consoleLevel] ?? 'info'
  );
}

/**
 * Create a navigation breadcrumb
 */
export function createNavigationBreadcrumb(
  from: string,
  to: string
): Omit<TelemetryBreadcrumb, 'timestamp'> {
  return createBreadcrumb(
    'navigation',
    'navigation',
    `Navigating to ${to}`,
    { from, to },
    'info'
  );
}

/**
 * Create a UI interaction breadcrumb
 */
export function createUIBreadcrumb(
  action: 'click' | 'input' | 'submit',
  target: string
): Omit<TelemetryBreadcrumb, 'timestamp'> {
  return createBreadcrumb(
    'ui',
    `ui.${action}`,
    `${action} on ${target}`,
    { target },
    'info'
  );
}

/**
 * Format console arguments to a string message
 */
function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      try {
        return JSON.stringify(arg);
      } catch {
        return '[Object]';
      }
    })
    .join(' ');
}
