/**
 * Utilities for sanitizing input data
 * Used for protection against SQL/ILIKE injections and XSS
 */

/**
 * Escapes special ILIKE pattern characters in PostgreSQL.
 *
 * In SQL `ILIKE` there are 3 special characters:
 * - `%` - matches any number of characters (similar to `*` in glob)
 * - `_` - matches exactly one character (similar to `?` in glob)
 * - `\` - escape character
 *
 * If not escaped, attacker can:
 * 1. Enter `%` and get ALL records (bypassing search limits)
 * 2. Enter `_` for pattern-matching attacks
 * 3. Enter `\` to break escaping
 *
 * @param input - string to secure for use in ILIKE
 * @returns - safe string with escaped special characters
 *
 * @example
 * ```ts
 * const safe = escapeIlike("john%doe");
 * // safe === "john\\%doe"
 * query.or(`name.ilike.%${safe}%`);
 * ```
 */
export function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Sanitizes search query text:
 * 1. Trims whitespace from edges
 * 2. Limits maximum length (DoS protection)
 * 3. Escapes ILIKE special characters
 *
 * @param input - original search query from user
 * @param maxLength - maximum query length (default 100)
 * @returns - safe string for use in ILIKE
 *
 * @example
 * ```ts
 * const safe = sanitizeSearchQuery("  john%doe_test  ");
 * // safe === "john\\%doe\\_test"
 * ```
 */
export function sanitizeSearchQuery(input: string, maxLength = 100): string {
  const trimmed = input.trim().slice(0, maxLength);
  return escapeIlike(trimmed);
}

/**
 * Validates URL for safe display in Linkify
 * Allows only http/https protocols for XSS protection
 *
 * @param url - URL to validate
 * @returns - true if URL is safe, false otherwise
 *
 * @example
 * ```ts
 * isValidUrlForLinkify("https://example.com") // true
 * isValidUrlForLinkify("javascript:alert('XSS')") // false
 * ```
 */
export function isValidUrlForLinkify(url: string): boolean {
  return /^https?:\/\//.test(url);
}
