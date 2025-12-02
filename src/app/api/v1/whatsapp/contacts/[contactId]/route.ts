/**
 * WhatsApp Contacts API - Individual Contact
 * GET   /api/v1/whatsapp/contacts/[contactId] - Get contact details
 * PATCH /api/v1/whatsapp/contacts/[contactId] - Update contact
 */

import { NextRequest } from 'next/server';
import { withWhatsAppAuth } from '@/middleware/whatsapp-auth';
import { createTenantContext } from '@/middleware/tenant-context';
import { getContactManager } from '@/lib/whatsapp-contact-manager';
import { broadcastEvent } from '@/lib/websocket-broadcaster';
import { successResponse, handleApiError } from '@/lib/api/response-helpers';
import {
  validateParams,
  validateBody,
  contactIdSchema,
  updateContactSchema,
} from '@/lib/api/validation-schemas';
import { applyRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limiter';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger('api.contacts');

/**
 * GET /api/v1/whatsapp/contacts/[contactId]
 * Get detailed information about a contact
 */
export const GET = withWhatsAppAuth(
  ['contact:read'],
  async (req: NextRequest, { params }: { params: { contactId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'contacts:read', 'read');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params
      const { contactId } = validateParams(contactIdSchema, params);

      // Get contact
      const contactManager = getContactManager();
      const contact = await contactManager.getContact(context, contactId);

      if (!contact) {
        return handleApiError({ name: 'NotFoundError', message: 'Contact not found' }, 404);
      }

      logger.info('Contact retrieved', {
        teamId: context.teamId,
        contactId,
      });

      const response = successResponse(contact);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error retrieving contact', { error });
      return handleApiError(error);
    }
  },
);

/**
 * PATCH /api/v1/whatsapp/contacts/[contactId]
 * Update contact details (name, email, tags, custom fields)
 */
export const PATCH = withWhatsAppAuth(
  ['contact:update'],
  async (req: NextRequest, { params }: { params: { contactId: string } }) => {
    try {
      const context = await createTenantContext(req);

      // Apply rate limiting
      const rateLimit = await applyRateLimit(context.teamId, 'contacts:update', 'write');
      if (!rateLimit.allowed) {
        return handleApiError({ name: 'RateLimitError', message: 'Rate limit exceeded' }, 429);
      }

      // Validate params and body
      const { contactId } = validateParams(contactIdSchema, params);
      const body = await req.json();
      const validatedData = validateBody(updateContactSchema, body);

      // Update contact
      const contactManager = getContactManager();
      const contact = await contactManager.updateContact(context, contactId, validatedData);

      // Broadcast update event
      await broadcastEvent({
        type: 'contact:updated',
        teamId: context.teamId,
        data: {
          contactId,
          updates: validatedData,
        },
      });

      logger.info('Contact updated', {
        teamId: context.teamId,
        contactId,
        updates: Object.keys(validatedData),
      });

      const response = successResponse(contact);

      // Add rate limit headers
      Object.entries(getRateLimitHeaders(rateLimit)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      logger.error('Error updating contact', { error });
      return handleApiError(error);
    }
  },
);
