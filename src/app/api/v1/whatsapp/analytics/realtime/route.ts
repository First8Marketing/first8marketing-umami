/**
 * WhatsApp Analytics Realtime API
 * GET /api/v1/whatsapp/analytics/realtime - Get live metrics
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { createAnalyticsSuite } from '@/lib/analytics';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.analytics.realtime');

/**
 * GET /api/v1/whatsapp/analytics/realtime
 * Get real-time metrics: active conversations, message rate, online agents
 */
export const GET = withWhatsAppAuth(['analytics:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting (stricter for real-time)
    const rateLimit = await applyRateLimit(context.teamId, 'analytics:realtime', 'analytics');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Get real-time metrics
    const analyticsSuite = createAnalyticsSuite(context);
    const realtimeMetrics = await analyticsSuite.getRealtimeMetrics();

    logger.debug('Real-time metrics retrieved', {
      teamId: context.teamId,
    });

    const response = successResponse(realtimeMetrics);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add cache control headers (short TTL for real-time data)
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    logger.error('Error retrieving real-time metrics', { error });
    return handleApiError(error);
  }
});
