/**
 * WhatsApp Analytics Integration - Session Event Handler
 *
 * Handles real-time events related to WhatsApp sessions:
 * - QR code generation and broadcasting
 * - Session status changes
 * - Authentication success/failure
 * - Disconnection events
 */

import { getEventBroadcaster } from '@/lib/websocket-broadcaster';
import { getNotificationSystem, NotificationType } from '@/lib/notification-system';
import { NotificationPriority } from '@/lib/websocket-broadcaster';
import { getLogger } from '@/lib/whatsapp-logger';
import type { TenantContext, WhatsAppSession, WhatsAppSessionStatus } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Session Event Handler
 */
export class SessionEventHandler {
  private broadcaster = getEventBroadcaster();
  private notificationSystem = getNotificationSystem();

  /**
   * Handle QR code generated event
   */
  async onQRCodeGenerated(
    context: TenantContext,
    sessionId: string,
    qrCode: string,
    sessionName?: string,
  ): Promise<void> {
    try {
      logger.info('session-handler', 'QR code generated', {
        sessionId,
        sessionName,
      });

      // Broadcast QR code to team
      this.broadcaster.broadcastQRCode(context.teamId, sessionId, qrCode);

      // Create notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.INFO,
        priority: NotificationPriority.HIGH,
        title: 'WhatsApp QR Code Ready',
        message: `Scan the QR code to authenticate ${sessionName || sessionId}`,
        data: { sessionId, sessionName },
        expiresIn: 300, // 5 minutes
      });
    } catch (error) {
      logger.error('session-handler', 'Failed to handle QR code generated', error as Error);
    }
  }

  /**
   * Handle session status change
   */
  async onStatusChanged(
    context: TenantContext,
    session: WhatsAppSession,
    previousStatus?: WhatsAppSessionStatus,
  ): Promise<void> {
    try {
      logger.info('session-handler', 'Session status changed', {
        sessionId: session.sessionId,
        status: session.status,
        previousStatus,
      });

      // Broadcast status change
      this.broadcaster.broadcastSessionStatus(context.teamId, session);

      // Create notification based on status
      await this.createStatusNotification(context, session, previousStatus);
    } catch (error) {
      logger.error('session-handler', 'Failed to handle status change', error as Error);
    }
  }

  /**
   * Handle session authenticated
   */
  async onAuthenticated(
    context: TenantContext,
    sessionId: string,
    sessionName: string,
    phoneNumber?: string,
  ): Promise<void> {
    try {
      logger.info('session-handler', 'Session authenticated', {
        sessionId,
        sessionName,
        phoneNumber,
      });

      // Broadcast authentication success
      this.broadcaster.broadcastSessionAuthenticated(context.teamId, sessionId, phoneNumber);

      // Create success notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.SUCCESS,
        priority: NotificationPriority.HIGH,
        title: 'WhatsApp Connected',
        message: `${sessionName} has been successfully authenticated${phoneNumber ? ` (${phoneNumber})` : ''}`,
        data: { sessionId, sessionName, phoneNumber },
      });
    } catch (error) {
      logger.error('session-handler', 'Failed to handle authentication', error as Error);
    }
  }

  /**
   * Handle authentication failure
   */
  async onAuthenticationFailed(
    context: TenantContext,
    sessionId: string,
    sessionName: string,
    reason: string,
  ): Promise<void> {
    try {
      logger.error('session-handler', 'Session authentication failed', new Error(reason), {
        sessionId,
        sessionName,
      });

      // Create error notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.ERROR,
        priority: NotificationPriority.CRITICAL,
        title: 'WhatsApp Authentication Failed',
        message: `Failed to authenticate ${sessionName}: ${reason}`,
        data: { sessionId, sessionName, reason },
      });
    } catch (error) {
      logger.error('session-handler', 'Failed to handle auth failure', error as Error);
    }
  }

  /**
   * Handle session disconnected
   */
  async onDisconnected(
    context: TenantContext,
    sessionId: string,
    sessionName: string,
    reason?: string,
  ): Promise<void> {
    try {
      logger.warn('session-handler', 'Session disconnected', {
        sessionId,
        sessionName,
        reason,
      });

      // Broadcast disconnection
      this.broadcaster.broadcastSessionDisconnected(context.teamId, sessionId, reason);

      // Create warning notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: NotificationType.WARNING,
        priority: NotificationPriority.HIGH,
        title: 'WhatsApp Disconnected',
        message: `${sessionName} has been disconnected${reason ? `: ${reason}` : ''}`,
        data: { sessionId, sessionName, reason },
      });
    } catch (error) {
      logger.error('session-handler', 'Failed to handle disconnection', error as Error);
    }
  }

  /**
   * Create status-specific notification
   */
  private async createStatusNotification(
    context: TenantContext,
    session: WhatsAppSession,
    previousStatus?: WhatsAppSessionStatus,
  ): Promise<void> {
    const statusMessages: Record<
      WhatsAppSessionStatus,
      { type: NotificationType; priority: NotificationPriority; title: string; message: string }
    > = {
      authenticating: {
        type: NotificationType.INFO,
        priority: NotificationPriority.MEDIUM,
        title: 'WhatsApp Authenticating',
        message: `${session.sessionName} is authenticating...`,
      },
      qr_ready: {
        type: NotificationType.INFO,
        priority: NotificationPriority.HIGH,
        title: 'WhatsApp QR Code Ready',
        message: `Scan QR code to authenticate ${session.sessionName}`,
      },
      active: {
        type: NotificationType.SUCCESS,
        priority: NotificationPriority.MEDIUM,
        title: 'WhatsApp Active',
        message: `${session.sessionName} is now active and ready`,
      },
      disconnected: {
        type: NotificationType.WARNING,
        priority: NotificationPriority.HIGH,
        title: 'WhatsApp Disconnected',
        message: `${session.sessionName} has been disconnected`,
      },
      failed: {
        type: NotificationType.ERROR,
        priority: NotificationPriority.CRITICAL,
        title: 'WhatsApp Failed',
        message: `${session.sessionName} connection failed`,
      },
    };

    const notificationData = statusMessages[session.status];
    if (notificationData) {
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type: notificationData.type,
        priority: notificationData.priority,
        title: notificationData.title,
        message: notificationData.message,
        data: {
          sessionId: session.sessionId,
          sessionName: session.sessionName,
          status: session.status,
          previousStatus,
        },
      });
    }
  }
}

// Export singleton instance
export const sessionEventHandler = new SessionEventHandler();
