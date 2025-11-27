/**
 * WhatsApp Correlations Pending API
 * GET /api/v1/whatsapp/correlations/pending - List pending verification requests
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getCorrelationEngine } from '@/lib/whatsapp-correlation-engine';
import {
  successResponse,
  handleApiError,
  parsePagination,
  createPaginationMeta,
} from '@/lib/api/response-helpers';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.correlations.pending');

/**
 * GET /api/v1/whatsapp/correlations/pending
 * List all pending correlation verification requests
 */
export const GET = withWhatsAppAuth(['correlation:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'correlations:pending', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Parse pagination
    const { limit, offset } = parsePagination(searchParams);

    // Get pending correlations
    const correlationEngine = getCorrelationEngine();
    const result = await correlationEngine.getPendingCorrelations(context, {
      limit,
      offset,
    });

    logger.info('Pending correlations listed', {
      teamId: context.teamId,
      count: result.correlations.length,
      total: result.total,
    });

    const response = successResponse(result.correlations, {
      pagination: createPaginationMeta(result.total, limit, offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing pending correlations', { error });
    return handleApiError(error);
  }
});
