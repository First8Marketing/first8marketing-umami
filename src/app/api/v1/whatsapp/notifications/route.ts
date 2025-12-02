/**
 * WhatsApp Notifications API - Collection Endpoints
 * GET    /api/v1/whatsapp/notifications - List notifications
 * DELETE /api/v1/whatsapp/notifications - Clear all notifications
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getNotificationSystem } from '@/lib/notification-system';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import { validateQuery, notificationFiltersSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.notifications');

/**
 * GET /api/v1/whatsapp/notifications
 * List user's notifications with filters
 */
export const GET = withWhatsAppAuth(['notification:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'notifications:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(notificationFiltersSchema, searchParams);

    // Get notifications
    const notificationSystem = getNotificationSystem();
    const result = await notificationSystem.getNotifications(context, {
      type: filters.type,
      read: filters.read,
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.debug('Notifications listed', {
      teamId: context.teamId,
      userId: context.userId,
      count: result.notifications.length,
      total: result.total,
    });

    const response = successResponse(result.notifications, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing notifications', { error });
    return handleApiError(error);
  }
});

/**
 * DELETE /api/v1/whatsapp/notifications
 * Clear all notifications for the user
 */
export const DELETE = withWhatsAppAuth(['notification:write'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'notifications:clear', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Clear all notifications
    const notificationSystem = getNotificationSystem();
    await notificationSystem.clearAllNotifications(context);

    logger.info('All notifications cleared', {
      teamId: context.teamId,
      userId: context.userId,
    });

    const response = successResponse({ success: true, message: 'All notifications cleared' });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error clearing notifications', { error });
    return handleApiError(error);
  }
});
