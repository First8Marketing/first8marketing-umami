/**
 * WhatsApp Contacts Sync API
 * POST /api/v1/whatsapp/contacts/sync - Trigger contact synchronization from WhatsApp
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getContactManager } from '@/lib/whatsapp-contact-manager';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.contacts.sync');

/**
 * POST /api/v1/whatsapp/contacts/sync
 * Trigger synchronization of WhatsApp contacts
 * This is a background job that syncs contacts from WhatsApp to the database
 */
export const POST = withWhatsAppAuth(['contact:sync'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);

    // Apply rate limiting (stricter for sync operations)
    const rateLimit = await applyRateLimit(context.teamId, 'contacts:sync', 'write');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Trigger sync
    const contactManager = getContactManager();
    const syncResult = await contactManager.syncContacts(context);

    // Broadcast sync event
    await broadcastEvent({
      type: 'contacts:sync:started',
      teamId: context.teamId,
      data: {
        syncId: syncResult.syncId,
        initiatedBy: context.userId,
      },
    });

    logger.info('Contact sync triggered', {
      teamId: context.teamId,
      syncId: syncResult.syncId,
      initiatedBy: context.userId,
    });

    const response = successResponse(
      {
        syncId: syncResult.syncId,
        status: 'started',
        message: 'Contact synchronization started',
      },
      undefined,
      202,
    );

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error triggering contact sync', { error });
    return handleApiError(error);
  }
});
