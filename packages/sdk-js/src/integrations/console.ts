import type { Integration, SyntraClient, TelemetryBreadcrumb } from '../types';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * Console integration
 * Captures console.log/warn/error as breadcrumbs
 */
export class ConsoleIntegration implements Integration {
  name = 'Console';

  private client: SyntraClient | null = null;
  private originalMethods: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};
  private levels: ConsoleMethod[];

  constructor(levels: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']) {
    this.levels = levels;
  }

  setup(client: SyntraClient): void {
    this.client = client;

    for (const level of this.levels) {
      this.wrapConsoleMethod(level);
    }
  }

  teardown(): void {
    // Restore original methods
    for (const [level, method] of Object.entries(this.originalMethods)) {
      if (method) {
        (console as unknown as Record<string, unknown>)[level] = method;
      }
    }

    this.originalMethods = {};
    this.client = null;
  }

  private wrapConsoleMethod(level: ConsoleMethod): void {
    const original = console[level];
    if (typeof original !== 'function') return;

    this.originalMethods[level] = original;

    console[level] = (...args: unknown[]) => {
      // Add breadcrumb
      this.addConsoleBreadcrumb(level, args);

      // Call original
      original.apply(console, args);
    };
  }

  private addConsoleBreadcrumb(level: ConsoleMethod, args: unknown[]): void {
    if (!this.client) return;

    const breadcrumbLevel = this.mapLevel(level);
    const message = this.formatArgs(args);

    this.client.addBreadcrumb({
      type: 'console',
      category: 'console',
      message,
      data: { arguments: this.serializeArgs(args) },
      level: breadcrumbLevel,
    });
  }

  private mapLevel(level: ConsoleMethod): TelemetryBreadcrumb['level'] {
    switch (level) {
      case 'debug':
        return 'debug';
      case 'log':
      case 'info':
        return 'info';
      case 'warn':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return '[Object]';
        }
      })
      .join(' ');
  }

  private serializeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (
        arg === null ||
        arg === undefined ||
        typeof arg === 'string' ||
        typeof arg === 'number' ||
        typeof arg === 'boolean'
      ) {
        return arg;
      }
      if (arg instanceof Error) {
        return {
          __type: 'Error',
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        };
      }
      try {
        // Limit size
        const str = JSON.stringify(arg);
        if (str.length > 1000) {
          return '[Large Object]';
        }
        return JSON.parse(str);
      } catch {
        return '[Unserializable]';
      }
    });
  }
}

/**
 * Create console integration
 */
export function consoleIntegration(
  levels?: ConsoleMethod[]
): ConsoleIntegration {
  return new ConsoleIntegration(levels);
}
