/**
 * WhatsApp Analytics Integration - Conversation Event Handler
 *
 * Handles real-time events related to WhatsApp conversations:
 * - Conversation updates
 * - Status changes
 * - Agent assignments
 * - Conversation metrics
 */

import { getEventBroadcaster } from '@/lib/websocket-broadcaster';
import { getNotificationSystem, NotificationType } from '@/lib/notification-system';
import { NotificationPriority } from '@/lib/websocket-broadcaster';
import { getLogger } from '@/lib/whatsapp-logger';
import type { TenantContext, WhatsAppConversation, ConversationStatus } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Conversation Event Handler
 */
export class ConversationEventHandler {
  private broadcaster = getEventBroadcaster();
  private notificationSystem = getNotificationSystem();

  /**
   * Handle conversation updated
   */
  async onConversationUpdated(
    context: TenantContext,
    conversation: WhatsAppConversation,
  ): Promise<void> {
    try {
      logger.debug('conversation-handler', 'Conversation updated', {
        conversationId: conversation.conversationId,
        status: conversation.status,
      });

      // Broadcast update to team
      this.broadcaster.broadcastConversationUpdated(context.teamId, conversation);
    } catch (error) {
      logger.error('conversation-handler', 'Failed to handle conversation update', error as Error);
    }
  }

  /**
   * Handle conversation status change
   */
  async onStatusChanged(
    context: TenantContext,
    conversationId: string,
    status: ConversationStatus,
    previousStatus: ConversationStatus,
  ): Promise<void> {
    try {
      logger.info('conversation-handler', 'Conversation status changed', {
        conversationId,
        status,
        previousStatus,
      });

      // Broadcast status change
      this.broadcaster.broadcastConversationStatus(
        context.teamId,
        conversationId,
        status,
        previousStatus,
      );

      // Create notification for important status changes
      if (this.shouldNotifyStatusChange(status, previousStatus)) {
        await this.createStatusNotification(context, conversationId, status, previousStatus);
      }
    } catch (error) {
      logger.error('conversation-handler', 'Failed to handle status change', error as Error);
    }
  }

  /**
   * Handle conversation assigned to agent
   */
  async onConversationAssigned(
    context: TenantContext,
    conversationId: string,
    agentId: string,
    agentName?: string,
    previousAgentId?: string,
  ): Promise<void> {
    try {
      logger.info('conversation-handler', 'Conversation assigned', {
        conversationId,
        agentId,
        previousAgentId,
      });

      // Broadcast assignment
      this.broadcaster.broadcastConversationAssigned(
        context.teamId,
        conversationId,
        agentId,
        agentName,
      );

      // Notify assigned agent
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        userId: agentId,
        type: NotificationType.INFO,
        priority: NotificationPriority.HIGH,
        title: 'Conversation Assigned',
        message: `A conversation has been assigned to you`,
        data: { conversationId, agentId, previousAgentId },
        actionUrl: `/whatsapp/conversations/${conversationId}`,
        actionLabel: 'View',
      });
    } catch (error) {
      logger.error('conversation-handler', 'Failed to handle assignment', error as Error);
    }
  }

  /**
   * Handle new conversation created
   */
  async onConversationCreated(
    context: TenantContext,
    conversation: WhatsAppConversation,
  ): Promise<void> {
    try {
      logger.info('conversation-handler', 'New conversation created', {
        conversationId: conversation.conversationId,
        contactPhone: conversation.contactPhone,
      });

      // Broadcast new conversation
      this.broadcaster.broadcastConversationUpdated(context.teamId, conversation);

      // Create notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        title: 'New Conversation',
        message: `New conversation started with ${conversation.contactName || conversation.contactPhone}`,
        data: {
          conversationId: conversation.conversationId,
          contactPhone: conversation.contactPhone,
        },
        actionUrl: `/whatsapp/conversations/${conversation.conversationId}`,
        actionLabel: 'View',
      });
    } catch (error) {
      logger.error(
        'conversation-handler',
        'Failed to handle conversation creation',
        error as Error,
      );
    }
  }

  /**
   * Handle conversation closed
   */
  async onConversationClosed(
    context: TenantContext,
    conversationId: string,
    reason?: string,
  ): Promise<void> {
    try {
      logger.info('conversation-handler', 'Conversation closed', {
        conversationId,
        reason,
      });

      // Broadcast status change
      this.broadcaster.broadcastConversationStatus(
        context.teamId,
        conversationId,
        'closed',
        'open',
      );
    } catch (error) {
      logger.error('conversation-handler', 'Failed to handle conversation close', error as Error);
    }
  }

  /**
   * Handle conversation reopened
   */
  async onConversationReopened(context: TenantContext, conversationId: string): Promise<void> {
    try {
      logger.info('conversation-handler', 'Conversation reopened', {
        conversationId,
      });

      // Broadcast status change
      this.broadcaster.broadcastConversationStatus(
        context.teamId,
        conversationId,
        'open',
        'closed',
      );

      // Create notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        title: 'Conversation Reopened',
        message: 'A closed conversation has been reopened',
        data: { conversationId },
        actionUrl: `/whatsapp/conversations/${conversationId}`,
        actionLabel: 'View',
      });
    } catch (error) {
      logger.error('conversation-handler', 'Failed to handle conversation reopen', error as Error);
    }
  }

  /**
   * Determine if status change should trigger notification
   */
  private shouldNotifyStatusChange(
    newStatus: ConversationStatus,
    oldStatus: ConversationStatus,
  ): boolean {
    // Notify on important transitions
    const importantTransitions: Array<[ConversationStatus, ConversationStatus]> = [
      ['pending', 'active'],
      ['active', 'closed'],
      ['closed', 'active'],
    ];

    return importantTransitions.some(([from, to]) => oldStatus === from && newStatus === to);
  }

  /**
   * Create status change notification
   */
  private async createStatusNotification(
    context: TenantContext,
    conversationId: string,
    newStatus: ConversationStatus,
    oldStatus: ConversationStatus,
  ): Promise<void> {
    const statusMessages: Record<ConversationStatus, string> = {
      pending: 'Conversation is pending',
      active: 'Conversation is now active',
      closed: 'Conversation has been closed',
      resolved: 'Conversation has been resolved',
    };

    await this.notificationSystem.create(context, {
      teamId: context.teamId,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      title: 'Conversation Status Changed',
      message: statusMessages[newStatus] || `Status changed to ${newStatus}`,
      data: {
        conversationId,
        newStatus,
        oldStatus,
      },
    });
  }
}

// Export singleton instance
export const conversationEventHandler = new ConversationEventHandler();
