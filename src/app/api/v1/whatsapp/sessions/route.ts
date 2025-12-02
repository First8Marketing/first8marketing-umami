/**
 * WhatsApp Sessions API - Collection Endpoints
 * GET  /api/v1/whatsapp/sessions - List all sessions
 * POST /api/v1/whatsapp/sessions - Create new session
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getSessionManager } from '@/lib/whatsapp-session-manager';
import {
  successResponse,
  handleApiError,
  parsePagination,
  createPaginationMeta,
} from '@/lib/api/response-helpers';
import { validateBody } from '@/lib/api/validation-schemas';
import { createSessionSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.sessions');

/**
 * GET /api/v1/whatsapp/sessions
 * List all WhatsApp sessions for the team
 */
export const GET = withWhatsAppAuth(['session:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'sessions:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Parse pagination
    const { limit, offset } = parsePagination(searchParams);

    // Get sessions
    const sessionManager = getSessionManager();
    const sessions = await sessionManager.getAllSessions(context.teamId);

    // Apply pagination
    const paginatedSessions = sessions.slice(offset, offset + limit);

    logger.info('Sessions listed', {
      teamId: context.teamId,
      count: paginatedSessions.length,
      total: sessions.length,
    });

    const response = successResponse(paginatedSessions, {
      pagination: createPaginationMeta(sessions.length, limit, offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing sessions', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/sessions
 * Create a new WhatsApp session
 */
export const POST = withWhatsAppAuth(['session:create'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'sessions:create', 'session');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(createSessionSchema, body);

    // Create session
    const sessionManager = getSessionManager();
    const session = await sessionManager.createSession(
      context,
      validatedData.phoneNumber,
      validatedData.name,
    );

    logger.info('Session created', {
      teamId: context.teamId,
      sessionId: session.id,
      phoneNumber: validatedData.phoneNumber,
    });

    const response = successResponse(session, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error creating session', { error });
    return handleApiError(error);
  }
});
