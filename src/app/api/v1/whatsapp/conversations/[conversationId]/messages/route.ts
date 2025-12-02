/**
 * WhatsApp Conversations Messages API
 * GET /api/v1/whatsapp/conversations/[conversationId]/messages - List messages in conversation
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getConversationManager } from '@/lib/whatsapp-conversation-manager';
import {
  successResponse,
  handleApiError,
  parsePagination,
  createPaginationMeta,
} from '@/lib/api/response-helpers';
import { validateParams, conversationIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.conversations.messages');

/**
 * GET /api/v1/whatsapp/conversations/[conversationId]/messages
 * List all messages in a conversation with pagination
 */
export const GET = withWhatsAppAuth(
  ['conversation:read'],
  async (req: NextRequest, { params }: { params: { conversationId: string } }) => {
    try {
      const context = await createTenantContext(req);
      const { searchParams } = new URL(req.url);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'conversations:messages:list', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { conversationId } = validateParams(conversationIdSchema, params);

      // Parse pagination
      const { limit, offset } = parsePagination(searchParams);

      // Get messages
      const conversationManager = getConversationManager();
      const result = await conversationManager.getConversationMessages(context, conversationId, {
        limit,
        offset,
      });

      logger.info('Conversation messages listed', {
        teamId: context.teamId,
        conversationId,
        count: result.messages.length,
        total: result.total,
      });

      const response = successResponse(result.messages, {
        pagination: createPaginationMeta(result.total, limit, offset),
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error listing conversation messages', { error });
      return handleApiError(error);
    }
  },
);
