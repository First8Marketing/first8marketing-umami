/**
 * WhatsApp Correlations Verification API
 * POST   /api/v1/whatsapp/correlations/[correlationId]/verify - Approve correlation
 * DELETE /api/v1/whatsapp/correlations/[correlationId]/verify - Reject correlation
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getCorrelationEngine } from '@/lib/whatsapp-correlation-engine';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import {
  validateParams,
  validateBody,
  correlationIdSchema,
  verifyCorrelationSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.correlations.verify');

/**
 * POST /api/v1/whatsapp/correlations/[correlationId]/verify
 * Approve a correlation verification request
 */
export const POST = withWhatsAppAuth(
  ['correlation:verify'],
  async (req: NextRequest, { params }: { params: { correlationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'correlations:verify', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params and body
      const { correlationId } = validateParams(correlationIdSchema, params);
      const body = await req.json();
      const validatedData = validateBody(verifyCorrelationSchema, body);

      // Verify correlation (approve or reject based on body)
      const correlationEngine = getCorrelationEngine();
      const correlation = validatedData.approved
        ? await correlationEngine.approveCorrelation(context, correlationId, validatedData.notes)
        : await correlationEngine.rejectCorrelation(context, correlationId, validatedData.notes);

      // Broadcast verification event
      await broadcastEvent({
        type: validatedData.approved ? 'correlation:approved' : 'correlation:rejected',
        teamId: context.teamId,
        data: {
          correlationId,
          verifiedBy: context.userId,
        },
      });

      logger.info(`Correlation ${validatedData.approved ? 'approved' : 'rejected'}`, {
        teamId: context.teamId,
        correlationId,
        verifiedBy: context.userId,
      });

      const response = successResponse(correlation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error verifying correlation', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/correlations/[correlationId]/verify
 * Reject a correlation verification request
 */
export const DELETE = withWhatsAppAuth(
  ['correlation:verify'],
  async (req: NextRequest, { params }: { params: { correlationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'correlations:verify', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { correlationId } = validateParams(correlationIdSchema, params);

      // Reject correlation
      const correlationEngine = getCorrelationEngine();
      const correlation = await correlationEngine.rejectCorrelation(
        context,
        correlationId,
        'Rejected via API',
      );

      // Broadcast rejection event
      await broadcastEvent({
        type: 'correlation:rejected',
        teamId: context.teamId,
        data: {
          correlationId,
          rejectedBy: context.userId,
        },
      });

      logger.info('Correlation rejected', {
        teamId: context.teamId,
        correlationId,
        rejectedBy: context.userId,
      });

      const response = successResponse(correlation);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error rejecting correlation', { error });
      return handleApiError(error);
    }
  },
);
