/**
 * WhatsApp Reports Export API
 * GET /api/v1/whatsapp/reports/[reportId]/export - Download report as CSV/JSON
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getReportGenerator } from '@/lib/analytics/report-generator';
import { handleApiError } from '@/lib/api/response-helpers';
import {
  validateParams,
  validateQuery,
  reportIdSchema,
  exportFormatSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.reports.export');

/**
 * GET /api/v1/whatsapp/reports/[reportId]/export
 * Download report in CSV or JSON format
 */
export const GET = withWhatsAppAuth(
  ['report:export'],
  async (req: NextRequest, { params }: { params: { reportId: string } }) => {
    try {
      const context = await createTenantContext(req);
      const { searchParams } = new URL(req.url);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'reports:export', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params and query
      const { reportId } = validateParams(reportIdSchema, params);
      const { format } = validateQuery(exportFormatSchema, searchParams);

      // Export report
      const reportGenerator = getReportGenerator();
      const exportResult = await reportGenerator.exportReport(context, reportId, format);

      if (!exportResult) {
        return handleApiError({ name: 'NotFoundError', message: 'Report not found' }, 404);
      }

      logger.info('Report exported', {
        teamId: context.teamId,
        reportId,
        format,
      });

      // Create response with appropriate content type
      const contentType =
        format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';

      const filename = `report-${reportId}-${new Date().toISOString().split('T')[0]}.${format}`;

      const response = new Response(exportResult.data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          ...getRateLimitHeaders(rateLimit),
        },
      });

      return response;
    } catch (error) {
      logger.error('Error exporting report', { error });
      return handleApiError(error);
    }
  },
);
