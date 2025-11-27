/**
 * WhatsApp Notifications Preferences API
 * GET /api/v1/whatsapp/notifications/preferences - Get notification preferences
 * PUT /api/v1/whatsapp/notifications/preferences - Update notification preferences
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getNotificationSystem } from '@/lib/notification-system';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateBody, notificationPreferencesSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.notifications.preferences');

/**
 * GET /api/v1/whatsapp/notifications/preferences
 * Get user's notification preferences
 */
export const GET = withWhatsAppAuth(['notification:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(
      context.teamId,
      'notifications:preferences:read',
      'read',
    );
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Get preferences
    const notificationSystem = getNotificationSystem();
    const preferences = await notificationSystem.getPreferences(context);

    logger.debug('Notification preferences retrieved', {
      teamId: context.teamId,
      userId: context.userId,
    });

    const response = successResponse(preferences);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error retrieving notification preferences', { error });
    return handleApiError(error);
  }
});

/**
 * PUT /api/v1/whatsapp/notifications/preferences
 * Update user's notification preferences
 */
export const PUT = withWhatsAppAuth(['notification:write'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(
      context.teamId,
      'notifications:preferences:update',
      'write',
    );
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate request body
    const body = await req.json();
    const validatedData = validateBody(notificationPreferencesSchema, body);

    // Update preferences
    const notificationSystem = getNotificationSystem();
    const preferences = await notificationSystem.updatePreferences(context, validatedData);

    logger.info('Notification preferences updated', {
      teamId: context.teamId,
      userId: context.userId,
      updates: Object.keys(validatedData),
    });

    const response = successResponse(preferences);

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error updating notification preferences', { error });
    return handleApiError(error);
  }
});
