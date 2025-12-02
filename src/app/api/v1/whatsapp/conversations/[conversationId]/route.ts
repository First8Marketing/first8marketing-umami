/**
 * WhatsApp Conversations API - Individual Conversation
 * GET    /api/v1/whatsapp/conversations/[conversationId] - Get conversation details
 * PATCH  /api/v1/whatsapp/conversations/[conversationId] - Update conversation
 * DELETE /api/v1/whatsapp/conversations/[conversationId] - Archive conversation
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
  updateConversationSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.conversations');

/**
 * GET /api/v1/whatsapp/conversations/[conversationId]
 * Get detailed information about a conversation
 */
export const GET = withWhatsAppAuth(
  ['conversation:read'],
  async (req: NextRequest, { params }: { params: { conversationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'conversations:read', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { conversationId } = validateParams(conversationIdSchema, params);

      // Get conversation
      const conversationManager = getConversationManager();
      const conversation = await conversationManager.getConversation(context, conversationId);

      if (!conversation) {
        return handleApiError({ name: 'NotFoundError', message: 'Conversation not found' }, 404);
      }

      logger.info('Conversation retrieved', {
        teamId: context.teamId,
        conversationId,
      });

      const response = successResponse(conversation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving conversation', { error });
      return handleApiError(error);
    }
  },
);

/**
 * PATCH /api/v1/whatsapp/conversations/[conversationId]
 * Update conversation details (status, tags, notes, assignment)
 */
export const PATCH = withWhatsAppAuth(
  ['conversation:update'],
  async (req: NextRequest, { params }: { params: { conversationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'conversations:update', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params and body
      const { conversationId } = validateParams(conversationIdSchema, params);
      const body = await req.json();
      const validatedData = validateBody(updateConversationSchema, body);

      // Update conversation
      const conversationManager = getConversationManager();
      const conversation = await conversationManager.updateConversation(
        context,
        conversationId,
        validatedData,
      );

      // Broadcast update event
      await broadcastEvent({
        type: 'conversation:updated',
        teamId: context.teamId,
        data: {
          conversationId,
          updates: validatedData,
        },
      });

      logger.info('Conversation updated', {
        teamId: context.teamId,
        conversationId,
        updates: Object.keys(validatedData),
      });

      const response = successResponse(conversation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error updating conversation', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/conversations/[conversationId]
 * Archive a conversation (soft delete)
 */
export const DELETE = withWhatsAppAuth(
  ['conversation:delete'],
  async (req: NextRequest, { params }: { params: { conversationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'conversations:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { conversationId } = validateParams(conversationIdSchema, params);

      // Archive conversation
      const conversationManager = getConversationManager();
      await conversationManager.archiveConversation(context, conversationId);

      // Broadcast archive event
      await broadcastEvent({
        type: 'conversation:archived',
        teamId: context.teamId,
        data: { conversationId },
      });

      logger.info('Conversation archived', {
        teamId: context.teamId,
        conversationId,
      });

      const response = successResponse({ success: true, conversationId });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error archiving conversation', { error });
      return handleApiError(error);
    }
  },
);
