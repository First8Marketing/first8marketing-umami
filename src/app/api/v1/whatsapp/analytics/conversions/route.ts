/**
 * WhatsApp Analytics Conversions API
 * GET  /api/v1/whatsapp/analytics/conversions - List conversion events
 * POST /api/v1/whatsapp/analytics/conversions - Track conversion event
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { createAnalyticsSuite } from '@/lib/analytics';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import {
  validateQuery,
  validateBody,
  conversionFiltersSchema,
  trackConversionSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.analytics.conversions');

/**
 * GET /api/v1/whatsapp/analytics/conversions
 * List conversion events with filters
 */
export const GET = withWhatsAppAuth(['analytics:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:conversions:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(conversionFiltersSchema, searchParams);

    // Get conversions
    const analyticsSuite = createAnalyticsSuite(context);
    const result = await analyticsSuite.getConversions({
      startDate: filters.startDate,
      endDate: filters.endDate,
      eventType: filters.eventType,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.info('Conversions listed', {
      teamId: context.teamId,
      count: result.conversions.length,
      total: result.total,
      filters,
    });

    const response = successResponse(result.conversions, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing conversions', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/analytics/conversions
 * Track a new conversion event
 */
export const POST = withWhatsAppAuth(['analytics:write'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:conversions:track', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(trackConversionSchema, body);

    // Track conversion
    const analyticsSuite = createAnalyticsSuite(context);
    const conversion = await analyticsSuite.trackConversion({
      conversationId: validatedData.conversationId,
      eventType: validatedData.eventType,
      eventData: validatedData.eventData,
      value: validatedData.value,
    });

    logger.info('Conversion tracked', {
      teamId: context.teamId,
      conversionId: conversion.id,
      eventType: validatedData.eventType,
      conversationId: validatedData.conversationId,
    });

    const response = successResponse(conversion, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error tracking conversion', { error });
    return handleApiError(error);
  }
});
