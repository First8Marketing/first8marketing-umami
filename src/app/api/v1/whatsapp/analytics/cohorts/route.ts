/**
 * WhatsApp Analytics Cohorts API
 * POST /api/v1/whatsapp/analytics/cohorts - Analyze user cohorts
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { createAnalyticsSuite } from '@/lib/analytics';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateBody, cohortRequestSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.analytics.cohorts');

/**
 * POST /api/v1/whatsapp/analytics/cohorts
 * Analyze user cohorts by signup/engagement date with retention tracking
 */
export const POST = withWhatsAppAuth(['analytics:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:cohorts', 'analytics');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(cohortRequestSchema, body);

    // Analyze cohorts
    const analyticsSuite = createAnalyticsSuite(context);
    const cohortAnalysis = await analyticsSuite.analyzeCohorts({
      cohortType: validatedData.cohortType,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      groupBy: validatedData.groupBy,
    });

    logger.info('Cohorts analyzed', {
      teamId: context.teamId,
      cohortType: validatedData.cohortType,
      groupBy: validatedData.groupBy,
      dateRange: {
        start: validatedData.startDate,
        end: validatedData.endDate,
      },
    });

    const response = successResponse(cohortAnalysis);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error analyzing cohorts', { error });
    return handleApiError(error);
  }
});
