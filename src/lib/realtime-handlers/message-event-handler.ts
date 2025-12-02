/**
 * WhatsApp Analytics Integration - Message Event Handler
 *
 * Handles real-time events related to WhatsApp messages:
 * - New incoming messages
 * - Message sent confirmations
 * - Message acknowledgments (delivered, read)
 * - Message status updates
 * - Message failures
 */

import { getEventBroadcaster } from '@/lib/websocket-broadcaster';
import { getNotificationSystem, NotificationType } from '@/lib/notification-system';
import { NotificationPriority } from '@/lib/websocket-broadcaster';
import { getLogger } from '@/lib/whatsapp-logger';
import type { TenantContext, WhatsAppMessage, MessageStatus } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Message Event Handler
 */
export class MessageEventHandler {
  private broadcaster = getEventBroadcaster();
  private notificationSystem = getNotificationSystem();

  /**
   * Handle new incoming message
   */
  async onMessageReceived(context: TenantContext, message: WhatsAppMessage): Promise<void> {
    try {
      logger.info('message-handler', 'New message received', {
        messageId: message.messageId,
        conversationId: message.conversationId,
        direction: message.direction,
      });

      // Broadcast message to team
      this.broadcaster.broadcastNewMessage(context.teamId, message);

      // Create notification for new incoming messages
      if (message.direction === 'incoming') {
        await this.createNewMessageNotification(context, message);
      }
    } catch (error) {
      logger.error('message-handler', 'Failed to handle message received', error as Error);
    }
  }

  /**
   * Handle message sent confirmation
   */
  async onMessageSent(
    context: TenantContext,
    messageId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      logger.debug('message-handler', 'Message sent', {
        messageId,
        conversationId,
      });

      // Broadcast sent confirmation
      this.broadcaster.broadcastMessageSent(context.teamId, messageId, conversationId);
    } catch (error) {
      logger.error('message-handler', 'Failed to handle message sent', error as Error);
    }
  }

  /**
   * Handle message delivered
   */
  async onMessageDelivered(
    context: TenantContext,
    messageId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      logger.debug('message-handler', 'Message delivered', {
        messageId,
        conversationId,
      });

      // Broadcast delivery confirmation
      this.broadcaster.broadcastMessageDelivered(context.teamId, messageId);
    } catch (error) {
      logger.error('message-handler', 'Failed to handle message delivered', error as Error);
    }
  }

  /**
   * Handle message read
   */
  async onMessageRead(
    context: TenantContext,
    messageId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      logger.debug('message-handler', 'Message read', {
        messageId,
        conversationId,
      });

      // Broadcast read confirmation
      this.broadcaster.broadcastMessageRead(context.teamId, messageId);
    } catch (error) {
      logger.error('message-handler', 'Failed to handle message read', error as Error);
    }
  }

  /**
   * Handle message failed
   */
  async onMessageFailed(
    context: TenantContext,
    messageId: string,
    conversationId: string,
    error: string,
  ): Promise<void> {
    try {
      logger.error('message-handler', 'Message failed', new Error(error), {
        messageId,
        conversationId,
      });

      // Broadcast failure
      this.broadcaster.broadcastMessageFailed(context.teamId, messageId, error);

      // Create error notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.ERROR,
        priority: NotificationPriority.HIGH,
        title: 'Message Failed',
        message: `Failed to send message: ${error}`,
        data: { messageId, conversationId, error },
      });
    } catch (err) {
      logger.error('message-handler', 'Failed to handle message failure', err as Error);
    }
  }

  /**
   * Handle message status change
   */
  async onStatusChanged(
    context: TenantContext,
    messageId: string,
    status: MessageStatus,
    previousStatus?: MessageStatus,
  ): Promise<void> {
    try {
      logger.debug('message-handler', 'Message status changed', {
        messageId,
        status,
        previousStatus,
      });

      // Broadcast status based on new state
      switch (status) {
        case 'sent':
          // Already handled by onMessageSent
          break;
        case 'delivered':
          await this.onMessageDelivered(context, messageId, '');
          break;
        case 'read':
          await this.onMessageRead(context, messageId, '');
          break;
        case 'failed':
          await this.onMessageFailed(context, messageId, '', 'Message sending failed');
          break;
      }
    } catch (error) {
      logger.error('message-handler', 'Failed to handle status change', error as Error);
    }
  }

  /**
   * Handle bulk message operations
   */
  async onBulkMessagesSent(
    context: TenantContext,
    count: number,
    campaignId?: string,
  ): Promise<void> {
    try {
      logger.info('message-handler', 'Bulk messages sent', {
        count,
        campaignId,
      });

      // Create notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.SUCCESS,
        priority: NotificationPriority.MEDIUM,
        title: 'Bulk Messages Sent',
        message: `Successfully sent ${count} messages${campaignId ? ` (Campaign: ${campaignId})` : ''}`,
        data: { count, campaignId },
      });
    } catch (error) {
      logger.error('message-handler', 'Failed to handle bulk messages', error as Error);
    }
  }

  /**
   * Create notification for new incoming message
   */
  private async createNewMessageNotification(
    context: TenantContext,
    message: WhatsAppMessage,
  ): Promise<void> {
    try {
      // Only notify for unread messages in active conversations
      const preview = this.getMessagePreview(message.messageBody);

      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        title: 'New Message',
        message: `${message.contactName || message.fromNumber}: ${preview}`,
        data: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          fromNumber: message.fromNumber,
        },
        actionUrl: `/whatsapp/conversations/${message.conversationId}`,
        actionLabel: 'View',
      });
    } catch (error) {
      logger.error('message-handler', 'Failed to create message notification', error as Error);
    }
  }

  /**
   * Get message preview text
   */
  private getMessagePreview(body: string | undefined, maxLength = 50): string {
    if (!body) return '[No message]';

    if (body.length <= maxLength) {
      return body;
    }

    return body.substring(0, maxLength) + '...';
  }
}

// Export singleton instance
export const messageEventHandler = new MessageEventHandler();
