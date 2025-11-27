/**
 * WhatsApp Session Logout API
 * POST /api/v1/whatsapp/sessions/:sessionId/logout - Logout session
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getSessionManager } from '@/lib/whatsapp-session-manager';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, sessionIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.sessions.logout');

/**
 * POST /api/v1/whatsapp/sessions/:sessionId/logout
 * Logout WhatsApp session (preserves session record)
 */
export const POST = withWhatsAppAuth(
  ['session:manage'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:logout', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Logout session
      const sessionManager = getSessionManager();
      await sessionManager.logoutSession(context.teamId, sessionId);

      logger.info('Session logged out', {
        teamId: context.teamId,
        sessionId,
      });

      const response = successResponse({
        message: 'Session logged out successfully',
        sessionId,
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error logging out session', { error });
      return handleApiError(error);
    }
  },
);
