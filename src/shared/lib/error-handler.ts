/**
 * Error utility functions for handling and logging application errors.
 */

import { toast } from 'sonner';
import type { AppError } from './errors';
import { createErrorFromStatus, getErrorMessage, isAppError, isOperationalError } from './errors';

// Logging configuration
interface ErrorLogConfig {
  enableConsoleLog: boolean;
  enableToast: boolean;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
}

const defaultConfig: ErrorLogConfig = {
  enableConsoleLog: process.env.NODE_ENV === 'development',
  enableToast: true,
  enableRemoteLogging: process.env.NODE_ENV === 'production',
};

// Local storage for errors (for debugging history)
const errorHistory: Array<{
  error: AppError;
  timestamp: Date;
  context?: string;
}> = [];

/**
 * Retrieve the history of handled errors.
 */
export function getErrorHistory() {
  return [...errorHistory];
}

/**
 * Clear the error history.
 */
export function clearErrorHistory() {
  errorHistory.length = 0;
}

/**
 * Core error handler. Processes unknown errors into AppError,
 * logs them, and notifies the user via toast if configured.
 */
export function handleError(
  error: unknown,
  context?: string,
  config: Partial<ErrorLogConfig> = {},
): AppError {
  const finalConfig = { ...defaultConfig, ...config };

  // Convert raw error into structured AppError
  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof Error) {
    appError = createErrorFromStatus(500, error.message, 'UNKNOWN_ERROR');
  } else {
    appError = createErrorFromStatus(500, String(error), 'UNKNOWN_ERROR');
  }

  // Prepend context to the error message for better traceability
  if (context) {
    appError.message = `[${context}] ${appError.message}`;
  }

  // Log to console in development mode
  if (finalConfig.enableConsoleLog) {
    console.group(`🚨 ${appError.name}: ${appError.code}`);
    console.error(appError);
    console.groupEnd();
  }

  // Notify the user via toast
  if (finalConfig.enableToast) {
    showErrorToast(appError);
  }

  // Send to remote logging in production
  if (finalConfig.enableRemoteLogging && finalConfig.remoteEndpoint) {
    logErrorRemotely(appError, context).catch(console.warn);
  }

  // Add to internal history
  errorHistory.push({
    error: appError,
    timestamp: new Date(),
    context,
  });

  // Limit history size to 50 entries
  if (errorHistory.length > 50) {
    errorHistory.shift();
  }

  return appError;
}

/**
 * Display a toast notification based on error type and severity.
 */
function showErrorToast(error: AppError) {
  const title = getToastTitle(error);
  const description = getToastDescription(error);

  if (error.isCritical) {
    toast.error(title, { description });
  } else if (error.status && error.status >= 400 && error.status < 500) {
    toast.warning(title, { description });
  } else {
    toast.error(title, { description });
  }
}

/**
 * Get localized title for the error toast (UI)
 */
function getToastTitle(error: AppError): string {
  switch (error.constructor.name) {
    case 'AuthError':
      return 'Authorization error';
    case 'PermissionError':
      return 'Access denied';
    case 'ValidationError':
      return 'Validation error';
    case 'NetworkError':
      return 'Network error';
    case 'NotFoundError':
      return 'Not found';
    case 'DatabaseError':
      return 'Database error';
    case 'ConfigError':
      return 'Configuration error';
    default:
      return 'Error';
  }
}

/**
 * Get localized description for the error toast (UI)
 */
function getToastDescription(error: AppError): string {
  // For operational errors, show the detailed message
  if (error.isOperational) {
    return error.message;
  }

  // For critical/unexpected errors, show a generic message
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Send error data to remote logging endpoint.
 */
async function logErrorRemotely(error: AppError, context?: string) {
  try {
    const response = await fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.toJSON(),
        context,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      }),
    });

    if (!response.ok) {
      console.warn('Failed to log error remotely:', response.statusText);
    }
  } catch (remoteError) {
    console.warn('Remote logging failed:', remoteError);
  }
}

/**
 * Wrapper for async functions to automatically handle errors.
 */
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context?: string,
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  };
}

/**
 * Error handler factory for React Query queries and mutations.
 */
export function createQueryErrorHandler(context?: string) {
  return (error: unknown) => {
    handleError(error, context);
  };
}

/**
 * Error handler for React Error Boundary components.
 */
export function createBoundaryErrorHandler(context?: string) {
  return (error: Error, errorInfo: React.ErrorInfo) => {
    const enhancedError = handleError(error, context);

    // Provide React Error Info in development
    if (process.env.NODE_ENV === 'development') {
      console.group('React Error Info');
      console.error(errorInfo);
      console.groupEnd();
    }

    return enhancedError;
  };
}

/**
 * Determine if an error should trigger a retry attempt.
 */
export function shouldRetry(error: unknown): boolean {
  if (!isAppError(error)) {
    return false;
  }

  // Retry for network errors and 5xx server errors
  return (
    error.constructor.name === 'NetworkError' || (error.status !== undefined && error.status >= 500)
  );
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 */
export function getRetryDelay(attemptNumber: number, error: unknown): number {
  if (!shouldRetry(error)) {
    return 0;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
  const delay = Math.min(1000 * 2 ** (attemptNumber - 1), 30000);

  // Add jitter to avoid thundering herd problem
  return delay + Math.random() * 1000;
}
