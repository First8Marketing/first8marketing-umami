/**
 * WhatsApp Correlations API - Individual Correlation
 * GET    /api/v1/whatsapp/correlations/[correlationId] - Get correlation details
 * DELETE /api/v1/whatsapp/correlations/[correlationId] - Deactivate correlation
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getCorrelationEngine } from '@/lib/whatsapp-correlation-engine';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, correlationIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.correlations');

/**
 * GET /api/v1/whatsapp/correlations/[correlationId]
 * Get detailed information about a correlation
 */
export const GET = withWhatsAppAuth(
  ['correlation:read'],
  async (req: NextRequest, { params }: { params: { correlationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'correlations:read', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { correlationId } = validateParams(correlationIdSchema, params);

      // Get correlation
      const correlationEngine = getCorrelationEngine();
      const correlation = await correlationEngine.getCorrelation(context, correlationId);

      if (!correlation) {
        return handleApiError({ name: 'NotFoundError', message: 'Correlation not found' }, 404);
      }

      logger.info('Correlation retrieved', {
        teamId: context.teamId,
        correlationId,
      });

      const response = successResponse(correlation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving correlation', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/correlations/[correlationId]
 * Deactivate a correlation
 */
export const DELETE = withWhatsAppAuth(
  ['correlation:delete'],
  async (req: NextRequest, { params }: { params: { correlationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'correlations:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { correlationId } = validateParams(correlationIdSchema, params);

      // Deactivate correlation
      const correlationEngine = getCorrelationEngine();
      await correlationEngine.deactivateCorrelation(context, correlationId);

      // Broadcast deactivation event
      await broadcastEvent({
        type: 'correlation:deactivated',
        teamId: context.teamId,
        data: { correlationId },
      });

      logger.info('Correlation deactivated', {
        teamId: context.teamId,
        correlationId,
      });

      const response = successResponse({ success: true, correlationId });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error deactivating correlation', { error });
      return handleApiError(error);
    }
  },
);
