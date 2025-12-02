/**
 * API Response Helpers
 * Standardized response formats and error handling for WhatsApp API endpoints
 */

import { NextResponse } from 'next/server';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger();

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    timestamp: string;
  };
}

export interface PaginationParams {
  limit: number;
  offset: number;
  cursor?: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  meta?: Omit<ApiResponse<T>['meta'], 'timestamp'>,
  status: number = 200,
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        ...meta,
        timestamp: new Date().toISOString(),
      },
    },
    { status },
  );
}

/**
 * Create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: any,
  status: number = 500,
): NextResponse<ApiResponse> {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(response, { status });
}

/**
 * Parse pagination parameters from URL search params
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
  const cursor = searchParams.get('cursor') || undefined;

  return { limit, offset, cursor };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(total: number, limit: number, offset: number): PaginationMeta {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Handle API errors with proper status codes
 */
export function handleApiError(error: any): NextResponse<ApiResponse> {
  // Custom error types from Phase 3
  if (error.name === 'ValidationError') {
    return errorResponse('VALIDATION_ERROR', error.message, error.details, 400);
  }

  if (error.name === 'AuthenticationError') {
    return errorResponse('AUTHENTICATION_ERROR', error.message, null, 401);
  }

  if (error.name === 'AuthorizationError') {
    return errorResponse('AUTHORIZATION_ERROR', error.message, null, 403);
  }

  if (error.name === 'NotFoundError') {
    return errorResponse('NOT_FOUND', error.message, null, 404);
  }

  if (error.name === 'ConflictError') {
    return errorResponse('CONFLICT', error.message, error.details, 409);
  }

  if (error.name === 'RateLimitError') {
    return errorResponse('RATE_LIMIT_EXCEEDED', error.message, null, 429);
  }

  // Database errors
  if (error.code === 'PGRST116' || error.code === '23505') {
    return errorResponse('CONFLICT', 'Resource already exists', null, 409);
  }

  if (error.code === '23503') {
    return errorResponse('INVALID_REFERENCE', 'Referenced resource does not exist', null, 400);
  }

  // WhatsApp specific errors
  if (error.message?.includes('WhatsApp')) {
    return errorResponse('WHATSAPP_ERROR', error.message, null, 502);
  }

  // Generic server error
  logger.error('api', 'API Error', error instanceof Error ? error : new Error(String(error)));
  return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', error.stack, 500);
}

/**
 * Parse sort parameters from URL
 */
export function parseSortParams(searchParams: URLSearchParams): {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} {
  const sortBy = searchParams.get('sortBy') || undefined;
  const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

  return { sortBy, sortOrder };
}

/**
 * Parse filter parameters from URL
 */
export function parseFilters(
  searchParams: URLSearchParams,
  allowedFilters: string[],
): Record<string, any> {
  const filters: Record<string, any> = {};

  for (const filter of allowedFilters) {
    const value = searchParams.get(filter);
    if (value !== null) {
      filters[filter] = value;
    }
  }

  return filters;
}

/**
 * Parse date range from URL
 */
export function parseDateRange(searchParams: URLSearchParams): {
  startDate?: Date;
  endDate?: Date;
} {
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: any,
  requiredFields: string[],
): { valid: boolean; missing?: string[] } {
  const missing = requiredFields.filter(field => !(field in body) || body[field] === undefined);

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}
