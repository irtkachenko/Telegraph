/**
 * Standardized response type for all server actions
 * Provides consistent error handling and success responses
 */

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

/**
 * Helper function to create successful responses
 */
export function createSuccessResponse<T>(data: T): ActionResponse<T> {
  return { success: true, data };
}

/**
 * Helper function to create error responses
 */
export function createErrorResponse(error: string, details?: unknown): ActionResponse<never> {
  return { success: false, error, details };
}

/**
 * Common error codes for consistent error handling
 */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;
