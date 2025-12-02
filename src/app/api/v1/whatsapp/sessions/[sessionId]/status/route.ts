/**
 * WhatsApp Session Status API
 * GET /api/v1/whatsapp/sessions/:sessionId/status - Check session status
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getSessionManager } from '@/lib/whatsapp-session-manager';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, sessionIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.sessions.status');

/**
 * GET /api/v1/whatsapp/sessions/:sessionId/status
 * Check WhatsApp session status and health
 */
export const GET = withWhatsAppAuth(
  ['session:read'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting (higher limit for polling)
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:status', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Get session status
      const sessionManager = getSessionManager();
      const status = await sessionManager.getSessionStatus(context.teamId, sessionId);

      if (!status) {
        return handleApiError({ name: 'NotFoundError', message: 'Session not found' }, 404);
      }

      logger.debug('Session status checked', {
        teamId: context.teamId,
        sessionId,
        status: status.state,
      });

      const response = successResponse({
        sessionId,
        state: status.state,
        isConnected: status.isConnected,
        lastSeen: status.lastSeen,
        phoneNumber: status.phoneNumber,
        deviceInfo: status.deviceInfo,
        qrCodeRequired: status.qrCodeRequired,
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error checking session status', { error });
      return handleApiError(error);
    }
  },
);
