import type { NextRequest, NextResponse } from 'next/server';
import { captureException, startSpan, addBreadcrumb, getClient } from '../../client';
import { extractTraceContext, injectTraceContext } from '../../tracing/context';

/**
 * Options for the Next.js middleware
 */
export interface SyntraMiddlewareOptions {
  /** Paths to exclude from tracing (glob patterns supported) */
  excludePaths?: string[];
  /** Whether to trace all requests */
  traceRequests?: boolean;
}

/**
 * Create a Syntra wrapper for Next.js middleware
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { withSyntraMiddleware } from '@syntra/sdk/nextjs';
 *
 * export const middleware = withSyntraMiddleware(async (request) => {
 *   // Your middleware logic
 *   return NextResponse.next();
 * });
 * ```
 */
export function withSyntraMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse,
  options: SyntraMiddlewareOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  const { excludePaths = ['/_next/', '/api/health', '/favicon.ico'], traceRequests = true } =
    options;

  return async (request: NextRequest): Promise<NextResponse> => {
    const client = getClient();
    if (!client) {
      return handler(request);
    }

    const url = request.nextUrl;
    const pathname = url.pathname;

    // Check if path should be excluded
    for (const pattern of excludePaths) {
      if (pathname.startsWith(pattern) || pathname.includes(pattern)) {
        return handler(request);
      }
    }

    // Extract trace context from incoming request
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value: string, key: string) => {
      headers[key.toLowerCase()] = value;
    });
    const parentContext = extractTraceContext(headers);

    // Create span for the request
    const span = traceRequests
      ? startSpan({
          name: `${request.method} ${pathname}`,
          op: 'http.server',
          kind: 'server',
          attributes: {
            'http.method': request.method,
            'http.url': url.toString(),
            'http.route': pathname,
            'http.host': url.host,
          },
        })
      : null;

    // Add breadcrumb
    addBreadcrumb({
      type: 'http',
      category: 'request',
      message: `${request.method} ${pathname}`,
      data: {
        method: request.method,
        url: url.toString(),
      },
      level: 'info',
    });

    try {
      const response = await handler(request);

      // Set response status on span
      if (span) {
        span.setAttribute('http.status_code', response.status);
        span.setStatus(
          response.status >= 400 ? { code: 'error' } : { code: 'ok' }
        );
      }

      // Inject trace context into response headers
      if (span) {
        const responseHeaders = new Headers(response.headers);
        const traceHeaders: Record<string, string> = {};
        injectTraceContext(traceHeaders, span.spanContext());
        for (const [key, value] of Object.entries(traceHeaders)) {
          responseHeaders.set(key, value);
        }
      }

      return response;
    } catch (error) {
      // Capture error
      captureException(error, {
        request: {
          url: url.toString(),
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
        },
      });

      if (span) {
        span.setStatus({
          code: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      throw error;
    } finally {
      if (span) {
        span.end();
      }
    }
  };
}
