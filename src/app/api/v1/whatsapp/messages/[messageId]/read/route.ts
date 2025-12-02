/**
 * WhatsApp Message Read Status API
 * POST /api/v1/whatsapp/messages/:messageId/read - Mark message as read
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getMessageHandler } from '@/lib/whatsapp-message-handler';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, messageIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.messages.read');

/**
 * POST /api/v1/whatsapp/messages/:messageId/read
 * Mark a message as read
 */
export const POST = withWhatsAppAuth(
  ['message:manage'],
  async (req: NextRequest, { params }: { params: { messageId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'messages:read', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { messageId } = validateParams(messageIdSchema, params);

      // Mark message as read
      const messageHandler = getMessageHandler();
      await messageHandler.markAsRead(context.teamId, messageId);

      logger.info('Message marked as read', {
        teamId: context.teamId,
        messageId,
      });

      const response = successResponse({
        message: 'Message marked as read',
        messageId,
        readAt: new Date().toISOString(),
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error marking message as read', { error });
      return handleApiError(error);
    }
  },
);
