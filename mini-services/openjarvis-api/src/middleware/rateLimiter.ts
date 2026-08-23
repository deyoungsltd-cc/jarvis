/**
 * Rate Limiter — in-memory sliding window, no external dependencies.
 *
 * Default: 100 requests per minute per IP.
 * Returns 429 with Retry-After header when exceeded.
 */
import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Time window in milliseconds (default: 60_000 = 1 min) */
  windowMs?: number;
  /** Max requests allowed within the window (default: 100) */
  maxRequests?: number;
  /** Custom key extractor (default: IP address) */
  keyExtractor?: (req: Request) => string;
}

interface Bucket {
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Clean up stale entries every 60 seconds */
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;
const CLEANUP_INTERVAL_MS = 60_000;

const store = new Map<string, Bucket>();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    // Remove timestamps older than 2x the largest window (conservative)
    const cutoff = now - (2 * DEFAULT_WINDOW_MS);
    bucket.timestamps = bucket.timestamps.filter(ts => ts > cutoff);
    if (bucket.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Rate limiter middleware factory.
 *
 * @example
 * app.use(rateLimit({ windowMs: 60_000, maxRequests: 100 }));
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = opts.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const keyExtractor = opts.keyExtractor ?? defaultKeyExtractor;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyExtractor(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let bucket = store.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      store.set(key, bucket);
    }

    // Sliding window: keep only timestamps within the window
    bucket.timestamps = bucket.timestamps.filter(ts => ts > windowStart);

    if (bucket.timestamps.length >= maxRequests) {
      // Calculate when the oldest request in the window will expire
      const oldestInWindow = bucket.timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${retryAfterSec}s.`,
          limit: maxRequests,
          remaining: 0,
          retryAfter: retryAfterSec,
        },
      });
    }

    // Record this request
    bucket.timestamps.push(now);

    // Add rate limit headers
    const remaining = maxRequests - bucket.timestamps.length;
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

    next();
  };
}

/** Default key extractor: client IP */
function defaultKeyExtractor(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
