/**
 * WhatsApp Analytics Integration - Conversation Manager
 *
 * Manages WhatsApp conversation threads, grouping messages by contact.
 * Handles conversation status, assignment, and metrics tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';
import type {
  WhatsAppConversation,
  ConversationStatus,
  ConversationStage,
  TenantContext,
} from '@/types/whatsapp';

const logger = getLogger();

/**
 * Conversation creation data
 */
export interface CreateConversationData {
  sessionId: string;
  chatId: string;
  contactPhone: string;
  contactName?: string;
  firstMessageAt?: Date;
}

/**
 * Conversation update data
 */
export interface UpdateConversationData {
  status?: ConversationStatus;
  stage?: ConversationStage;
  contactName?: string;
  assignedTo?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Conversation Manager for tracking conversation threads
 */
export class ConversationManager {
  /**
   * Create or get existing conversation
   */
  static async getOrCreateConversation(
    context: TenantContext,
    data: CreateConversationData,
  ): Promise<WhatsAppConversation> {
    try {
      // Check if conversation exists
      const existing = await this.getConversationByChatId(context, data.chatId);

      if (existing) {
        return existing;
      }

      // Create new conversation
      return await this.createConversation(context, data);
    } catch (error) {
      logger.error('conversation-manager', 'Failed to get or create conversation', error as Error);
      throw error;
    }
  }

  /**
   * Create new conversation
   */
  static async createConversation(
    context: TenantContext,
    data: CreateConversationData,
  ): Promise<WhatsAppConversation> {
    try {
      const conversationId = uuidv4();
      const firstMessageAt = data.firstMessageAt || new Date();

      const query = `
        INSERT INTO whatsapp_conversation (
          conversation_id,
          team_id,
          session_id,
          chat_id,
          contact_phone,
          contact_name,
          status,
          first_message_at,
          last_message_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        RETURNING *
      `;

      const values = [
        conversationId,
        context.teamId,
        data.sessionId,
        data.chatId,
        data.contactPhone,
        data.contactName || null,
        'open',
        firstMessageAt,
      ];

      const result = await executeWithContext<WhatsAppConversation>(context, query, values);
      const conversation = result.rows[0];

      logger.info('conversation-manager', 'Conversation created', {
        conversationId,
        chatId: data.chatId,
      });

      return conversation;
    } catch (error) {
      logger.error('conversation-manager', 'Failed to create conversation', error as Error);
      throw new InternalError('Failed to create conversation');
    }
  }

  /**
   * Get conversation by ID
   */
  static async getConversation(
    context: TenantContext,
    conversationId: string,
  ): Promise<WhatsAppConversation | null> {
    try {
      const query = `
        SELECT * FROM whatsapp_conversation
        WHERE conversation_id = $1
      `;

      const result = await executeWithContext<WhatsAppConversation>(context, query, [
        conversationId,
      ]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('conversation-manager', 'Failed to get conversation', error as Error);
      return null;
    }
  }

  /**
   * Get conversation by chat ID
   */
  static async getConversationByChatId(
    context: TenantContext,
    chatId: string,
  ): Promise<WhatsAppConversation | null> {
    try {
      // Check cache first
      const cacheKey = `conversation:${context.teamId}:${chatId}`;
      const cached = await cache.get<WhatsAppConversation>(cacheKey);

      if (cached) {
        return cached;
      }

      const query = `
        SELECT * FROM whatsapp_conversation
        WHERE team_id = $1 AND chat_id = $2
        ORDER BY last_message_at DESC
        LIMIT 1
      `;

      const result = await executeWithContext<WhatsAppConversation>(context, query, [
        context.teamId,
        chatId,
      ]);

      const conversation = result.rows[0] || null;

      // Cache for 5 minutes
      if (conversation) {
        await cache.set(cacheKey, conversation, 300);
      }

      return conversation;
    } catch (error) {
      logger.error('conversation-manager', 'Failed to get conversation by chat ID', error as Error);
      return null;
    }
  }

  /**
   * Update conversation
   */
  static async updateConversation(
    context: TenantContext,
    conversationId: string,
    data: UpdateConversationData,
  ): Promise<WhatsAppConversation | null> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(data.status);
      }

      if (data.stage !== undefined) {
        updates.push(`stage = $${paramIndex++}`);
        values.push(data.stage);
      }

      if (data.contactName !== undefined) {
        updates.push(`contact_name = $${paramIndex++}`);
        values.push(data.contactName);
      }

      if (data.assignedTo !== undefined) {
        updates.push(`assigned_to = $${paramIndex++}`);
        values.push(data.assignedTo);
      }

      if (data.tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        values.push(data.tags);
      }

      if (data.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(data.metadata);
      }

      if (updates.length === 0) {
        return await this.getConversation(context, conversationId);
      }

      updates.push(`updated_at = NOW()`);
      values.push(conversationId);

      const query = `
        UPDATE whatsapp_conversation
        SET ${updates.join(', ')}
        WHERE conversation_id = $${paramIndex}
        RETURNING *
      `;

      const result = await executeWithContext<WhatsAppConversation>(context, query, values);

      logger.info('conversation-manager', 'Conversation updated', { conversationId });

      return result.rows[0] || null;
    } catch (error) {
      logger.error('conversation-manager', 'Failed to update conversation', error as Error);
      throw new InternalError('Failed to update conversation');
    }
  }

  /**
   * Update conversation metrics (message count, last message time)
   */
  static async updateConversationMetrics(
    context: TenantContext,
    conversationId: string,
    incrementUnread: boolean = false,
  ): Promise<void> {
    try {
      const unreadIncrement = incrementUnread ? 1 : 0;

      const query = `
        UPDATE whatsapp_conversation
        SET 
          message_count = message_count + 1,
          unread_count = unread_count + $1,
          last_message_at = NOW(),
          updated_at = NOW()
        WHERE conversation_id = $2
      `;

      await executeWithContext(context, query, [unreadIncrement, conversationId]);

      logger.debug('conversation-manager', 'Conversation metrics updated', {
        conversationId,
        incrementUnread,
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to update conversation metrics', error as Error);
    }
  }

  /**
   * Mark conversation as read
   */
  static async markAsRead(context: TenantContext, conversationId: string): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_conversation
        SET unread_count = 0, updated_at = NOW()
        WHERE conversation_id = $1
      `;

      await executeWithContext(context, query, [conversationId]);

      logger.debug('conversation-manager', 'Conversation marked as read', { conversationId });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to mark conversation as read', error as Error);
    }
  }

  /**
   * List conversations with filters
   */
  static async listConversations(
    context: TenantContext,
    filters?: {
      status?: ConversationStatus;
      assignedTo?: string;
      searchTerm?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ conversations: WhatsAppConversation[]; total: number }> {
    try {
      const conditions: string[] = ['team_id = $1'];
      const values: any[] = [context.teamId];
      let paramIndex = 2;

      if (filters?.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters?.assignedTo) {
        conditions.push(`assigned_to = $${paramIndex++}`);
        values.push(filters.assignedTo);
      }

      if (filters?.searchTerm) {
        conditions.push(`(contact_name ILIKE $${paramIndex} OR contact_phone LIKE $${paramIndex})`);
        values.push(`%${filters.searchTerm}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total FROM whatsapp_conversation
        WHERE ${whereClause}
      `;
      const countResult = await executeWithContext<{ total: string }>(context, countQuery, values);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // Get conversations
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const query = `
        SELECT * FROM whatsapp_conversation
        WHERE ${whereClause}
        ORDER BY last_message_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `;

      values.push(limit, offset);

      const result = await executeWithContext<WhatsAppConversation>(context, query, values);

      return {
        conversations: result.rows,
        total,
      };
    } catch (error) {
      logger.error('conversation-manager', 'Failed to list conversations', error as Error);
      return { conversations: [], total: 0 };
    }
  }

  /**
   * Get conversation statistics
   */
  static async getConversationStats(context: TenantContext): Promise<Record<string, number>> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
          COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed,
          COUNT(CASE WHEN unread_count > 0 THEN 1 END) as unread,
          SUM(unread_count) as total_unread_messages
        FROM whatsapp_conversation
        WHERE team_id = $1
      `;

      const result = await executeWithContext<Record<string, string>>(context, query, [
        context.teamId,
      ]);

      const row = result.rows[0];
      return {
        total: parseInt(row?.total || '0', 10),
        open: parseInt(row?.open || '0', 10),
        closed: parseInt(row?.closed || '0', 10),
        unread: parseInt(row?.unread || '0', 10),
        totalUnreadMessages: parseInt(row?.total_unread_messages || '0', 10),
      };
    } catch (error) {
      logger.error('conversation-manager', 'Failed to get conversation stats', error as Error);
      return {
        total: 0,
        open: 0,
        closed: 0,
        unread: 0,
        totalUnreadMessages: 0,
      };
    }
  }

  /**
   * Assign conversation to agent
   */
  static async assignConversation(
    context: TenantContext,
    conversationId: string,
    userId: string,
  ): Promise<WhatsAppConversation | null> {
    try {
      return await this.updateConversation(context, conversationId, {
        assignedTo: userId,
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to assign conversation', error as Error);
      throw error;
    }
  }

  /**
   * Add tags to conversation
   */
  static async addTags(
    context: TenantContext,
    conversationId: string,
    tags: string[],
  ): Promise<WhatsAppConversation | null> {
    try {
      const conversation = await this.getConversation(context, conversationId);
      if (!conversation) {
        return null;
      }

      const existingTags = conversation.tags || [];
      const newTags = Array.from(new Set([...existingTags, ...tags]));

      return await this.updateConversation(context, conversationId, {
        tags: newTags,
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to add tags', error as Error);
      throw error;
    }
  }

  /**
   * Remove tags from conversation
   */
  static async removeTags(
    context: TenantContext,
    conversationId: string,
    tags: string[],
  ): Promise<WhatsAppConversation | null> {
    try {
      const conversation = await this.getConversation(context, conversationId);
      if (!conversation) {
        return null;
      }

      const existingTags = conversation.tags || [];
      const newTags = existingTags.filter(tag => !tags.includes(tag));

      return await this.updateConversation(context, conversationId, {
        tags: newTags,
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to remove tags', error as Error);
      throw error;
    }
  }

  /**
   * Close conversation
   */
  static async closeConversation(
    context: TenantContext,
    conversationId: string,
  ): Promise<WhatsAppConversation | null> {
    try {
      return await this.updateConversation(context, conversationId, {
        status: 'closed',
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to close conversation', error as Error);
      throw error;
    }
  }

  /**
   * Reopen conversation
   */
  static async reopenConversation(
    context: TenantContext,
    conversationId: string,
  ): Promise<WhatsAppConversation | null> {
    try {
      return await this.updateConversation(context, conversationId, {
        status: 'open',
      });
    } catch (error) {
      logger.error('conversation-manager', 'Failed to reopen conversation', error as Error);
      throw error;
    }
  }
}

/**
 * Get conversation manager instance (singleton)
 * Used by API routes that expect an instance with methods
 */
export function getConversationManager(): typeof ConversationManager {
  return ConversationManager;
}

// Export convenience functions
export const getOrCreateConversation =
  ConversationManager.getOrCreateConversation.bind(ConversationManager);
export const createConversation = ConversationManager.createConversation.bind(ConversationManager);
export const getConversation = ConversationManager.getConversation.bind(ConversationManager);
export const updateConversation = ConversationManager.updateConversation.bind(ConversationManager);
export const listConversations = ConversationManager.listConversations.bind(ConversationManager);
export const getConversationStats =
  ConversationManager.getConversationStats.bind(ConversationManager);

export default ConversationManager;
