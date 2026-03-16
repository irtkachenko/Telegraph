/**
 * Rate limiter for Server Actions
 * Uses LRU cache to store request counts
 */

import { LRUCache } from 'lru-cache';

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

// Cache for storing request counters with entries {count, windowStart}
// Key: identifier, Value: { count, windowStart }
const rateLimitCache = new LRUCache<string, { count: number; windowStart: number }>({
  max: 1000, // Maximum number of unique users
  ttl: 5 * 60 * 1000, // 5 minutes - covers all possible windows
});

/**
 * Checks if request limit is exceeded
 * @param identifier - Unique identifier (userId, IP, etc.)
 * @param options - Rate limiting settings
 * @returns true if allowed, false if limit exceeded
 */
export function rateLimit(identifier: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  const existing = rateLimitCache.get(identifier);

  // If no entry or window expired - reset counter
  if (!existing || now - existing.windowStart >= options.windowMs) {
    rateLimitCache.set(identifier, { count: 1, windowStart: now });
    return true;
  }

  // Check limit
  if (existing.count >= options.maxRequests) {
    return false; // Rate limit exceeded
  }

  // Increase counter
  existing.count++;
  rateLimitCache.set(identifier, existing);
  return true;
}

/**
 * Cleans up stale entries (called periodically)
 */
export function cleanupRateLimitCache(): void {
  rateLimitCache.purgeStale();
}

/**
 * Gets rate limiting statistics
 */
export function getRateLimitStats(): {
  size: number;
  maxSize: number;
} {
  return {
    size: rateLimitCache.size,
    maxSize: rateLimitCache.max,
  };
}
