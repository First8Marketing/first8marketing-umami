/**
 * WhatsApp Analytics Integration - Contact Manager
 *
 * Manages WhatsApp contact synchronization and metadata.
 * Handles contact search, updates, and relationship tracking.
 */

import { Contact } from 'whatsapp-web.js';
import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Contact data interface
 */
export interface ContactData {
  phoneNumber: string;
  name?: string;
  pushname?: string;
  isMyContact?: boolean;
  isGroup?: boolean;
  isBusiness?: boolean;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Stored contact interface
 */
export interface StoredContact {
  contactId: string;
  teamId: string;
  phoneNumber: string;
  name?: string;
  pushname?: string;
  isMyContact: boolean;
  isGroup: boolean;
  isBusiness: boolean;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Contact Manager for syncing WhatsApp contacts
 */
export class ContactManager {
  /**
   * Parse WhatsApp contact object
   */
  static parseContact(contact: Contact): ContactData {
    try {
      const phoneNumber = contact.id._serialized?.split('@')[0] || contact.number;

      return {
        phoneNumber,
        name: contact.name,
        pushname: contact.pushname,
        isMyContact: contact.isMyContact,
        isGroup: contact.isGroup,
        isBusiness: contact.isBusiness,
        metadata: {
          shortName: contact.shortName,
          isWAContact: contact.isWAContact,
          isUser: contact.isUser,
          isEnterprise: contact.isEnterprise,
        },
      };
    } catch (error) {
      logger.error('contact-manager', 'Failed to parse contact', error as Error);
      throw new InternalError('Failed to parse contact');
    }
  }

  /**
   * Sync contact to database
   */
  static async syncContact(
    context: TenantContext,
    contactData: ContactData,
  ): Promise<StoredContact> {
    try {
      const query = `
        INSERT INTO whatsapp_contact (
          team_id,
          phone_number,
          name,
          pushname,
          is_my_contact,
          is_group,
          is_business,
          profile_pic_url,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (team_id, phone_number)
        DO UPDATE SET
          name = EXCLUDED.name,
          pushname = EXCLUDED.pushname,
          is_my_contact = EXCLUDED.is_my_contact,
          is_group = EXCLUDED.is_group,
          is_business = EXCLUDED.is_business,
          profile_pic_url = EXCLUDED.profile_pic_url,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        context.teamId,
        contactData.phoneNumber,
        contactData.name || null,
        contactData.pushname || null,
        contactData.isMyContact || false,
        contactData.isGroup || false,
        contactData.isBusiness || false,
        contactData.profilePicUrl || null,
        contactData.metadata || null,
      ];

      const result = await executeWithContext<StoredContact>(context, query, values);
      const contact = result.rows[0];

      logger.debug('contact-manager', 'Contact synced', {
        phoneNumber: contactData.phoneNumber,
      });

      // Invalidate cache
      await cache.delete(`contact:${context.teamId}:${contactData.phoneNumber}`);

      return contact;
    } catch (error) {
      logger.error('contact-manager', 'Failed to sync contact', error as Error);
      throw new InternalError('Failed to sync contact');
    }
  }

  /**
   * Bulk sync contacts
   */
  static async syncContacts(context: TenantContext, contacts: ContactData[]): Promise<number> {
    try {
      logger.info('contact-manager', 'Syncing contacts', { count: contacts.length });

      let synced = 0;
      for (const contactData of contacts) {
        try {
          await this.syncContact(context, contactData);
          synced++;
        } catch (error) {
          logger.error('contact-manager', 'Failed to sync contact in batch', error as Error);
        }
      }

      logger.info('contact-manager', 'Contacts synced', { total: contacts.length, synced });

      return synced;
    } catch (error) {
      logger.error('contact-manager', 'Failed to bulk sync contacts', error as Error);
      return 0;
    }
  }

  /**
   * Get contact by phone number
   */
  static async getContact(
    context: TenantContext,
    phoneNumber: string,
  ): Promise<StoredContact | null> {
    try {
      // Check cache first
      const cacheKey = `contact:${context.teamId}:${phoneNumber}`;
      const cached = await cache.get<StoredContact>(cacheKey);

      if (cached) {
        return cached;
      }

      const query = `
        SELECT * FROM whatsapp_contact
        WHERE team_id = $1 AND phone_number = $2
      `;

      const result = await executeWithContext<StoredContact>(context, query, [
        context.teamId,
        phoneNumber,
      ]);

      const contact = result.rows[0] || null;

      // Cache for 1 hour
      if (contact) {
        await cache.set(cacheKey, contact, 3600);
      }

      return contact;
    } catch (error) {
      logger.error('contact-manager', 'Failed to get contact', error as Error);
      return null;
    }
  }

  /**
   * Search contacts
   */
  static async searchContacts(
    context: TenantContext,
    searchTerm: string,
    limit: number = 50,
  ): Promise<StoredContact[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_contact
        WHERE team_id = $1
        AND (
          name ILIKE $2
          OR pushname ILIKE $2
          OR phone_number LIKE $3
        )
        ORDER BY name, pushname, phone_number
        LIMIT $4
      `;

      const searchPattern = `%${searchTerm}%`;
      const result = await executeWithContext<StoredContact>(context, query, [
        context.teamId,
        searchPattern,
        searchPattern,
        limit,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('contact-manager', 'Failed to search contacts', error as Error);
      return [];
    }
  }

  /**
   * List all contacts
   */
  static async listContacts(
    context: TenantContext,
    filters?: {
      isMyContact?: boolean;
      isGroup?: boolean;
      isBusiness?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ contacts: StoredContact[]; total: number }> {
    try {
      const conditions: string[] = ['team_id = $1'];
      const values: any[] = [context.teamId];
      let paramIndex = 2;

      if (filters?.isMyContact !== undefined) {
        conditions.push(`is_my_contact = $${paramIndex++}`);
        values.push(filters.isMyContact);
      }

      if (filters?.isGroup !== undefined) {
        conditions.push(`is_group = $${paramIndex++}`);
        values.push(filters.isGroup);
      }

      if (filters?.isBusiness !== undefined) {
        conditions.push(`is_business = $${paramIndex++}`);
        values.push(filters.isBusiness);
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total FROM whatsapp_contact
        WHERE ${whereClause}
      `;
      const countResult = await executeWithContext<{ total: string }>(context, countQuery, values);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // Get contacts
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const query = `
        SELECT * FROM whatsapp_contact
        WHERE ${whereClause}
        ORDER BY name, pushname, phone_number
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `;

      values.push(limit, offset);

      const result = await executeWithContext<StoredContact>(context, query, values);

      return {
        contacts: result.rows,
        total,
      };
    } catch (error) {
      logger.error('contact-manager', 'Failed to list contacts', error as Error);
      return { contacts: [], total: 0 };
    }
  }

  /**
   * Update contact metadata
   */
  static async updateContactMetadata(
    context: TenantContext,
    phoneNumber: string,
    metadata: Record<string, any>,
  ): Promise<StoredContact | null> {
    try {
      const query = `
        UPDATE whatsapp_contact
        SET metadata = $1, updated_at = NOW()
        WHERE team_id = $2 AND phone_number = $3
        RETURNING *
      `;

      const result = await executeWithContext<StoredContact>(context, query, [
        metadata,
        context.teamId,
        phoneNumber,
      ]);

      const contact = result.rows[0] || null;

      if (contact) {
        // Invalidate cache
        await cache.delete(`contact:${context.teamId}:${phoneNumber}`);
        logger.debug('contact-manager', 'Contact metadata updated', { phoneNumber });
      }

      return contact;
    } catch (error) {
      logger.error('contact-manager', 'Failed to update contact metadata', error as Error);
      throw new InternalError('Failed to update contact metadata');
    }
  }

  /**
   * Get contact statistics
   */
  static async getContactStats(context: TenantContext): Promise<Record<string, number>> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_my_contact THEN 1 END) as my_contacts,
          COUNT(CASE WHEN is_group THEN 1 END) as groups,
          COUNT(CASE WHEN is_business THEN 1 END) as businesses
        FROM whatsapp_contact
        WHERE team_id = $1
      `;

      const result = await executeWithContext<Record<string, string>>(context, query, [
        context.teamId,
      ]);

      const row = result.rows[0];
      return {
        total: parseInt(row?.total || '0', 10),
        myContacts: parseInt(row?.my_contacts || '0', 10),
        groups: parseInt(row?.groups || '0', 10),
        businesses: parseInt(row?.businesses || '0', 10),
      };
    } catch (error) {
      logger.error('contact-manager', 'Failed to get contact stats', error as Error);
      return {
        total: 0,
        myContacts: 0,
        groups: 0,
        businesses: 0,
      };
    }
  }

  /**
   * Delete contact
   */
  static async deleteContact(context: TenantContext, phoneNumber: string): Promise<void> {
    try {
      const query = `
        DELETE FROM whatsapp_contact
        WHERE team_id = $1 AND phone_number = $2
      `;

      await executeWithContext(context, query, [context.teamId, phoneNumber]);

      // Invalidate cache
      await cache.delete(`contact:${context.teamId}:${phoneNumber}`);

      logger.info('contact-manager', 'Contact deleted', { phoneNumber });
    } catch (error) {
      logger.error('contact-manager', 'Failed to delete contact', error as Error);
      throw new InternalError('Failed to delete contact');
    }
  }
}

/**
 * Get contact manager instance (singleton)
 * Used by API routes that expect an instance with methods
 */
export function getContactManager(): typeof ContactManager & {
  getContacts: typeof ContactManager.listContacts;
} {
  // Return the class with aliased method for API compatibility
  const manager = ContactManager as typeof ContactManager & {
    getContacts: typeof ContactManager.listContacts;
  };
  manager.getContacts = ContactManager.listContacts;
  return manager;
}

// Export convenience functions
export const parseContact = ContactManager.parseContact.bind(ContactManager);
export const syncContact = ContactManager.syncContact.bind(ContactManager);
export const syncContacts = ContactManager.syncContacts.bind(ContactManager);
export const getContact = ContactManager.getContact.bind(ContactManager);
export const searchContacts = ContactManager.searchContacts.bind(ContactManager);
export const listContacts = ContactManager.listContacts.bind(ContactManager);
export const getContactStats = ContactManager.getContactStats.bind(ContactManager);

export default ContactManager;
