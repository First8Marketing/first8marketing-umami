/**
 * WhatsApp Conversations Assignment API
 * POST /api/v1/whatsapp/conversations/[conversationId]/assign - Assign conversation to agent
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getConversationManager } from '@/lib/whatsapp-conversation-manager';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import {
  validateParams,
  validateBody,
  conversationIdSchema,
  assignConversationSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.conversations.assign');

/**
 * POST /api/v1/whatsapp/conversations/[conversationId]/assign
 * Assign conversation to a specific agent/user
 */
export const POST = withWhatsAppAuth(
  ['conversation:assign'],
  async (req: NextRequest, { params }: { params: { conversationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'conversations:assign', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params and body
      const { conversationId } = validateParams(conversationIdSchema, params);
      const body = await req.json();
      const { userId } = validateBody(assignConversationSchema, body);

      // Assign conversation
      const conversationManager = getConversationManager();
      const conversation = await conversationManager.assignConversation(
        context,
        conversationId,
        userId,
      );

      // Broadcast assignment event
      await broadcastEvent({
        type: 'conversation:assigned',
        teamId: context.teamId,
        data: {
          conversationId,
          userId,
          assignedBy: context.userId,
        },
      });

      logger.info('Conversation assigned', {
        teamId: context.teamId,
        conversationId,
        userId,
        assignedBy: context.userId,
      });

      const response = successResponse(conversation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error assigning conversation', { error });
      return handleApiError(error);
    }
  },
);
