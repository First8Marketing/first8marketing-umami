/**
 * WhatsApp Reports API - Individual Report
 * GET    /api/v1/whatsapp/reports/[reportId] - Get report data
 * DELETE /api/v1/whatsapp/reports/[reportId] - Delete report
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getReportGenerator } from '@/lib/analytics/report-generator';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, reportIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.reports');

/**
 * GET /api/v1/whatsapp/reports/[reportId]
 * Get report data and metadata
 */
export const GET = withWhatsAppAuth(
  ['report:read'],
  async (req: NextRequest, { params }: { params: { reportId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'reports:read', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { reportId } = validateParams(reportIdSchema, params);

      // Get report
      const reportGenerator = getReportGenerator();
      const report = await reportGenerator.getReport(context, reportId);

      if (!report) {
        return handleApiError({ name: 'NotFoundError', message: 'Report not found' }, 404);
      }

      logger.info('Report retrieved', {
        teamId: context.teamId,
        reportId,
      });

      const response = successResponse(report);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving report', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/reports/[reportId]
 * Delete a generated report
 */
export const DELETE = withWhatsAppAuth(
  ['report:delete'],
  async (req: NextRequest, { params }: { params: { reportId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'reports:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { reportId } = validateParams(reportIdSchema, params);

      // Delete report
      const reportGenerator = getReportGenerator();
      await reportGenerator.deleteReport(context, reportId);

      logger.info('Report deleted', {
        teamId: context.teamId,
        reportId,
      });

      const response = successResponse({ success: true, reportId });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error deleting report', { error });
      return handleApiError(error);
    }
  },
);
