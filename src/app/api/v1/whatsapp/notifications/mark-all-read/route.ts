/**
 * WhatsApp Notifications Mark All Read API
 * POST /api/v1/whatsapp/notifications/mark-all-read - Mark all notifications as read
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getNotificationSystem } from '@/lib/notification-system';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.notifications.mark-all-read');

/**
 * POST /api/v1/whatsapp/notifications/mark-all-read
 * Mark all notifications as read for the user
 */
export const POST = withWhatsAppAuth(['notification:write'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'notifications:mark-all-read', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Mark all as read
    const notificationSystem = getNotificationSystem();
    const count = await notificationSystem.markAllAsRead(context);

    logger.info('All notifications marked as read', {
      teamId: context.teamId,
      userId: context.userId,
      count,
    });

    const response = successResponse({
      success: true,
      markedCount: count,
      message: `${count} notification(s) marked as read`,
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error marking all notifications as read', { error });
    return handleApiError(error);
  }
});
