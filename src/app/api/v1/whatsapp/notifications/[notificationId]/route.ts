/**
 * WhatsApp Notifications API - Individual Notification
 * GET    /api/v1/whatsapp/notifications/[notificationId] - Get notification details
 * PUT    /api/v1/whatsapp/notifications/[notificationId] - Mark notification as read
 * DELETE /api/v1/whatsapp/notifications/[notificationId] - Delete notification
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getNotificationSystem } from '@/lib/notification-system';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { validateParams, notificationIdSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.notifications');

/**
 * GET /api/v1/whatsapp/notifications/[notificationId]
 * Get detailed information about a notification
 */
export const GET = withWhatsAppAuth(
  ['notification:read'],
  async (req: NextRequest, { params }: { params: { notificationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'notifications:read', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { notificationId } = validateParams(notificationIdSchema, params);

      // Get notification
      const notificationSystem = getNotificationSystem();
      const notification = await notificationSystem.getNotification(context, notificationId);

      if (!notification) {
        return handleApiError({ name: 'NotFoundError', message: 'Notification not found' }, 404);
      }

      logger.debug('Notification retrieved', {
        teamId: context.teamId,
        notificationId,
      });

      const response = successResponse(notification);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving notification', { error });
      return handleApiError(error);
    }
  },
);

/**
 * PUT /api/v1/whatsapp/notifications/[notificationId]
 * Mark notification as read
 */
export const PUT = withWhatsAppAuth(
  ['notification:write'],
  async (req: NextRequest, { params }: { params: { notificationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'notifications:update', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { notificationId } = validateParams(notificationIdSchema, params);

      // Mark as read
      const notificationSystem = getNotificationSystem();
      const notification = await notificationSystem.markAsRead(context, notificationId);

      logger.info('Notification marked as read', {
        teamId: context.teamId,
        notificationId,
      });

      const response = successResponse(notification);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error marking notification as read', { error });
      return handleApiError(error);
    }
  },
);

/**
 * DELETE /api/v1/whatsapp/notifications/[notificationId]
 * Delete a notification
 */
export const DELETE = withWhatsAppAuth(
  ['notification:write'],
  async (req: NextRequest, { params }: { params: { notificationId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'notifications:delete', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { notificationId } = validateParams(notificationIdSchema, params);

      // Delete notification
      const notificationSystem = getNotificationSystem();
      await notificationSystem.deleteNotification(context, notificationId);

      logger.info('Notification deleted', {
        teamId: context.teamId,
        notificationId,
      });

      const response = successResponse({ success: true, notificationId });

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error deleting notification', { error });
      return handleApiError(error);
    }
  },
);
