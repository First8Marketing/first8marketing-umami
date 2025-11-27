/**
 * WhatsApp Analytics Integration - Error Handling Utilities
 *
 * Custom error classes and error handling utilities for WhatsApp integration.
 * Provides structured error responses and logging.
 */

import { WhatsAppErrorCode, type WhatsAppError } from '@/types/whatsapp';

/**
 * HTTP status codes mapped to error codes
 */
const ERROR_STATUS_CODES: Record<WhatsAppErrorCode, number> = {
  // Session errors (400-499)
  [WhatsAppErrorCode.SESSION_NOT_FOUND]: 404,
  [WhatsAppErrorCode.SESSION_ALREADY_EXISTS]: 409,
  [WhatsAppErrorCode.SESSION_AUTH_FAILED]: 401,
  [WhatsAppErrorCode.SESSION_DISCONNECTED]: 503,
  [WhatsAppErrorCode.SESSION_LIMIT_EXCEEDED]: 429,

  // Message errors (400-499)
  [WhatsAppErrorCode.MESSAGE_SEND_FAILED]: 500,
  [WhatsAppErrorCode.MESSAGE_NOT_FOUND]: 404,
  [WhatsAppErrorCode.INVALID_PHONE_NUMBER]: 400,
  [WhatsAppErrorCode.INVALID_MESSAGE_TYPE]: 400,

  // Auth errors (401-403)
  [WhatsAppErrorCode.UNAUTHORIZED]: 401,
  [WhatsAppErrorCode.FORBIDDEN]: 403,
  [WhatsAppErrorCode.INVALID_TOKEN]: 401,
  [WhatsAppErrorCode.TOKEN_EXPIRED]: 401,

  // Tenant errors (403-404)
  [WhatsAppErrorCode.TEAM_NOT_FOUND]: 404,
  [WhatsAppErrorCode.TEAM_ACCESS_DENIED]: 403,

  // Rate limit errors (429)
  [WhatsAppErrorCode.RATE_LIMIT_EXCEEDED]: 429,

  // Database errors (500)
  [WhatsAppErrorCode.DATABASE_ERROR]: 500,
  [WhatsAppErrorCode.CONSTRAINT_VIOLATION]: 400,

  // General errors
  [WhatsAppErrorCode.INTERNAL_ERROR]: 500,
  [WhatsAppErrorCode.INVALID_INPUT]: 400,
  [WhatsAppErrorCode.NOT_IMPLEMENTED]: 501,
};

/**
 * User-friendly error messages
 */
const ERROR_MESSAGES: Record<WhatsAppErrorCode, string> = {
  // Session errors
  [WhatsAppErrorCode.SESSION_NOT_FOUND]: 'WhatsApp session not found',
  [WhatsAppErrorCode.SESSION_ALREADY_EXISTS]: 'WhatsApp session already exists for this team',
  [WhatsAppErrorCode.SESSION_AUTH_FAILED]: 'WhatsApp authentication failed',
  [WhatsAppErrorCode.SESSION_DISCONNECTED]: 'WhatsApp session disconnected',
  [WhatsAppErrorCode.SESSION_LIMIT_EXCEEDED]: 'Maximum number of sessions exceeded',

  // Message errors
  [WhatsAppErrorCode.MESSAGE_SEND_FAILED]: 'Failed to send WhatsApp message',
  [WhatsAppErrorCode.MESSAGE_NOT_FOUND]: 'Message not found',
  [WhatsAppErrorCode.INVALID_PHONE_NUMBER]: 'Invalid phone number format',
  [WhatsAppErrorCode.INVALID_MESSAGE_TYPE]: 'Invalid message type',

  // Auth errors
  [WhatsAppErrorCode.UNAUTHORIZED]: 'Authentication required',
  [WhatsAppErrorCode.FORBIDDEN]: 'Access forbidden',
  [WhatsAppErrorCode.INVALID_TOKEN]: 'Invalid authentication token',
  [WhatsAppErrorCode.TOKEN_EXPIRED]: 'Authentication token expired',

  // Tenant errors
  [WhatsAppErrorCode.TEAM_NOT_FOUND]: 'Team not found',
  [WhatsAppErrorCode.TEAM_ACCESS_DENIED]: 'Access denied to team resources',

  // Rate limit errors
  [WhatsAppErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please try again later',

  // Database errors
  [WhatsAppErrorCode.DATABASE_ERROR]: 'Database operation failed',
  [WhatsAppErrorCode.CONSTRAINT_VIOLATION]: 'Data constraint violation',

  // General errors
  [WhatsAppErrorCode.INTERNAL_ERROR]: 'Internal server error',
  [WhatsAppErrorCode.INVALID_INPUT]: 'Invalid input data',
  [WhatsAppErrorCode.NOT_IMPLEMENTED]: 'Feature not yet implemented',
};

/**
 * Base WhatsApp error class
 */
export class BaseWhatsAppError extends Error implements WhatsAppError {
  public readonly code: WhatsAppErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(code: WhatsAppErrorCode, message?: string, details?: Record<string, any>) {
    super(message || ERROR_MESSAGES[code]);
    this.name = 'WhatsAppError';
    this.code = code;
    this.statusCode = ERROR_STATUS_CODES[code];
    this.details = details;
    this.timestamp = new Date();

    // Maintain proper stack trace (only in V8 environments)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON representation
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  /**
   * Convert error to API response format
   */
  toApiResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Session-related errors
 */
export class SessionNotFoundError extends BaseWhatsAppError {
  constructor(sessionId: string) {
    super(WhatsAppErrorCode.SESSION_NOT_FOUND, undefined, { sessionId });
  }
}

export class SessionAlreadyExistsError extends BaseWhatsAppError {
  constructor(teamId: string) {
    super(WhatsAppErrorCode.SESSION_ALREADY_EXISTS, undefined, { teamId });
  }
}

export class SessionAuthFailedError extends BaseWhatsAppError {
  constructor(reason?: string) {
    super(WhatsAppErrorCode.SESSION_AUTH_FAILED, reason);
  }
}

export class SessionDisconnectedError extends BaseWhatsAppError {
  constructor(sessionId: string) {
    super(WhatsAppErrorCode.SESSION_DISCONNECTED, undefined, { sessionId });
  }
}

export class SessionLimitExceededError extends BaseWhatsAppError {
  constructor(currentLimit: number) {
    super(WhatsAppErrorCode.SESSION_LIMIT_EXCEEDED, undefined, { limit: currentLimit });
  }
}

/**
 * Message-related errors
 */
export class MessageSendFailedError extends BaseWhatsAppError {
  constructor(reason?: string, details?: Record<string, any>) {
    super(WhatsAppErrorCode.MESSAGE_SEND_FAILED, reason, details);
  }
}

export class MessageNotFoundError extends BaseWhatsAppError {
  constructor(messageId: string) {
    super(WhatsAppErrorCode.MESSAGE_NOT_FOUND, undefined, { messageId });
  }
}

export class InvalidPhoneNumberError extends BaseWhatsAppError {
  constructor(phoneNumber: string) {
    super(WhatsAppErrorCode.INVALID_PHONE_NUMBER, undefined, { phoneNumber });
  }
}

export class InvalidMessageTypeError extends BaseWhatsAppError {
  constructor(messageType: string) {
    super(WhatsAppErrorCode.INVALID_MESSAGE_TYPE, undefined, { messageType });
  }
}

/**
 * Authentication errors
 */
export class UnauthorizedError extends BaseWhatsAppError {
  constructor(message?: string) {
    super(WhatsAppErrorCode.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends BaseWhatsAppError {
  constructor(resource?: string) {
    super(WhatsAppErrorCode.FORBIDDEN, undefined, { resource });
  }
}

export class InvalidTokenError extends BaseWhatsAppError {
  constructor() {
    super(WhatsAppErrorCode.INVALID_TOKEN);
  }
}

export class TokenExpiredError extends BaseWhatsAppError {
  constructor() {
    super(WhatsAppErrorCode.TOKEN_EXPIRED);
  }
}

/**
 * Tenant errors
 */
export class TeamNotFoundError extends BaseWhatsAppError {
  constructor(teamId: string) {
    super(WhatsAppErrorCode.TEAM_NOT_FOUND, undefined, { teamId });
  }
}

export class TeamAccessDeniedError extends BaseWhatsAppError {
  constructor(teamId: string, userId?: string) {
    super(WhatsAppErrorCode.TEAM_ACCESS_DENIED, undefined, { teamId, userId });
  }
}

/**
 * Rate limit error
 */
export class RateLimitExceededError extends BaseWhatsAppError {
  constructor(limit: number, reset: Date) {
    super(WhatsAppErrorCode.RATE_LIMIT_EXCEEDED, undefined, {
      limit,
      reset: reset.toISOString(),
    });
  }
}

/**
 * Database errors
 */
export class DatabaseError extends BaseWhatsAppError {
  constructor(message: string, details?: Record<string, any>) {
    super(WhatsAppErrorCode.DATABASE_ERROR, message, details);
  }
}

export class ConstraintViolationError extends BaseWhatsAppError {
  constructor(constraint: string, details?: Record<string, any>) {
    super(WhatsAppErrorCode.CONSTRAINT_VIOLATION, `Constraint violation: ${constraint}`, details);
  }
}

/**
 * General errors
 */
export class InternalError extends BaseWhatsAppError {
  constructor(message?: string, details?: Record<string, any>) {
    super(WhatsAppErrorCode.INTERNAL_ERROR, message, details);
  }
}

export class InvalidInputError extends BaseWhatsAppError {
  constructor(field: string, reason?: string) {
    super(WhatsAppErrorCode.INVALID_INPUT, reason || `Invalid input for field: ${field}`, {
      field,
    });
  }
}

export class NotImplementedError extends BaseWhatsAppError {
  constructor(feature: string) {
    super(WhatsAppErrorCode.NOT_IMPLEMENTED, `Feature not implemented: ${feature}`, { feature });
  }
}

export class ValidationError extends BaseWhatsAppError {
  constructor(message: string, details?: Record<string, any>) {
    super(WhatsAppErrorCode.INVALID_INPUT, message, details);
  }
}

/**
 * Check if error is a WhatsApp error
 */
export function isWhatsAppError(error: any): error is WhatsAppError {
  return (
    error instanceof BaseWhatsAppError ||
    (error && typeof error === 'object' && 'code' in error && 'statusCode' in error)
  );
}

/**
 * Convert any error to WhatsApp error
 */
export function toWhatsAppError(error: any): WhatsAppError {
  if (isWhatsAppError(error)) {
    return error;
  }

  // Handle standard errors
  if (error instanceof Error) {
    return new InternalError(error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  // Handle unknown errors
  return new InternalError('Unknown error occurred', {
    originalError: String(error),
  });
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: any) {
  const whatsappError = toWhatsAppError(error);

  return {
    success: false,
    error: {
      code: whatsappError.code,
      message: whatsappError.message,
      ...(whatsappError.details && { details: whatsappError.details }),
    },
  };
}

/**
 * Format error for Next.js API route response
 */
export function sendErrorResponse(res: any, error: any) {
  const whatsappError = toWhatsAppError(error);

  return res.status(whatsappError.statusCode).json(formatErrorResponse(whatsappError));
}

/**
 * Wrap async handler with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(handler: T): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const whatsappError = toWhatsAppError(error);
      throw whatsappError;
    }
  }) as T;
}

/**
 * Assert condition and throw error if false
 */
export function assert(
  condition: boolean,
  errorCode: WhatsAppErrorCode,
  message?: string,
  details?: Record<string, any>,
): asserts condition {
  if (!condition) {
    throw new BaseWhatsAppError(errorCode, message, details);
  }
}

/**
 * Assert value is not null/undefined
 */
export function assertExists<T>(
  value: T | null | undefined,
  errorCode: WhatsAppErrorCode,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new BaseWhatsAppError(errorCode, message);
  }
}
