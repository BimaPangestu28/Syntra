import type { Integration, SyntraClient } from '../types';

/**
 * Browser error integration
 * Captures unhandled errors and promise rejections
 */
export class BrowserErrorsIntegration implements Integration {
  name = 'BrowserErrors';

  private client: SyntraClient | null = null;
  private originalOnError: OnErrorEventHandler | null = null;
  private originalOnUnhandledRejection: ((event: PromiseRejectionEvent) => void) | null = null;

  setup(client: SyntraClient): void {
    this.client = client;

    if (typeof window === 'undefined') {
      // Not in browser environment
      return;
    }

    // Capture window.onerror
    this.originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      this.handleError(error ?? new Error(String(message)));

      // Call original handler
      if (this.originalOnError) {
        return this.originalOnError.call(window, message, source, lineno, colno, error);
      }
      return false;
    };

    // Capture unhandled promise rejections
    this.originalOnUnhandledRejection = window.onunhandledrejection as typeof this.originalOnUnhandledRejection;
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      this.handleRejection(event);

      // Call original handler
      if (this.originalOnUnhandledRejection) {
        this.originalOnUnhandledRejection.call(window, event);
      }
    };
  }

  teardown(): void {
    if (typeof window === 'undefined') return;

    // Restore original handlers
    if (this.originalOnError !== null) {
      window.onerror = this.originalOnError;
    }

    if (this.originalOnUnhandledRejection !== null) {
      window.onunhandledrejection = this.originalOnUnhandledRejection as OnErrorEventHandlerNonNull;
    }

    this.client = null;
  }

  private handleError(error: Error): void {
    if (!this.client) return;

    this.client.addBreadcrumb({
      type: 'error',
      category: 'exception',
      message: error.message,
      level: 'error',
    });

    this.client.captureException(error);
  }

  private handleRejection(event: PromiseRejectionEvent): void {
    if (!this.client) return;

    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason ?? 'Unhandled Promise rejection'));

    this.client.addBreadcrumb({
      type: 'error',
      category: 'promise.rejection',
      message: error.message,
      level: 'error',
    });

    this.client.captureException(error);
  }
}

/**
 * Create browser errors integration
 */
export function browserErrorsIntegration(): BrowserErrorsIntegration {
  return new BrowserErrorsIntegration();
}
