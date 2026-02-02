/**
 * Simple in-memory rate limiter.
 * For production, replace with Redis-based implementation (e.g., @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + options.windowSec * 1000 });
    return { success: true, limit: options.limit, remaining: options.limit - 1, resetAt: now + options.windowSec * 1000 };
  }

  if (entry.count >= options.limit) {
    return { success: false, limit: options.limit, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, limit: options.limit, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}

/** Pre-configured limiters for common use cases */
export const rateLimiters = {
  /** API: 100 requests per minute */
  api: (userId: string) => rateLimit(`api:${userId}`, { limit: 100, windowSec: 60 }),
  /** AI: 20 requests per minute */
  ai: (userId: string) => rateLimit(`ai:${userId}`, { limit: 20, windowSec: 60 }),
  /** Auth: 10 attempts per minute */
  auth: (ip: string) => rateLimit(`auth:${ip}`, { limit: 10, windowSec: 60 }),
  /** Webhooks: 60 per minute per IP */
  webhook: (ip: string) => rateLimit(`webhook:${ip}`, { limit: 60, windowSec: 60 }),
};
