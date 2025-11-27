/**
 * WhatsApp Conversations API - Collection Endpoints
 * GET  /api/v1/whatsapp/conversations - List conversations with filters
 * POST /api/v1/whatsapp/conversations - Create conversation
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getConversationManager } from '@/lib/whatsapp-conversation-manager';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import {
  validateBody,
  validateQuery,
  createConversationSchema,
  conversationFiltersSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.conversations');

/**
 * GET /api/v1/whatsapp/conversations
 * List conversations with filters (status, date, agent, tags)
 */
export const GET = withWhatsAppAuth(['conversation:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'conversations:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(conversationFiltersSchema, searchParams);

    // Get conversations
    const conversationManager = getConversationManager();
    const result = await conversationManager.getConversations(context, {
      status: filters.status,
      assignedTo: filters.assignedTo,
      tags: filters.tags,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.info('Conversations listed', {
      teamId: context.teamId,
      count: result.conversations.length,
      total: result.total,
      filters,
    });

    const response = successResponse(result.conversations, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing conversations', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/conversations
 * Create a new conversation (rare, usually auto-created)
 */
export const POST = withWhatsAppAuth(['conversation:create'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'conversations:create', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(createConversationSchema, body);

    // Create conversation
    const conversationManager = getConversationManager();
    const conversation = await conversationManager.createConversation(context, {
      contactId: validatedData.contactId,
      phoneNumber: validatedData.phoneNumber,
    });

    logger.info('Conversation created', {
      teamId: context.teamId,
      conversationId: conversation.id,
      contactId: validatedData.contactId,
    });

    const response = successResponse(conversation, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error creating conversation', { error });
    return handleApiError(error);
  }
});
