/**
 * WhatsApp Contacts API - Collection Endpoints
 * GET /api/v1/whatsapp/contacts - List contacts with search and filters
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getContactManager } from '@/lib/whatsapp-contact-manager';
import { successResponse, handleApiError, createPaginationMeta } from '@/lib/api/response-helpers';
import { validateQuery, contactFiltersSchema } from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.contacts');

/**
 * GET /api/v1/whatsapp/contacts
 * List contacts with search (name, phone) and tag filters
 */
export const GET = withWhatsAppAuth(['contact:read'], async (req: NextRequest) => {
  try {
    const context = await createTenantContext(req);
    const { searchParams } = new URL(req.url);

    // Apply rate limiting
    const rateLimit = await applyRateLimit(context.teamId, 'contacts:list', 'read');
    if (!rateLimit.allowed) {
      return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
    }

    // Validate and parse filters
    const filters = validateQuery(contactFiltersSchema, searchParams);

    // Get contacts
    const contactManager = getContactManager();
    const result = await contactManager.getContacts(context, {
      search: filters.search,
      tags: filters.tags,
      limit: filters.limit,
      offset: filters.offset,
    });

    logger.info('Contacts listed', {
      teamId: context.teamId,
      count: result.contacts.length,
      total: result.total,
      filters,
    });

    const response = successResponse(result.contacts, {
      pagination: createPaginationMeta(result.total, filters.limit, filters.offset),
    });

    // Add rate limit headers
    Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Error listing contacts', { error });
    return handleApiError(error);
  }
});
