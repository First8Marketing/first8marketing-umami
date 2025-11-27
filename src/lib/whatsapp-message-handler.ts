/**
 * WhatsApp Analytics Integration - Message Handler
 *
 * Processes incoming and outgoing WhatsApp messages.
 * Handles message storage, media processing, and conversation threading.
 */

import { v4 as uuidv4 } from 'uuid';
import { Message, MessageMedia } from 'whatsapp-web.js';
import { executeWithContext } from '@/lib/whatsapp-db';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';
import type {
  WhatsAppMessage,
  MessageDirection,
  MessageType,
  TenantContext,
} from '@/types/whatsapp';

const logger = getLogger();

/**
 * Parsed message data interface
 */
export interface ParsedMessage {
  waMessageId: string;
  direction: MessageDirection;
  fromPhone: string;
  toPhone: string;
  chatId: string;
  messageType: MessageType;
  messageBody?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  caption?: string;
  quotedMsgId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Message Handler for processing WhatsApp messages
 */
export class MessageHandler {
  /**
   * Parse WhatsApp message object
   */
  static parseMessage(message: Message): ParsedMessage {
    try {
      const { id, from, to, body, type, timestamp, hasMedia, hasQuotedMsg, _data } = message;

      // Determine message direction
      const direction: MessageDirection = message.fromMe ? 'outbound' : 'inbound';

      // Parse message type
      const messageType = this.mapMessageType(type);

      // Extract phone numbers
      const fromPhone = this.extractPhoneNumber(from);
      const toPhone = this.extractPhoneNumber(to);
      const chatId = message.from;

      // Get quoted message ID if exists
      let quotedMsgId: string | undefined;
      if (hasQuotedMsg) {
        quotedMsgId = _data.quotedMsg?.id?._serialized;
      }

      // Create parsed message
      const parsed: ParsedMessage = {
        waMessageId: id._serialized || id.id,
        direction,
        fromPhone,
        toPhone,
        chatId,
        messageType,
        messageBody: body,
        timestamp: new Date(timestamp * 1000),
        quotedMsgId,
        metadata: {
          hasMedia,
          deviceType: _data.deviceType,
          broadcast: _data.broadcast,
          isForwarded: _data.isForwarded,
          mentionedIds: _data.mentionedJidList || [],
        },
      };

      logger.debug('message-handler', 'Message parsed', {
        messageId: parsed.waMessageId,
        type: messageType,
        direction,
      });

      return parsed;
    } catch (error) {
      logger.error('message-handler', 'Failed to parse message', error as Error);
      throw new InternalError('Failed to parse message');
    }
  }

  /**
   * Map WhatsApp message type to our type enum
   */
  private static mapMessageType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      chat: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      ptt: 'audio', // Push-to-talk voice message
      document: 'document',
      sticker: 'sticker',
      location: 'location',
      vcard: 'contact',
      multi_vcard: 'contact',
      poll: 'poll',
      reaction: 'reaction',
    };

    return typeMap[type] || 'text';
  }

  /**
   * Extract phone number from WhatsApp ID
   */
  private static extractPhoneNumber(id: string): string {
    // Format: 1234567890@c.us or 1234567890@g.us
    return id.split('@')[0] || id;
  }

  /**
   * Process media message
   */
  static async processMedia(
    message: Message,
  ): Promise<{ url?: string; mimeType?: string; size?: number; caption?: string }> {
    try {
      if (!message.hasMedia) {
        return {};
      }

      logger.debug('message-handler', 'Processing media', {
        messageId: message.id._serialized,
      });

      // Download media
      const media: MessageMedia = await message.downloadMedia();

      if (!media) {
        logger.warn('message-handler', 'Failed to download media');
        return {};
      }

      // In production, upload to S3/CDN and return URL
      // For now, we'll store metadata only
      const mediaData = {
        mimeType: media.mimetype,
        size: media.data?.length || 0,
        caption: message.body || undefined,
        // mediaUrl would be the S3/CDN URL after upload
      };

      logger.debug('message-handler', 'Media processed', {
        mimeType: mediaData.mimeType,
        size: mediaData.size,
      });

      return mediaData;
    } catch (error) {
      logger.error('message-handler', 'Failed to process media', error as Error);
      return {};
    }
  }

  /**
   * Store message in database
   */
  static async storeMessage(
    context: TenantContext,
    sessionId: string,
    parsedMessage: ParsedMessage,
    mediaData?: { url?: string; mimeType?: string; size?: number; caption?: string },
    conversationId?: string,
  ): Promise<WhatsAppMessage> {
    try {
      const messageId = uuidv4();

      const query = `
        INSERT INTO whatsapp_message (
          message_id,
          team_id,
          session_id,
          conversation_id,
          wa_message_id,
          direction,
          from_phone,
          to_phone,
          chat_id,
          message_type,
          message_body,
          media_url,
          media_mime_type,
          media_size,
          caption,
          quoted_msg_id,
          timestamp,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `;

      const values = [
        messageId,
        context.teamId,
        sessionId,
        conversationId || null,
        parsedMessage.waMessageId,
        parsedMessage.direction,
        parsedMessage.fromPhone,
        parsedMessage.toPhone,
        parsedMessage.chatId,
        parsedMessage.messageType,
        parsedMessage.messageBody || null,
        mediaData?.url || null,
        mediaData?.mimeType || null,
        mediaData?.size || null,
        mediaData?.caption || null,
        parsedMessage.quotedMsgId || null,
        parsedMessage.timestamp,
        parsedMessage.metadata || null,
      ];

      const result = await executeWithContext<WhatsAppMessage>(context, query, values);
      const message = result.rows[0];

      logger.info('message-handler', 'Message stored', {
        messageId,
        direction: parsedMessage.direction,
        type: parsedMessage.messageType,
      });

      return message;
    } catch (error) {
      logger.error('message-handler', 'Failed to store message', error as Error);
      throw new InternalError('Failed to store message');
    }
  }

  /**
   * Process incoming WhatsApp message
   */
  static async processIncomingMessage(
    context: TenantContext,
    sessionId: string,
    message: Message,
    conversationId?: string,
  ): Promise<WhatsAppMessage> {
    try {
      logger.info('message-handler', 'Processing incoming message', {
        sessionId,
        from: message.from,
      });

      // Parse message
      const parsed = this.parseMessage(message);

      // Process media if present
      let mediaData;
      if (message.hasMedia) {
        mediaData = await this.processMedia(message);
      }

      // Store message
      const stored = await this.storeMessage(context, sessionId, parsed, mediaData, conversationId);

      logger.info('message-handler', 'Incoming message processed', {
        messageId: stored.messageId,
      });

      return stored;
    } catch (error) {
      logger.error('message-handler', 'Failed to process incoming message', error as Error);
      throw error;
    }
  }

  /**
   * Process outgoing WhatsApp message
   */
  static async processOutgoingMessage(
    context: TenantContext,
    sessionId: string,
    message: Message,
    conversationId?: string,
  ): Promise<WhatsAppMessage> {
    try {
      logger.info('message-handler', 'Processing outgoing message', {
        sessionId,
        to: message.to,
      });

      // Parse message
      const parsed = this.parseMessage(message);

      // Process media if present
      let mediaData;
      if (message.hasMedia) {
        mediaData = await this.processMedia(message);
      }

      // Store message
      const stored = await this.storeMessage(context, sessionId, parsed, mediaData, conversationId);

      logger.info('message-handler', 'Outgoing message processed', {
        messageId: stored.messageId,
      });

      return stored;
    } catch (error) {
      logger.error('message-handler', 'Failed to process outgoing message', error as Error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  static async markMessageAsRead(context: TenantContext, messageId: string): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_message
        SET is_read = true, read_at = NOW()
        WHERE message_id = $1
      `;

      await executeWithContext(context, query, [messageId]);

      logger.debug('message-handler', 'Message marked as read', { messageId });
    } catch (error) {
      logger.error('message-handler', 'Failed to mark message as read', error as Error);
    }
  }

  /**
   * Get message by ID
   */
  static async getMessage(
    context: TenantContext,
    messageId: string,
  ): Promise<WhatsAppMessage | null> {
    try {
      const query = `
        SELECT * FROM whatsapp_message
        WHERE message_id = $1
      `;

      const result = await executeWithContext<WhatsAppMessage>(context, query, [messageId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('message-handler', 'Failed to get message', error as Error);
      return null;
    }
  }

  /**
   * Get messages for conversation
   */
  static async getConversationMessages(
    context: TenantContext,
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<WhatsAppMessage[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_message
        WHERE conversation_id = $1
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await executeWithContext<WhatsAppMessage>(context, query, [
        conversationId,
        limit,
        offset,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('message-handler', 'Failed to get conversation messages', error as Error);
      return [];
    }
  }

  /**
   * Get recent messages for a chat
   */
  static async getChatMessages(
    context: TenantContext,
    chatId: string,
    limit: number = 50,
  ): Promise<WhatsAppMessage[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_message
        WHERE chat_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `;

      const result = await executeWithContext<WhatsAppMessage>(context, query, [chatId, limit]);

      return result.rows;
    } catch (error) {
      logger.error('message-handler', 'Failed to get chat messages', error as Error);
      return [];
    }
  }

  /**
   * Get unread message count
   */
  static async getUnreadCount(context: TenantContext, chatId?: string): Promise<number> {
    try {
      let query = `
        SELECT COUNT(*) as count FROM whatsapp_message
        WHERE team_id = $1 AND is_read = false AND direction = 'inbound'
      `;

      const params: any[] = [context.teamId];

      if (chatId) {
        query += ` AND chat_id = $2`;
        params.push(chatId);
      }

      const result = await executeWithContext<{ count: string }>(context, query, params);
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error('message-handler', 'Failed to get unread count', error as Error);
      return 0;
    }
  }

  /**
   * Search messages
   */
  static async searchMessages(
    context: TenantContext,
    searchTerm: string,
    limit: number = 50,
  ): Promise<WhatsAppMessage[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_message
        WHERE team_id = $1 
        AND (
          message_body ILIKE $2
          OR from_phone LIKE $3
          OR to_phone LIKE $3
        )
        ORDER BY timestamp DESC
        LIMIT $4
      `;

      const searchPattern = `%${searchTerm}%`;
      const result = await executeWithContext<WhatsAppMessage>(context, query, [
        context.teamId,
        searchPattern,
        searchPattern,
        limit,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('message-handler', 'Failed to search messages', error as Error);
      return [];
    }
  }
}

/**
 * Extended message handler interface for API compatibility
 */
interface ExtendedMessageHandler {
  getMessages: (
    context: TenantContext,
    filters: {
      conversationId?: string;
      direction?: MessageDirection;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    },
  ) => Promise<{ messages: WhatsAppMessage[]; total: number }>;
  sendMessage: (
    context: TenantContext,
    data: {
      conversationId: string;
      content: string;
      mediaUrl?: string;
      mediaType?: string;
    },
  ) => Promise<WhatsAppMessage>;
}

/**
 * Get message handler instance (singleton)
 * Used by API routes that expect an instance with methods
 */
export function getMessageHandler(): ExtendedMessageHandler {
  return {
    getMessages: async (context, filters) => {
      const messages = filters.conversationId
        ? await MessageHandler.getConversationMessages(
            context,
            filters.conversationId,
            filters.limit,
            filters.offset,
          )
        : await MessageHandler.getChatMessages(
            context,
            filters.conversationId || '',
            filters.limit,
          );
      return { messages, total: messages.length };
    },
    sendMessage: async (context, data) => {
      // Note: In production, this would use WhatsApp Web.js to send
      // For now, create a placeholder stored message
      const parsed: ParsedMessage = {
        waMessageId: `outbound_${Date.now()}`,
        direction: 'outbound' as MessageDirection,
        fromPhone: '', // Would be filled by session
        toPhone: '', // Would be filled by conversation
        chatId: data.conversationId,
        messageType: data.mediaType ? (data.mediaType as MessageType) : 'text',
        messageBody: data.content,
        mediaUrl: data.mediaUrl,
        timestamp: new Date(),
      };
      return MessageHandler.storeMessage(context, '', parsed, undefined, data.conversationId);
    },
  };
}

// Export convenience functions
export const parseMessage = MessageHandler.parseMessage.bind(MessageHandler);
export const processIncomingMessage = MessageHandler.processIncomingMessage.bind(MessageHandler);
export const processOutgoingMessage = MessageHandler.processOutgoingMessage.bind(MessageHandler);
export const markMessageAsRead = MessageHandler.markMessageAsRead.bind(MessageHandler);
export const getMessage = MessageHandler.getMessage.bind(MessageHandler);
export const getConversationMessages = MessageHandler.getConversationMessages.bind(MessageHandler);

export default MessageHandler;
