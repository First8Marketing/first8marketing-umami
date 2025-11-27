/**
 * WhatsApp Analytics Metrics API
 * POST /api/v1/whatsapp/analytics/metrics - Calculate analytics metrics
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { createAnalyticsSuite } from '@/lib/analytics';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateBody, metricsRequestSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.analytics.metrics');

/**
 * POST /api/v1/whatsapp/analytics/metrics
 * Calculate metrics: message_volume, response_time, resolution_rate, etc.
 */
export const POST = withWhatsAppAuth(['analytics:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:metrics', 'analytics');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(metricsRequestSchema, body);

    // Calculate metrics
    const analyticsSuite = createAnalyticsSuite(context);
    const results = await analyticsSuite.calculateMetrics({
      metrics: validatedData.metrics,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      groupBy: validatedData.groupBy,
    });

    logger.info('Metrics calculated', {
      teamId: context.teamId,
      metrics: validatedData.metrics,
      dateRange: {
        start: validatedData.startDate,
        end: validatedData.endDate,
      },
    });

    const response = successResponse(results);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error calculating metrics', { error });
    return handleApiError(error);
  }
});
