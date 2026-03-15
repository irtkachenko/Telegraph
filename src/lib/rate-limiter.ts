/**
 * Rate limiter для Server Actions
 * Використовує LRU cache для зберігання кількості запитів
 */

import { LRUCache } from 'lru-cache';

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

// Cache для зберігання лічильників запитів з записами {count, windowStart}
// Key: identifier, Value: { count, windowStart }
const rateLimitCache = new LRUCache<string, { count: number; windowStart: number }>({
  max: 1000, // Максимальна кількість унікальних користувачів
  ttl: 5 * 60 * 1000, // 5 хвилин — покриває всі можливі вікна
});

/**
 * Перевіряє, чи не перевищено ліміт запитів
 * @param identifier - Унікальний ідентифікатор (userId, IP, etc.)
 * @param options - Налаштування rate limiting
 * @returns true якщо дозволено, false якщо ліміт перевищено
 */
export function rateLimit(identifier: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  const existing = rateLimitCache.get(identifier);

  // Якщо записи немає або вікно сплило — скидаємо лічильник
  if (!existing || now - existing.windowStart >= options.windowMs) {
    rateLimitCache.set(identifier, { count: 1, windowStart: now });
    return true;
  }

  // Перевіряємо ліміт
  if (existing.count >= options.maxRequests) {
    return false; // Rate limit exceeded
  }

  // Збільшуємо лічильник
  existing.count++;
  rateLimitCache.set(identifier, existing);
  return true;
}

/**
 * Очищує застарілі записи (викликається періодично)
 */
export function cleanupRateLimitCache(): void {
  rateLimitCache.purgeStale();
}

/**
 * Отримує статистику по rate limiting
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
