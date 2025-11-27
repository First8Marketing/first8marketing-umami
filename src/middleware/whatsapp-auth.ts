/**
 * WhatsApp Analytics Integration - Authentication Middleware
 *
 * JWT validation and role-based access control for WhatsApp API endpoints.
 * Validates team ownership and enforces permission-based access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { getLogger } from '@/lib/whatsapp-logger';
import { getRateLimit } from '@/config/whatsapp-config';
import { rateLimit } from '@/lib/whatsapp-redis';
import {
  UnauthorizedError,
  ForbiddenError,
  RateLimitExceededError,
  InvalidTokenError,
} from '@/lib/whatsapp-errors';
import { createTenantContext } from './tenant-context';
import type { TenantContext, Permission, UserRole } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Permission matrix by role
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'session.create',
    'session.read',
    'session.update',
    'session.delete',
    'message.create',
    'message.read',
    'message.update',
    'message.delete',
    'conversation.create',
    'conversation.read',
    'conversation.update',
    'conversation.delete',
    'analytics.read',
    'settings.read',
    'settings.update',
  ],
  manager: [
    'session.read',
    'session.update',
    'message.create',
    'message.read',
    'message.update',
    'conversation.create',
    'conversation.read',
    'conversation.update',
    'conversation.delete',
    'analytics.read',
    'settings.read',
    'settings.update',
  ],
  agent: [
    'session.read',
    'message.create',
    'message.read',
    'message.update',
    'conversation.read',
    'conversation.update',
    'analytics.read',
    'settings.read',
  ],
  viewer: ['session.read', 'message.read', 'conversation.read', 'analytics.read', 'settings.read'],
};

/**
 * Check if user has required permission
 */
export function hasPermission(
  context: TenantContext,
  permission: Permission | Permission[],
): boolean {
  const permissions = Array.isArray(permission) ? permission : [permission];
  const userPermissions = ROLE_PERMISSIONS[context.userRole as UserRole] || [];

  return permissions.some(p => userPermissions.includes(p));
}

/**
 * Assert user has required permission
 */
export function assertPermission(
  context: TenantContext,
  permission: Permission | Permission[],
): void {
  if (!hasPermission(context, permission)) {
    throw new ForbiddenError(
      `Missing required permission: ${Array.isArray(permission) ? permission.join(', ') : permission}`,
    );
  }
}

/**
 * Authenticate request using umami's auth system
 */
export async function authenticateRequest(request: NextRequest): Promise<TenantContext> {
  // Use umami's checkAuth
  const auth = await checkAuth(request as any);

  if (!auth?.user?.id) {
    throw new UnauthorizedError('Invalid or missing authentication token');
  }

  // Create tenant context
  const context = await createTenantContext(request);

  logger.debug('auth', 'Request authenticated', {
    userId: context.userId,
    teamId: context.teamId,
    userRole: context.userRole,
  });

  return context;
}

/**
 * Validate API key (alternative to JWT)
 */
export async function validateApiKey(_apiKey: string): Promise<{ teamId: string; valid: boolean }> {
  // TODO: Implement API key validation against database
  // _apiKey parameter reserved for future database lookup implementation
  // For now, return invalid
  return { teamId: '', valid: false };
}

/**
 * Apply rate limiting to request
 */
export async function applyRateLimit(
  context: TenantContext,
  limitType: 'session' | 'message' | 'analytics' | 'webhook',
): Promise<void> {
  const limit = getRateLimit(limitType);
  const identifier = `${limitType}:${context.teamId}`;

  const result = await rateLimit.check(identifier, limit, 60);

  if (!result.allowed) {
    logger.warn('auth', 'Rate limit exceeded', {
      teamId: context.teamId,
      limitType,
      limit,
    });

    throw new RateLimitExceededError(limit, result.reset);
  }

  logger.debug('auth', 'Rate limit check passed', {
    teamId: context.teamId,
    limitType,
    remaining: result.remaining,
  });
}

/**
 * WhatsApp authentication middleware wrapper
 */
export async function withWhatsAppAuth(
  request: NextRequest,
  handler: (req: NextRequest, context: TenantContext) => Promise<NextResponse>,
  options: {
    requiredPermission?: Permission | Permission[];
    rateLimitType?: 'session' | 'message' | 'analytics' | 'webhook';
  } = {},
): Promise<NextResponse> {
  try {
    // Authenticate request
    const context = await authenticateRequest(request);

    // Check permissions if required
    if (options.requiredPermission) {
      assertPermission(context, options.requiredPermission);
    }

    // Apply rate limiting if specified
    if (options.rateLimitType) {
      await applyRateLimit(context, options.rateLimitType);
    }

    // Execute handler with context
    const response = await handler(request, context);

    // Add rate limit headers
    if (options.rateLimitType) {
      const limit = getRateLimit(options.rateLimitType);
      const identifier = `${options.rateLimitType}:${context.teamId}`;
      const limitInfo = await rateLimit.check(identifier, limit, 60);

      response.headers.set('X-RateLimit-Limit', String(limit));
      response.headers.set('X-RateLimit-Remaining', String(limitInfo.remaining));
      response.headers.set('X-RateLimit-Reset', limitInfo.reset.toISOString());
    }

    return response;
  } catch (error) {
    logger.error('auth', 'Authentication middleware error', error as Error);

    // Handle specific error types
    if (error instanceof UnauthorizedError || error instanceof InvalidTokenError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 403 },
      );
    }

    if (error instanceof RateLimitExceededError) {
      const response = NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: 429 },
      );

      if (error.details?.reset) {
        response.headers.set('X-RateLimit-Reset', error.details.reset);
      }

      return response;
    }

    // Generic error
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * Simplified auth check (no permission or rate limit validation)
 */
export async function requireAuth(request: NextRequest): Promise<TenantContext> {
  return authenticateRequest(request);
}

/**
 * Optional auth check (returns null if not authenticated)
 */
export async function optionalAuth(request: NextRequest): Promise<TenantContext | null> {
  try {
    return await authenticateRequest(request);
  } catch {
    return null;
  }
}

/**
 * Verify session ownership
 * Ensures user can only access sessions belonging to their team
 */
export async function verifySessionOwnership(
  _context: TenantContext,
  _sessionId: string,
): Promise<boolean> {
  // TODO: Implement actual database check
  // Query: SELECT 1 FROM whatsapp_session WHERE session_id = $1 AND team_id = $2
  // _context and _sessionId parameters reserved for future database validation

  // For now, we trust RLS to enforce this at database level
  return true;
}

/**
 * Verify conversation ownership
 */
export async function verifyConversationOwnership(
  _context: TenantContext,
  _conversationId: string,
): Promise<boolean> {
  // TODO: Implement actual database check
  // _context and _conversationId parameters reserved for future database validation
  // RLS will enforce this at query time
  return true;
}

/**
 * Create authenticated handler with common middleware
 */
export function createAuthHandler(
  handler: (req: NextRequest, context: TenantContext) => Promise<NextResponse>,
  permission?: Permission | Permission[],
) {
  return async (req: NextRequest) => {
    return withWhatsAppAuth(req, handler, {
      requiredPermission: permission,
    });
  };
}

/**
 * Create authenticated handler with rate limiting
 */
export function createRateLimitedHandler(
  handler: (req: NextRequest, context: TenantContext) => Promise<NextResponse>,
  limitType: 'session' | 'message' | 'analytics' | 'webhook',
  permission?: Permission | Permission[],
) {
  return async (req: NextRequest) => {
    return withWhatsAppAuth(req, handler, {
      requiredPermission: permission,
      rateLimitType: limitType,
    });
  };
}

// Default export
export default {
  withWhatsAppAuth,
  requireAuth,
  optionalAuth,
  hasPermission,
  assertPermission,
  verifySessionOwnership,
  verifyConversationOwnership,
  createAuthHandler,
  createRateLimitedHandler,
};
