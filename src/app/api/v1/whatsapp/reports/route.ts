/**
 * WhatsApp Reports API - Collection Endpoints
 * POST /api/v1/whatsapp/reports - Generate new report
 * GET  /api/v1/whatsapp/reports - List generated reports
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getReportGenerator } from '@/lib/analytics/report-generator';
import {
  successResponse,
  handleApiError,
  parsePagination,
  createPaginationMeta,
} from '@/lib/api/response-helpers';
import { validateBody, generateReportSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.reports');

/**
 * GET /api/v1/whatsapp/reports
 * List generated reports
 */
export const GET = withWhatsAppAuth(['report:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'reports:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Parse pagination
    const { limit, offset } = parsePagination(searchParams);

    // Get reports
    const reportGenerator = getReportGenerator();
    const result = await reportGenerator.getReports(context, {
      limit,
      offset,
    });

    logger.info('Reports listed', {
      teamId: context.teamId,
      count: result.reports.length,
      total: result.total,
    });

    const response = successResponse(result.reports, {
      pagination: createPaginationMeta(result.total, limit, offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing reports', { error });
    return handleApiError(error);
  }
});

/**
 * POST /api/v1/whatsapp/reports
 * Generate a new report (conversation_summary, agent_performance, etc.)
 */
export const POST = withWhatsAppAuth(['report:create'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'reports:generate', 'analytics');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(generateReportSchema, body);

    // Generate report
    const reportGenerator = getReportGenerator();
    const report = await reportGenerator.generateReport(context, {
      reportType: validatedData.reportType,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      filters: validatedData.filters,
      format: validatedData.format,
    });

    logger.info('Report generated', {
      teamId: context.teamId,
      reportId: report.id,
      reportType: validatedData.reportType,
      format: validatedData.format,
    });

    const response = successResponse(report, undefined, 201);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error generating report', { error });
    return handleApiError(error);
  }
});
