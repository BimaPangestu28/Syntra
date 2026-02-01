import type { Integration, SyntraClient } from '../types';
import { createHttpBreadcrumb } from '../breadcrumbs/buffer';
import {
  injectTraceContext,
  getCurrentContext,
  TRACEPARENT_HEADER,
} from '../tracing/context';

/**
 * Fetch/XHR integration
 * Instruments fetch and XMLHttpRequest for tracing and breadcrumbs
 */
export class FetchIntegration implements Integration {
  name = 'Fetch';

  private client: SyntraClient | null = null;
  private originalFetch: typeof fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  setup(client: SyntraClient): void {
    this.client = client;

    this.instrumentFetch();
    this.instrumentXHR();
  }

  teardown(): void {
    // Restore fetch
    if (this.originalFetch && typeof window !== 'undefined') {
      window.fetch = this.originalFetch;
    }

    // Restore XHR
    if (this.originalXHROpen && typeof XMLHttpRequest !== 'undefined') {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
    }
    if (this.originalXHRSend && typeof XMLHttpRequest !== 'undefined') {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
    }

    this.client = null;
  }

  private instrumentFetch(): void {
    if (typeof fetch === 'undefined' || typeof window === 'undefined') return;

    this.originalFetch = fetch;
    const self = this;

    (window as Window).fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = self.getUrl(input);
      const method = init?.method ?? 'GET';
      const startTime = Date.now();

      // Inject trace context
      const headers = new Headers(init?.headers);
      const context = getCurrentContext();
      if (context) {
        const headerObj: Record<string, string> = {};
        injectTraceContext(headerObj, context);
        for (const [key, value] of Object.entries(headerObj)) {
          headers.set(key, value);
        }
      }

      try {
        const response = await self.originalFetch!.call(
          window,
          input,
          { ...init, headers }
        );

        const duration = Date.now() - startTime;
        self.addBreadcrumb(method, url, response.status, duration);

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        self.addBreadcrumb(method, url, 0, duration);
        throw error;
      }
    };
  }

  private instrumentXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') return;

    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    const self = this;

    // Track request metadata
    const xhrData = new WeakMap<
      XMLHttpRequest,
      { method: string; url: string; startTime: number }
    >();

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ): void {
      xhrData.set(this, {
        method,
        url: String(url),
        startTime: 0,
      });

      return self.originalXHROpen!.call(
        this,
        method,
        url,
        async ?? true,
        username ?? null,
        password ?? null
      );
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
      const data = xhrData.get(this);
      if (data) {
        data.startTime = Date.now();

        // Inject trace context
        const context = getCurrentContext();
        if (context) {
          const headerObj: Record<string, string> = {};
          injectTraceContext(headerObj, context);
          try {
            this.setRequestHeader(TRACEPARENT_HEADER, headerObj[TRACEPARENT_HEADER]);
          } catch {
            // Header already set or CORS issue
          }
        }

        // Listen for completion
        this.addEventListener('loadend', () => {
          const duration = Date.now() - data.startTime;
          self.addBreadcrumb(data.method, data.url, this.status, duration);
        });
      }

      return self.originalXHRSend!.call(this, body);
    };
  }

  private getUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    return input.url;
  }

  private addBreadcrumb(
    method: string,
    url: string,
    status: number,
    duration: number
  ): void {
    if (!this.client) return;

    // Skip Syntra's own requests
    if (url.includes('/api/v1/telemetry')) return;

    const breadcrumb = createHttpBreadcrumb(method.toUpperCase(), url, status, duration);
    this.client.addBreadcrumb(breadcrumb);
  }
}

/**
 * Create fetch integration
 */
export function fetchIntegration(): FetchIntegration {
  return new FetchIntegration();
}
