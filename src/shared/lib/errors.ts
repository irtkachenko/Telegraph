/**
 * Centralized error handling system
 */

// Base class for all application errors
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Restore prototype for instanceof check
    Object.setPrototypeOf(this, new.target.prototype);

    // Add stack for debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Convert to JSON for logging
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      isOperational: this.isOperational,
      stack: this.stack,
    };
  }

  // Check if this is a critical error
  get isCritical(): boolean {
    return !this.isOperational;
  }
}

// Authorization errors
export class AuthError extends AppError {
  constructor(message: string, code = 'AUTH_ERROR', status = 401) {
    super(message, code, status);
  }
}

// Access errors (403)
export class PermissionError extends AppError {
  constructor(message: string, code = 'PERMISSION_DENIED', status = 403) {
    super(message, code, status);
  }
}

// Validation errors
export class ValidationError extends AppError {
  constructor(
    message: string,
    public field?: string,
    code = 'VALIDATION_ERROR',
    status = 400,
  ) {
    super(message, code, status);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
    };
  }
}

// Network errors
export class NetworkError extends AppError {
  constructor(
    message: string,
    public endpoint?: string,
    code = 'NETWORK_ERROR',
    status = 500,
  ) {
    super(message, code, status);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      endpoint: this.endpoint,
    };
  }
}

// Not found errors
export class NotFoundError extends AppError {
  constructor(message: string, resource?: string, code = 'NOT_FOUND', status = 404) {
    super(message, code, status);
    this.resource = resource;
  }

  public resource?: string;

  toJSON() {
    return {
      ...super.toJSON(),
      resource: this.resource,
    };
  }
}

// Configuration errors
export class ConfigError extends AppError {
  constructor(message: string, code = 'CONFIG_ERROR') {
    super(message, code, 500);
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public query?: string,
    code = 'DATABASE_ERROR',
    status = 500,
  ) {
    super(message, code, status);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      query: this.query,
    };
  }
}

// Factory for creating errors from HTTP status
export function createErrorFromStatus(status: number, message: string, code?: string): AppError {
  switch (status) {
    case 400:
      return new ValidationError(message, code);
    case 401:
      return new AuthError(message, code);
    case 403:
      return new PermissionError(message, code);
    case 404:
      return new NotFoundError(message, code);
    case 500:
    case 502:
    case 503:
    case 504:
      return new NetworkError(message, undefined, code, status);
    default:
      return new AppError(message, code || 'UNKNOWN_ERROR', status);
  }
}

// Check if this is a known error
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Safe error message extraction
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Check if this is an operational error (non-critical)
export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}
