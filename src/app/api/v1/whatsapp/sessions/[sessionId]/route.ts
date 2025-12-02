/**
 * WhatsApp Session API - Individual Session Endpoints
 * GET    /api/v1/whatsapp/sessions/:sessionId - Get session details
 * DELETE /api/v1/whatsapp/sessions/:sessionId - Terminate session
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getSessionManager } from '@/lib/whatsapp-session-manager';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, sessionIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.sessions.detail');

/**
 * GET /api/v1/whatsapp/sessions/:sessionId
 * Get details of a specific WhatsApp session
 */
export const GET = withWhatsAppAuth(
  ['session:read'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:get', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Get session
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(context.teamId, sessionId);

      if (!session) {
        return handleApiError({ name: 'NotFoundError', message: 'Session not found' }, 404);
      }

      logger.info('Session retrieved', {
        teamId: context.teamId,
        sessionId,
      });

      const response = successResponse(session);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving session', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/sessions/:sessionId
 * Terminate a WhatsApp session
 */
export const DELETE = withWhatsAppAuth(
  ['session:delete'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Terminate session
      const sessionManager = getSessionManager();
      await sessionManager.terminateSession(context.teamId, sessionId);

      logger.info('Session terminated', {
        teamId: context.teamId,
        sessionId,
      });

      const response = successResponse(
        { message: 'Session terminated successfully' },
        undefined,
        200,
      );

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error terminating session', { error });
      return handleApiError(error);
    }
  },
);
