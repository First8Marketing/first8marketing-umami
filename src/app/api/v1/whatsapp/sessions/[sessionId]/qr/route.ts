/**
 * WhatsApp Session QR Code API
 * GET  /api/v1/whatsapp/sessions/:sessionId/qr - Get QR code
 * POST /api/v1/whatsapp/sessions/:sessionId/qr/refresh - Refresh QR code
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getSessionManager } from '@/lib/whatsapp-session-manager';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, sessionIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.sessions.qr');

/**
 * GET /api/v1/whatsapp/sessions/:sessionId/qr
 * Get QR code for WhatsApp session authentication
 */
export const GET = withWhatsAppAuth(
  ['session:read'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:qr', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Get QR code
      const sessionManager = getSessionManager();
      const qrCode = await sessionManager.getQRCode(context.teamId, sessionId);

      if (!qrCode) {
        return handleApiError(
          { name: 'NotFoundError', message: 'QR code not available for this session' },
          404,
        );
      }

      logger.info('QR code retrieved', {
        teamId: context.teamId,
        sessionId,
      });

      const response = successResponse({
        qrCode,
        expiresAt: qrCode.expiresAt,
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving QR code', { error });
      return handleApiError(error);
    }
  },
);

/**
 * POST /api/v1/whatsapp/sessions/:sessionId/qr/refresh
 * Refresh QR code for WhatsApp session
 */
export const POST = withWhatsAppAuth(
  ['session:manage'],
  async (req: NextRequest, { params }: { params: { sessionId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'sessions:qr:refresh', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { sessionId } = validateParams(sessionIdSchema, params);

      // Refresh QR code
      const sessionManager = getSessionManager();
      const qrCode = await sessionManager.refreshQRCode(context.teamId, sessionId);

      logger.info('QR code refreshed', {
        teamId: context.teamId,
        sessionId,
      });

      const response = successResponse({
        qrCode,
        expiresAt: qrCode.expiresAt,
        message: 'QR code refreshed successfully',
      });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error refreshing QR code', { error });
      return handleApiError(error);
    }
  },
);
