/**
 * WhatsApp Messages API - Collection Endpoints
 * GET  /api/v1/whatsapp/messages - List messages with filters
 * POST /api/v1/whatsapp/messages - Send new message
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getMessageHandler } from '@/lib/whatsapp-message-handler';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import {
  validateBody,
  validateQuery,
  sendMessageSchema,
  messageFiltersSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';
import { getEventBroadcaster } from '@/lib/websocket-broadcaster';

const logger = getLogger('api.messages');

/**
 * GET /api/v1/whatsapp/messages
 * List messages with filters (conversation, date range, direction)
 */
export const GET = withWhatsAppAuth(['message:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'messages:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(messageFiltersSchema, searchParams);

    // Get messages
    const messageHandler = getMessageHandler();
    const result = await messageHandler.getMessages(context, {
      conversationId: filters.conversationId,
      direction: filters.direction,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.info('Messages listed', {
      teamId: context.teamId,
      count: result.messages.length,
      total: result.total,
      filters,
    });

    const response = successResponse(result.messages, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing messages', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/messages
 * Send a new WhatsApp message
 */
export const POST = withWhatsAppAuth(['message:send'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting (stricter for sending)
    const rateLimit = await applyRateLimit(context.teamId, 'messages:send', 'message');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(sendMessageSchema, body);

    // Send message
    const messageHandler = getMessageHandler();
    const message = await messageHandler.sendMessage(context, {
      conversationId: validatedData.conversationId,
      content: validatedData.content,
      mediaUrl: validatedData.mediaUrl,
      mediaType: validatedData.mediaType,
    });

    // Broadcast message via WebSocket
    const broadcaster = getEventBroadcaster();
    broadcaster.broadcastNewMessage(context.teamId, message);

    logger.info('Message sent', {
      teamId: context.teamId,
      messageId: message.id,
      conversationId: validatedData.conversationId,
    });

    const response = successResponse(message, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error sending message', { error });
    return handleApiError(error);
  }
});
