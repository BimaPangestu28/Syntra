import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { captureException, startSpan, getActiveSpan } from '../../client';
import { extractTraceContext, injectTraceContext } from '../../tracing/context';

/**
 * Options for Express error handler
 */
export interface SyntraErrorHandlerOptions {
  /** Whether to re-throw the error after capturing */
  rethrow?: boolean;
  /** Status code to send (default: 500) */
  statusCode?: number;
  /** Custom error response formatter */
  formatError?: (error: Error, req: Request) => unknown;
}

/**
 * Express error handling middleware
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { syntraErrorHandler } from '@syntra/sdk/express';
 *
 * const app = express();
 *
 * // Your routes...
 *
 * // Add error handler last
 * app.use(syntraErrorHandler());
 * ```
 */
export function syntraErrorHandler(
  options: SyntraErrorHandlerOptions = {}
): ErrorRequestHandler {
  const { rethrow = false, statusCode = 500, formatError } = options;

  return (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    // Capture the exception
    captureException(error, {
      request: {
        url: req.url,
        method: req.method,
        headers: sanitizeHeaders(req.headers as Record<string, string>),
        query: req.query as Record<string, string>,
      },
      tags: {
        'express.route': req.route?.path ?? req.path,
      },
    });

    // Set error status on active span
    const span = getActiveSpan();
    if (span) {
      span.setStatus({
        code: 'error',
        message: error.message,
      });
      span.setAttribute('error', true);
      span.setAttribute('error.message', error.message);
      span.setAttribute('error.type', error.name);
    }

    // If response was already sent, pass to default handler
    if (res.headersSent) {
      return next(error);
    }

    // Send error response
    const responseBody = formatError
      ? formatError(error, req)
      : {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message:
              process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred'
                : error.message,
          },
        };

    res.status(statusCode).json(responseBody);

    // Re-throw if configured
    if (rethrow) {
      next(error);
    }
  };
}

/**
 * Express request handler middleware for tracing
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { syntraRequestHandler } from '@syntra/sdk/express';
 *
 * const app = express();
 *
 * // Add request handler first
 * app.use(syntraRequestHandler());
 *
 * // Your routes...
 * ```
 */
export function syntraRequestHandler(options: {
  /** Paths to exclude from tracing */
  excludePaths?: string[];
} = {}) {
  const { excludePaths = ['/health', '/healthz', '/ready', '/favicon.ico'] } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if path should be excluded
    for (const path of excludePaths) {
      if (req.path === path || req.path.startsWith(path)) {
        return next();
      }
    }

    // Extract trace context from headers
    const parentContext = extractTraceContext(req.headers as Record<string, string>);

    // Start request span
    const span = startSpan({
      name: `${req.method} ${req.route?.path ?? req.path}`,
      op: 'http.server',
      kind: 'server',
      attributes: {
        'http.method': req.method,
        'http.url': req.originalUrl,
        'http.route': req.route?.path ?? req.path,
        'http.host': req.hostname,
        'http.user_agent': req.get('user-agent') ?? '',
      },
    });

    // Store span for later access
    (req as Request & { syntraSpan?: typeof span }).syntraSpan = span;

    // Capture response
    const originalEnd = res.end.bind(res);
    (res as Response).end = function (
      this: Response,
      ...args: unknown[]
    ): Response {
      // Set response attributes
      span.setAttribute('http.status_code', res.statusCode);
      span.setStatus(
        res.statusCode >= 400 ? { code: 'error' } : { code: 'ok' }
      );

      // Inject trace context into response
      const traceHeaders: Record<string, string> = {};
      injectTraceContext(traceHeaders, span.spanContext());
      for (const [key, value] of Object.entries(traceHeaders)) {
        if (!res.headersSent) {
          res.setHeader(key, value);
        }
      }

      // End span
      span.end();

      // Call original end with original args
      return (originalEnd as (...args: unknown[]) => Response).apply(this, args);
    } as typeof res.end;

    next();
  };
}

/**
 * Sanitize headers by removing sensitive values
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = '[Filtered]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
