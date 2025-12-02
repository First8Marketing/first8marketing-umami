/**
 * WhatsApp Analytics Integration - Event Broadcaster
 *
 * Central service for broadcasting real-time events to connected clients.
 * Handles team-based and user-specific event distribution.
 */

import { Server as SocketServer } from 'socket.io';
import { getWebSocketServer } from '@/lib/websocket-server';
import { getLogger } from '@/lib/whatsapp-logger';
import type {
  WhatsAppSession,
  WhatsAppMessage,
  WhatsAppConversation,
  WhatsAppContact,
  WhatsAppMetrics,
} from '@/types/whatsapp';

const logger = getLogger();

/**
 * Event types for WhatsApp real-time communication
 */
export enum WebSocketEventType {
  // Session events
  QR_CODE = 'whatsapp:qr',
  SESSION_STATUS = 'whatsapp:session:status',
  SESSION_AUTHENTICATED = 'whatsapp:session:authenticated',
  SESSION_DISCONNECTED = 'whatsapp:session:disconnected',

  // Message events
  MESSAGE_NEW = 'whatsapp:message:new',
  MESSAGE_SENT = 'whatsapp:message:sent',
  MESSAGE_DELIVERED = 'whatsapp:message:delivered',
  MESSAGE_READ = 'whatsapp:message:read',
  MESSAGE_FAILED = 'whatsapp:message:failed',

  // Conversation events
  CONVERSATION_UPDATED = 'whatsapp:conversation:updated',
  CONVERSATION_STATUS_CHANGED = 'whatsapp:conversation:status',
  CONVERSATION_ASSIGNED = 'whatsapp:conversation:assigned',

  // Contact events
  CONTACT_SYNCED = 'whatsapp:contact:synced',
  CONTACT_UPDATED = 'whatsapp:contact:updated',

  // Analytics events
  ANALYTICS_UPDATE = 'whatsapp:analytics:update',
  METRICS_UPDATE = 'whatsapp:metrics:update',

  // Notification events
  NOTIFICATION = 'whatsapp:notification',
  ALERT = 'whatsapp:alert',
}

/**
 * Notification priority levels
 */
export enum NotificationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Notification interface
 */
export interface WebSocketNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  userId?: string;
  teamId: string;
}

/**
 * Event Broadcaster Service
 */
export class EventBroadcaster {
  private io: SocketServer | null = null;

  constructor() {
    // Lazy initialization - will be set when first used
  }

  /**
   * Get Socket.IO instance
   */
  private getIO(): SocketServer {
    if (!this.io) {
      const server = getWebSocketServer();
      if (!server) {
        throw new Error('WebSocket server not initialized');
      }
      this.io = server.getIO();
    }
    return this.io;
  }

  /**
   * Broadcast to team room
   */
  private broadcastToTeam(teamId: string, event: string, data: any): void {
    try {
      const io = this.getIO();
      io.to(`team:${teamId}`).emit(event, {
        ...data,
        timestamp: new Date(),
      });

      logger.debug('broadcaster', 'Broadcasted to team', {
        event,
        teamId,
        dataSize: JSON.stringify(data).length,
      });
    } catch (error) {
      logger.error('broadcaster', 'Failed to broadcast to team', error as Error, {
        event,
        teamId,
      });
    }
  }

  /**
   * Broadcast to specific user
   */
  private broadcastToUser(userId: string, event: string, data: any): void {
    try {
      const io = this.getIO();
      io.to(`user:${userId}`).emit(event, {
        ...data,
        timestamp: new Date(),
      });

      logger.debug('broadcaster', 'Broadcasted to user', {
        event,
        userId,
        dataSize: JSON.stringify(data).length,
      });
    } catch (error) {
      logger.error('broadcaster', 'Failed to broadcast to user', error as Error, {
        event,
        userId,
      });
    }
  }

  /**
   * Broadcast QR code for authentication
   */
  broadcastQRCode(teamId: string, sessionId: string, qrCode: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.QR_CODE, {
      sessionId,
      qrCode,
    });
  }

  /**
   * Broadcast session status change
   */
  broadcastSessionStatus(teamId: string, session: Partial<WhatsAppSession>): void {
    this.broadcastToTeam(teamId, WebSocketEventType.SESSION_STATUS, {
      sessionId: session.sessionId,
      status: session.status,
      sessionName: session.sessionName,
    });
  }

  /**
   * Broadcast session authenticated
   */
  broadcastSessionAuthenticated(teamId: string, sessionId: string, phoneNumber?: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.SESSION_AUTHENTICATED, {
      sessionId,
      phoneNumber,
    });
  }

  /**
   * Broadcast session disconnected
   */
  broadcastSessionDisconnected(teamId: string, sessionId: string, reason?: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.SESSION_DISCONNECTED, {
      sessionId,
      reason,
    });
  }

  /**
   * Broadcast new message received
   */
  broadcastNewMessage(teamId: string, message: WhatsAppMessage): void {
    this.broadcastToTeam(teamId, WebSocketEventType.MESSAGE_NEW, {
      conversationId: message.conversationId,
      message: {
        messageId: message.messageId,
        sessionId: message.sessionId,
        chatId: message.chatId,
        messageType: message.messageType,
        messageBody: message.messageBody,
        direction: message.direction,
        timestamp: message.timestamp,
        status: message.status,
      },
    });
  }

  /**
   * Broadcast message sent confirmation
   */
  broadcastMessageSent(teamId: string, messageId: string, conversationId: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.MESSAGE_SENT, {
      messageId,
      conversationId,
    });
  }

  /**
   * Broadcast message delivered
   */
  broadcastMessageDelivered(teamId: string, messageId: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.MESSAGE_DELIVERED, {
      messageId,
    });
  }

  /**
   * Broadcast message read
   */
  broadcastMessageRead(teamId: string, messageId: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.MESSAGE_READ, {
      messageId,
    });
  }

  /**
   * Broadcast message failed
   */
  broadcastMessageFailed(teamId: string, messageId: string, error: string): void {
    this.broadcastToTeam(teamId, WebSocketEventType.MESSAGE_FAILED, {
      messageId,
      error,
    });
  }

  /**
   * Broadcast conversation update
   */
  broadcastConversationUpdated(teamId: string, conversation: Partial<WhatsAppConversation>): void {
    this.broadcastToTeam(teamId, WebSocketEventType.CONVERSATION_UPDATED, {
      conversationId: conversation.conversationId,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: conversation.unreadCount,
    });
  }

  /**
   * Broadcast conversation status change
   */
  broadcastConversationStatus(
    teamId: string,
    conversationId: string,
    status: string,
    previousStatus?: string,
  ): void {
    this.broadcastToTeam(teamId, WebSocketEventType.CONVERSATION_STATUS_CHANGED, {
      conversationId,
      status,
      previousStatus,
    });
  }

  /**
   * Broadcast conversation assigned to agent
   */
  broadcastConversationAssigned(
    teamId: string,
    conversationId: string,
    agentId: string,
    agentName?: string,
  ): void {
    this.broadcastToTeam(teamId, WebSocketEventType.CONVERSATION_ASSIGNED, {
      conversationId,
      agentId,
      agentName,
    });
  }

  /**
   * Broadcast contact synced
   */
  broadcastContactSynced(teamId: string, contact: WhatsAppContact): void {
    this.broadcastToTeam(teamId, WebSocketEventType.CONTACT_SYNCED, {
      phone: contact.phone,
      name: contact.name,
      isContact: contact.isContact,
    });
  }

  /**
   * Broadcast contact updated
   */
  broadcastContactUpdated(teamId: string, phone: string, updates: Partial<WhatsAppContact>): void {
    this.broadcastToTeam(teamId, WebSocketEventType.CONTACT_UPDATED, {
      phone,
      updates,
    });
  }

  /**
   * Broadcast real-time analytics update
   */
  broadcastAnalyticsUpdate(teamId: string, metrics: Partial<WhatsAppMetrics>): void {
    this.broadcastToTeam(teamId, WebSocketEventType.ANALYTICS_UPDATE, {
      metrics,
    });
  }

  /**
   * Broadcast metrics update
   */
  broadcastMetricsUpdate(teamId: string, metricType: string, value: number, metadata?: any): void {
    this.broadcastToTeam(teamId, WebSocketEventType.METRICS_UPDATE, {
      metricType,
      value,
      metadata,
    });
  }

  /**
   * Broadcast notification to team
   */
  broadcastNotification(notification: WebSocketNotification): void {
    if (notification.userId) {
      // User-specific notification
      this.broadcastToUser(notification.userId, WebSocketEventType.NOTIFICATION, notification);
    } else {
      // Team-wide notification
      this.broadcastToTeam(notification.teamId, WebSocketEventType.NOTIFICATION, notification);
    }
  }

  /**
   * Broadcast alert (high priority notification)
   */
  broadcastAlert(teamId: string, title: string, message: string, data?: any): void {
    this.broadcastToTeam(teamId, WebSocketEventType.ALERT, {
      title,
      message,
      data,
      priority: NotificationPriority.HIGH,
    });
  }

  /**
   * Batch broadcast multiple events
   */
  batchBroadcast(teamId: string, events: Array<{ type: WebSocketEventType; data: any }>): void {
    try {
      const io = this.getIO();

      events.forEach(({ type, data }) => {
        io.to(`team:${teamId}`).emit(type, {
          ...data,
          timestamp: new Date(),
        });
      });

      logger.debug('broadcaster', 'Batch broadcasted', {
        teamId,
        eventCount: events.length,
      });
    } catch (error) {
      logger.error('broadcaster', 'Failed to batch broadcast', error as Error, {
        teamId,
        eventCount: events.length,
      });
    }
  }

  /**
   * Get connected clients count for team
   */
  getTeamConnectionsCount(teamId: string): number {
    try {
      const server = getWebSocketServer();
      if (!server) return 0;
      return server.getTeamConnectionsCount(teamId);
    } catch (error) {
      logger.error('broadcaster', 'Failed to get team connections count', error as Error);
      return 0;
    }
  }
}

// Singleton instance
let broadcasterInstance: EventBroadcaster | null = null;

/**
 * Get event broadcaster instance
 */
export function getEventBroadcaster(): EventBroadcaster {
  if (!broadcasterInstance) {
    broadcasterInstance = new EventBroadcaster();
  }
  return broadcasterInstance;
}

/**
 * Broadcast event to team (convenience function)
 * @param teamId - Team ID to broadcast to
 * @param event - Event type from WebSocketEventType
 * @param data - Event payload data
 */
export function broadcastEvent(teamId: string, event: WebSocketEventType, data: any): void {
  const broadcaster = getEventBroadcaster();
  broadcaster.batchBroadcast(teamId, [{ type: event, data }]);
}

/**
 * Reset broadcaster instance (for testing)
 */
export function resetEventBroadcaster(): void {
  broadcasterInstance = null;
}

// Export default instance
export default getEventBroadcaster();
