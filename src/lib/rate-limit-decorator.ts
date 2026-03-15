/**
 * Rate limiting decorator for API functions
 * Provides client-side rate limiting with configurable windows and limits
 */

import { LRUCache } from 'lru-cache';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (...args: any[]) => string; // Custom key generator
}

export interface RateLimitError extends Error {
  isRateLimitError: true;
  retryAfter: number;
  remainingRequests: number;
}

class RateLimiter {
  private cache = new LRUCache<string, { count: number; resetTime: number }>({
    max: 1000,
    ttl: 300000, // 5 minutes default TTL
  });

  public generateKey(functionName: string, config: RateLimitConfig, args: any[]): string {
    if (config.keyGenerator) {
      return `${functionName}:${config.keyGenerator(...args)}`;
    }

    // Default: use function name only (global rate limit)
    return functionName;
  }

  checkLimit(
    key: string,
    config: RateLimitConfig,
  ): {
    allowed: boolean;
    retryAfter: number;
    remainingRequests: number;
  } {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const existing = this.cache.get(key);

    if (!existing || existing.resetTime <= now) {
      // New window or expired window
      const newEntry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      this.cache.set(key, newEntry);

      return {
        allowed: true,
        retryAfter: 0,
        remainingRequests: config.maxRequests - 1,
      };
    }

    // Existing window
    if (existing.count >= config.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((existing.resetTime - now) / 1000),
        remainingRequests: 0,
      };
    }

    // Increment counter
    existing.count++;
    this.cache.set(key, existing);

    return {
      allowed: true,
      retryAfter: 0,
      remainingRequests: config.maxRequests - existing.count,
    };
  }

  cleanup(): void {
    this.cache.purgeStale();
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

/**
 * Rate limiting decorator factory
 */
export function withRateLimit(config: RateLimitConfig) {
  return <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> | void => {
    const method = descriptor.value!;

    descriptor.value = async function (this: any, ...args: any[]) {
      const key = rateLimiter.generateKey(propertyName, config, args);
      const result = rateLimiter.checkLimit(key, config);

      if (!result.allowed) {
        const error: RateLimitError = new Error(
          `Rate limit exceeded for ${propertyName}. Retry after ${result.retryAfter}s.`,
        ) as RateLimitError;
        error.isRateLimitError = true;
        error.retryAfter = result.retryAfter;
        error.remainingRequests = result.remainingRequests;
        throw error;
      }

      // Call the original method
      return await method.apply(this, args);
    } as T;

    return descriptor;
  };
}

/**
 * Function wrapper for non-decorator usage
 */
export function withRateLimitFn<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: RateLimitConfig & { name?: string },
): T {
  return (async (...args: any[]) => {
    const functionName = config.name || fn.name || 'anonymous';
    const key = rateLimiter.generateKey(functionName, config, args);
    const result = rateLimiter.checkLimit(key, config);

    if (!result.allowed) {
      const error: RateLimitError = new Error(
        `Rate limit exceeded for ${functionName}. Retry after ${result.retryAfter}s.`,
      ) as RateLimitError;
      error.isRateLimitError = true;
      error.retryAfter = result.retryAfter;
      error.remainingRequests = result.remainingRequests;
      throw error;
    }

    return await fn(...args);
  }) as T;
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMITS = {
  CHAT_CREATE: { windowMs: 60000, maxRequests: 5 }, // 5 chats per minute
  MESSAGE_SEND: { windowMs: 60000, maxRequests: 30 }, // 30 messages per minute
  MESSAGE_READ: { windowMs: 60000, maxRequests: 60 }, // 60 read updates per minute
  FILE_UPLOAD: { windowMs: 60000, maxRequests: 10 }, // 10 files per minute
  USER_SEARCH: { windowMs: 60000, maxRequests: 20 }, // 20 searches per minute
  PROFILE_UPDATE: { windowMs: 300000, maxRequests: 3 }, // 3 profile updates per 5 minutes
} as const;

/**
 * Utility functions for rate limit management
 */
export const rateLimitUtils = {
  cleanup: () => rateLimiter.cleanup(),
  getStats: () => rateLimiter.getStats(),
};

/**
 * React Query adapter for rate limiting
 */
export function createRateLimitedQuery<T extends (...args: any[]) => Promise<any>>(
  queryFn: T,
  config: RateLimitConfig & { name?: string },
): T {
  return withRateLimitFn(queryFn, config);
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof Error && 'isRateLimitError' in error;
}
