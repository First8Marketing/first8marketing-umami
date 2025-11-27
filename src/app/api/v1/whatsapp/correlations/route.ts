/**
 * WhatsApp Correlations API - Collection Endpoints
 * GET  /api/v1/whatsapp/correlations - List correlations
 * POST /api/v1/whatsapp/correlations - Trigger new correlation
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getCorrelationEngine } from '@/lib/whatsapp-correlation-engine';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import {
  validateQuery,
  validateBody,
  correlationFiltersSchema,
  triggerCorrelationSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.correlations');

/**
 * GET /api/v1/whatsapp/correlations
 * List phone-user correlations with filters
 */
export const GET = withWhatsAppAuth(['correlation:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'correlations:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(correlationFiltersSchema, searchParams);

    // Get correlations
    const correlationEngine = getCorrelationEngine();
    const result = await correlationEngine.getCorrelations(context, {
      userId: filters.userId,
      phoneNumber: filters.phoneNumber,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.info('Correlations listed', {
      teamId: context.teamId,
      count: result.correlations.length,
      total: result.total,
      filters,
    });

    const response = successResponse(result.correlations, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing correlations', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/correlations
 * Trigger a new phone-user correlation verification
 */
export const POST = withWhatsAppAuth(['correlation:create'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'correlations:trigger', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(triggerCorrelationSchema, body);

    // Trigger correlation
    const correlationEngine = getCorrelationEngine();
    const correlation = await correlationEngine.triggerCorrelation(context, {
      phoneNumber: validatedData.phoneNumber,
      userId: validatedData.userId,
      metadata: validatedData.metadata,
    });

    // Broadcast correlation event
    await broadcastEvent({
      type: 'correlation:triggered',
      teamId: context.teamId,
      data: {
        correlationId: correlation.id,
        phoneNumber: validatedData.phoneNumber,
      },
    });

    logger.info('Correlation triggered', {
      teamId: context.teamId,
      correlationId: correlation.id,
      phoneNumber: validatedData.phoneNumber,
    });

    const response = successResponse(correlation, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error triggering correlation', { error });
    return handleApiError(error);
  }
});
