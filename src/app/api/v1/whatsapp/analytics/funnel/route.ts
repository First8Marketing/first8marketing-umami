/**
 * WhatsApp Analytics Funnel API
 * POST /api/v1/whatsapp/analytics/funnel - Analyze conversion funnel
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { createAnalyticsSuite } from '@/lib/analytics';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateBody, funnelRequestSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.analytics.funnel');

/**
 * POST /api/v1/whatsapp/analytics/funnel
 * Analyze multi-stage conversion funnel with drop-off rates
 */
export const POST = withWhatsAppAuth(['analytics:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:funnel', 'analytics');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(funnelRequestSchema, body);

    // Analyze funnel
    const analyticsSuite = createAnalyticsSuite(context);
    const funnelAnalysis = await analyticsSuite.analyzeFunnel({
      stages: validatedData.stages,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
    });

    logger.info('Funnel analyzed', {
      teamId: context.teamId,
      stages: validatedData.stages,
      dateRange: {
        start: validatedData.startDate,
        end: validatedData.endDate,
      },
    });

    const response = successResponse(funnelAnalysis);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error analyzing funnel', { error });
    return handleApiError(error);
  }
});
