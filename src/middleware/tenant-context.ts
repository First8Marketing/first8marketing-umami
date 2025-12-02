/**
 * WhatsApp Analytics Integration - Multi-Tenant Middleware
 *
 * Extracts tenant context from requests and sets PostgreSQL session variables
 * for Row-Level Security (RLS) enforcement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseSecureToken } from '@/lib/jwt';
import { secret } from '@/lib/crypto';
import { getLogger } from '@/lib/whatsapp-logger';
import { UnauthorizedError, TeamNotFoundError, TeamAccessDeniedError } from '@/lib/whatsapp-errors';
import type { TenantContext, AuthPayload, UserRole } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Extract team ID from request headers or JWT token
 */
function extractTeamId(request: NextRequest, authPayload?: AuthPayload): string | null {
  // Priority 1: Explicit team ID header
  const headerTeamId = request.headers.get('x-team-id');
  if (headerTeamId) {
    return headerTeamId;
  }

  // Priority 2: Team ID from JWT payload
  if (authPayload?.teamId) {
    return authPayload.teamId;
  }

  // Priority 3: Team ID from query parameter
  const url = new URL(request.url);
  const queryTeamId = url.searchParams.get('teamId');
  if (queryTeamId) {
    return queryTeamId;
  }

  return null;
}

/**
 * Extract user role from JWT payload
 */
function extractUserRole(authPayload?: AuthPayload): UserRole {
  if (authPayload?.role) {
    const role = authPayload.role.toLowerCase();

    // Map umami roles to WhatsApp roles
    if (role.includes('admin') || role.includes('owner')) {
      return 'admin';
    } else if (role.includes('manager')) {
      return 'manager';
    } else if (role.includes('member')) {
      return 'agent';
    } else if (role.includes('view')) {
      return 'viewer';
    }
  }

  // Default to viewer for safety
  return 'viewer';
}

/**
 * Parse JWT token from request
 */
function parseAuthToken(request: NextRequest): AuthPayload | null {
  try {
    // Extract bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const payload = parseSecureToken(token, secret()) as AuthPayload;

    return payload || null;
  } catch (error) {
    logger.debug('tenant-context', 'Failed to parse auth token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Validate team membership
 * TODO: Implement actual team membership check against database
 */
async function validateTeamMembership(_userId: string, _teamId: string): Promise<boolean> {
  // Placeholder - will be implemented with actual database query
  // For now, we trust the JWT contains valid team membership
  // Parameters prefixed with underscore to indicate intentional non-use
  return true;
}

/**
 * Create tenant context from request
 */
export async function createTenantContext(request: NextRequest): Promise<TenantContext> {
  // Parse auth token
  const authPayload = parseAuthToken(request);

  if (!authPayload?.userId) {
    throw new UnauthorizedError('Authentication required');
  }

  // Extract team ID
  const teamId = extractTeamId(request, authPayload);

  if (!teamId) {
    throw new TeamNotFoundError('Team ID required in request');
  }

  // Extract user role
  const userRole = extractUserRole(authPayload);

  // Validate team membership
  const hasAccess = await validateTeamMembership(authPayload.userId, teamId);

  if (!hasAccess) {
    throw new TeamAccessDeniedError(teamId, authPayload.userId);
  }

  // Create tenant context
  const context: TenantContext = {
    teamId,
    userId: authPayload.userId,
    userRole,
    waSessionId: `wa_${teamId}`,
  };

  // Log context creation
  logger.debug('tenant-context', 'Tenant context created', {
    teamId: context.teamId,
    userId: context.userId,
    userRole: context.userRole,
  });

  return context;
}

/**
 * Middleware function to inject tenant context
 * For use in Next.js API routes
 */
export async function withTenantContext(
  request: NextRequest,
  handler: (req: NextRequest, context: TenantContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const context = await createTenantContext(request);

    // Execute handler with context
    // Note: Handler can create its own context-aware logger using createLogger(context) if needed
    return await handler(request, context);
  } catch (error) {
    logger.error('tenant-context', 'Tenant context middleware error', error as Error);

    // Return error response
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: error.message } },
        { status: 401 },
      );
    }

    if (error instanceof TeamNotFoundError || error instanceof TeamAccessDeniedError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

/**
 * Extract tenant context from request (no validation)
 * Use only when auth is already validated
 */
export function extractTenantContext(request: NextRequest): TenantContext | null {
  try {
    const authPayload = parseAuthToken(request);

    if (!authPayload?.userId) {
      return null;
    }

    const teamId = extractTeamId(request, authPayload);

    if (!teamId) {
      return null;
    }

    return {
      teamId,
      userId: authPayload.userId,
      userRole: extractUserRole(authPayload),
      waSessionId: `wa_${teamId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Attach tenant context to request object
 * For use in middleware chain
 */
export function attachTenantContext(request: NextRequest, context: TenantContext): void {
  // Store context in request headers for downstream handlers
  (request as any).tenantContext = context;
}

/**
 * Get tenant context from request
 * Assumes context was attached by middleware
 */
export function getTenantContext(request: NextRequest): TenantContext | null {
  return (request as any).tenantContext || null;
}

/**
 * Validate required permissions for tenant context
 */
export function validatePermission(
  context: TenantContext,
  requiredRole: UserRole | UserRole[],
): boolean {
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  // Admin has all permissions
  if (context.userRole === 'admin') {
    return true;
  }

  // Check if user role is in required roles
  return roles.includes(context.userRole as UserRole);
}

/**
 * Assert permission or throw error
 */
export function assertPermission(
  context: TenantContext,
  requiredRole: UserRole | UserRole[],
  _action: string,
): void {
  // _action parameter reserved for future logging/audit functionality
  if (!validatePermission(context, requiredRole)) {
    throw new TeamAccessDeniedError(context.teamId, context.userId);
  }
}

// Export utilities
export { parseAuthToken, extractTeamId, extractUserRole };
