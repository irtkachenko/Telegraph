/**
 * Centralized error handling system - Public API
 */

// Export error handling utilities
export {
  clearErrorHistory,
  createBoundaryErrorHandler,
  createQueryErrorHandler,
  getErrorHistory,
  getRetryDelay,
  handleError,
  shouldRetry,
  withErrorHandling,
} from './error-handler';
// Export all error classes
export {
  AppError,
  AuthError,
  ConfigError,
  createErrorFromStatus,
  DatabaseError,
  getErrorMessage,
  isAppError,
  isOperationalError,
  NetworkError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from './errors';

// TypeScript types
export interface ErrorLogConfig {
  enableConsoleLog: boolean;
  enableToast: boolean;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
}
