/**
 * WhatsApp Message API - Individual Message Endpoints
 * GET    /api/v1/whatsapp/messages/:messageId - Get message details
 * DELETE /api/v1/whatsapp/messages/:messageId - Delete message
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getMessageHandler } from '@/lib/whatsapp-message-handler';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, messageIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.messages.detail');

/**
 * GET /api/v1/whatsapp/messages/:messageId
 * Get details of a specific message
 */
export const GET = withWhatsAppAuth(
  ['message:read'],
  async (req: NextRequest, { params }: { params: { messageId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'messages:get', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { messageId } = validateParams(messageIdSchema, params);

      // Get message
      const messageHandler = getMessageHandler();
      const message = await messageHandler.getMessage(context.teamId, messageId);

      if (!message) {
        return handleApiError({ name: 'NotFoundError', message: 'Message not found' }, 404);
      }

      logger.info('Message retrieved', {
        teamId: context.teamId,
        messageId,
      });

      const response = successResponse(message);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving message', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/messages/:messageId
 * Delete a message
 */
export const DELETE = withWhatsAppAuth(
  ['message:delete'],
  async (req: NextRequest, { params }: { params: { messageId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'messages:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { messageId } = validateParams(messageIdSchema, params);

      // Delete message
      const messageHandler = getMessageHandler();
      await messageHandler.deleteMessage(context.teamId, messageId);

      logger.info('Message deleted', {
        teamId: context.teamId,
        messageId,
      });

      const response = successResponse({
        message: 'Message deleted successfully',
        messageId,
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error deleting message', { error });
      return handleApiError(error);
    }
  },
);
