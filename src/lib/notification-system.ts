/**
 * WhatsApp Analytics Integration - Notification System
 *
 * In-app and push notification management with priority levels,
 * persistence, read/unread tracking, and user preferences.
 *
 * Note: Uses DragonflyDB-compatible infrastructure for storage and pub/sub.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { getEventBroadcaster, NotificationPriority } from '@/lib/websocket-broadcaster';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Notification type
 */
export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * Notification interface
 */
export interface Notification {
  id: string;
  teamId: string;
  userId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: Date;
  read: boolean;
  dismissed: boolean;
  expiresAt?: Date;
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  userId: string;
  teamId: string;
  enabled: boolean;
  priorities: {
    critical: boolean;
    high: boolean;
    medium: boolean;
    low: boolean;
  };
  types: {
    session: boolean;
    message: boolean;
    conversation: boolean;
    analytics: boolean;
    system: boolean;
  };
  channels: {
    inApp: boolean;
    email?: boolean;
    push?: boolean;
  };
}

/**
 * Notification create params
 */
export interface CreateNotificationParams {
  teamId: string;
  userId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  expiresIn?: number; // seconds
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Notification System
 * Manages creation, storage, delivery, and tracking of notifications
 */
export class NotificationSystem {
  private inMemoryQueue: Map<string, Notification[]> = new Map(); // teamId -> notifications
  private maxQueueSize = 100;

  /**
   * Create and send notification
   */
  async create(context: TenantContext, params: CreateNotificationParams): Promise<Notification> {
    try {
      const notification: Notification = {
        id: uuidv4(),
        teamId: params.teamId,
        userId: params.userId,
        type: params.type,
        priority: params.priority,
        title: params.title,
        message: params.message,
        data: params.data,
        timestamp: new Date(),
        read: false,
        dismissed: false,
        expiresAt: params.expiresIn ? new Date(Date.now() + params.expiresIn * 1000) : undefined,
        actionUrl: params.actionUrl,
        actionLabel: params.actionLabel,
      };

      // Check if user wants this type of notification
      if (params.userId) {
        const preferences = await this.getPreferences(context, params.userId, params.teamId);
        if (!this.shouldSendNotification(notification, preferences)) {
          logger.debug('notification', 'Notification blocked by preferences', {
            userId: params.userId,
            type: params.type,
            priority: params.priority,
          });
          return notification;
        }
      }

      // Store in database
      await this.saveToDatabase(context, notification);

      // Add to in-memory queue
      this.addToQueue(notification);

      // Broadcast via WebSocket
      this.broadcast(notification);

      logger.info('notification', 'Notification created', {
        id: notification.id,
        teamId: notification.teamId,
        userId: notification.userId,
        type: notification.type,
        priority: notification.priority,
      });

      return notification;
    } catch (error) {
      logger.error('notification', 'Failed to create notification', error as Error);
      throw error;
    }
  }

  /**
   * Check if notification should be sent based on preferences
   */
  private shouldSendNotification(
    notification: Notification,
    preferences: NotificationPreferences,
  ): boolean {
    if (!preferences.enabled) return false;

    // Check priority
    const priorityKey = notification.priority as keyof typeof preferences.priorities;
    if (!preferences.priorities[priorityKey]) return false;

    // Check channel
    if (!preferences.channels.inApp) return false;

    return true;
  }

  /**
   * Save notification to database
   */
  private async saveToDatabase(context: TenantContext, notification: Notification): Promise<void> {
    try {
      const sql = `
        INSERT INTO whatsapp_notifications (
          id, team_id, user_id, type, priority, title, message,
          data, timestamp, read, dismissed, expires_at, action_url, action_label
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;

      await executeWithContext(context, sql, [
        notification.id,
        notification.teamId,
        notification.userId || null,
        notification.type,
        notification.priority,
        notification.title,
        notification.message,
        notification.data ? JSON.stringify(notification.data) : null,
        notification.timestamp,
        notification.read,
        notification.dismissed,
        notification.expiresAt || null,
        notification.actionUrl || null,
        notification.actionLabel || null,
      ]);
    } catch (error) {
      // If table doesn't exist yet, just log warning
      logger.warn('notification', 'Failed to save to database (table may not exist yet)', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Add notification to in-memory queue
   */
  private addToQueue(notification: Notification): void {
    const teamQueue = this.inMemoryQueue.get(notification.teamId) || [];
    teamQueue.unshift(notification);

    // Limit queue size
    if (teamQueue.length > this.maxQueueSize) {
      teamQueue.pop();
    }

    this.inMemoryQueue.set(notification.teamId, teamQueue);
  }

  /**
   * Broadcast notification via WebSocket
   */
  private broadcast(notification: Notification): void {
    try {
      const broadcaster = getEventBroadcaster();
      broadcaster.broadcastNotification({
        ...notification,
        teamId: notification.teamId,
      });
    } catch (error) {
      logger.error('notification', 'Failed to broadcast notification', error as Error);
    }
  }

  /**
   * Get notifications for user/team
   */
  async list(
    context: TenantContext,
    teamId: string,
    userId?: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      priority?: NotificationPriority;
    } = {},
  ): Promise<Notification[]> {
    try {
      // Try cache first
      const cacheKey = `notifications:${teamId}:${userId || 'team'}:${JSON.stringify(options)}`;
      const cached = await cache.get<Notification[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Build query
      let sql = `
        SELECT * FROM whatsapp_notifications
        WHERE team_id = $1
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const params: any[] = [teamId];
      let paramIndex = 2;

      if (userId) {
        sql += ` AND (user_id = $${paramIndex} OR user_id IS NULL)`;
        params.push(userId);
        paramIndex++;
      } else {
        sql += ` AND user_id IS NULL`;
      }

      if (options.unreadOnly) {
        sql += ` AND read = false`;
      }

      if (options.priority) {
        sql += ` AND priority = $${paramIndex}`;
        params.push(options.priority);
        paramIndex++;
      }

      sql += ` ORDER BY timestamp DESC`;

      if (options.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const result = await executeWithContext(context, sql, params);
      const notifications = result.rows.map(this.mapRowToNotification);

      // Cache for 30 seconds
      await cache.set(cacheKey, notifications, 30);

      return notifications;
    } catch (error) {
      logger.error('notification', 'Failed to list notifications', error as Error);

      // Fallback to in-memory queue
      const teamQueue = this.inMemoryQueue.get(teamId) || [];
      return userId
        ? teamQueue.filter(n => !n.userId || n.userId === userId)
        : teamQueue.filter(n => !n.userId);
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(context: TenantContext, notificationId: string, userId: string): Promise<void> {
    try {
      const sql = `
        UPDATE whatsapp_notifications
        SET read = true, updated_at = NOW()
        WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
      `;

      await executeWithContext(context, sql, [notificationId, userId]);

      // Clear cache
      await this.clearCache(context, notificationId);

      logger.debug('notification', 'Marked as read', { notificationId, userId });
    } catch (error) {
      logger.error('notification', 'Failed to mark as read', error as Error);
    }
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(context: TenantContext, teamId: string, userId: string): Promise<void> {
    try {
      const sql = `
        UPDATE whatsapp_notifications
        SET read = true, updated_at = NOW()
        WHERE team_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read = false
      `;

      await executeWithContext(context, sql, [teamId, userId]);

      // Clear cache
      await cache.deletePattern(`notifications:${teamId}:*`);

      logger.debug('notification', 'Marked all as read', { teamId, userId });
    } catch (error) {
      logger.error('notification', 'Failed to mark all as read', error as Error);
    }
  }

  /**
   * Dismiss notification
   */
  async dismiss(context: TenantContext, notificationId: string, userId: string): Promise<void> {
    try {
      const sql = `
        UPDATE whatsapp_notifications
        SET dismissed = true, updated_at = NOW()
        WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
      `;

      await executeWithContext(context, sql, [notificationId, userId]);

      // Clear cache
      await this.clearCache(context, notificationId);

      logger.debug('notification', 'Dismissed', { notificationId, userId });
    } catch (error) {
      logger.error('notification', 'Failed to dismiss', error as Error);
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(context: TenantContext, teamId: string, userId?: string): Promise<number> {
    try {
      const cacheKey = `notifications:unread:${teamId}:${userId || 'team'}`;
      const cached = await cache.get<number>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      let sql = `
        SELECT COUNT(*) as count FROM whatsapp_notifications
        WHERE team_id = $1 AND read = false AND dismissed = false
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const params: any[] = [teamId];

      if (userId) {
        sql += ` AND (user_id = $2 OR user_id IS NULL)`;
        params.push(userId);
      } else {
        sql += ` AND user_id IS NULL`;
      }

      const result = await executeWithContext(context, sql, params);
      const count = parseInt(result.rows[0]?.count || '0');

      // Cache for 10 seconds
      await cache.set(cacheKey, count, 10);

      return count;
    } catch (error) {
      logger.error('notification', 'Failed to get unread count', error as Error);
      return 0;
    }
  }

  /**
   * Get or create user preferences
   */
  async getPreferences(
    context: TenantContext,
    userId: string,
    teamId: string,
  ): Promise<NotificationPreferences> {
    try {
      const cacheKey = `preferences:${userId}:${teamId}`;
      const cached = await cache.get<NotificationPreferences>(cacheKey);
      if (cached) {
        return cached;
      }

      const sql = `
        SELECT * FROM whatsapp_notification_preferences
        WHERE user_id = $1 AND team_id = $2
      `;

      const result = await executeWithContext(context, sql, [userId, teamId]);

      let preferences: NotificationPreferences;

      if (result.rows.length > 0) {
        preferences = this.mapRowToPreferences(result.rows[0]);
      } else {
        // Create default preferences
        preferences = this.getDefaultPreferences(userId, teamId);
        await this.savePreferences(context, preferences);
      }

      // Cache for 5 minutes
      await cache.set(cacheKey, preferences, 300);

      return preferences;
    } catch (error) {
      logger.error('notification', 'Failed to get preferences', error as Error);
      return this.getDefaultPreferences(userId, teamId);
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    context: TenantContext,
    preferences: NotificationPreferences,
  ): Promise<void> {
    try {
      await this.savePreferences(context, preferences);

      // Clear cache
      await cache.delete(`preferences:${preferences.userId}:${preferences.teamId}`);

      logger.info('notification', 'Preferences updated', {
        userId: preferences.userId,
        teamId: preferences.teamId,
      });
    } catch (error) {
      logger.error('notification', 'Failed to update preferences', error as Error);
      throw error;
    }
  }

  /**
   * Save preferences to database
   */
  private async savePreferences(
    context: TenantContext,
    preferences: NotificationPreferences,
  ): Promise<void> {
    const sql = `
      INSERT INTO whatsapp_notification_preferences (
        user_id, team_id, enabled, priorities, types, channels
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, team_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        priorities = EXCLUDED.priorities,
        types = EXCLUDED.types,
        channels = EXCLUDED.channels,
        updated_at = NOW()
    `;

    await executeWithContext(context, sql, [
      preferences.userId,
      preferences.teamId,
      preferences.enabled,
      JSON.stringify(preferences.priorities),
      JSON.stringify(preferences.types),
      JSON.stringify(preferences.channels),
    ]);
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(userId: string, teamId: string): NotificationPreferences {
    return {
      userId,
      teamId,
      enabled: true,
      priorities: {
        critical: true,
        high: true,
        medium: true,
        low: false,
      },
      types: {
        session: true,
        message: true,
        conversation: true,
        analytics: true,
        system: true,
      },
      channels: {
        inApp: true,
        email: false,
        push: false,
      },
    };
  }

  /**
   * Clear notification cache
   */
  private async clearCache(context: TenantContext, notificationId: string): Promise<void> {
    try {
      // Get notification to find teamId
      const sql = `SELECT team_id, user_id FROM whatsapp_notifications WHERE id = $1`;
      const result = await executeWithContext(context, sql, [notificationId]);

      if (result.rows.length > 0) {
        const { team_id, user_id } = result.rows[0];
        await cache.deletePattern(`notifications:${team_id}:*`);
        await cache.delete(`notifications:unread:${team_id}:${user_id || 'team'}`);
      }
    } catch (error) {
      logger.error('notification', 'Failed to clear cache', error as Error);
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired(context: TenantContext): Promise<number> {
    try {
      const sql = `
        DELETE FROM whatsapp_notifications
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `;

      const result = await executeWithContext(context, sql);
      const count = result.rowCount || 0;

      logger.info('notification', 'Cleaned up expired notifications', { count });

      return count;
    } catch (error) {
      logger.error('notification', 'Failed to cleanup expired', error as Error);
      return 0;
    }
  }

  /**
   * Map database row to notification
   */
  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : undefined,
      timestamp: new Date(row.timestamp),
      read: row.read,
      dismissed: row.dismissed,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      actionUrl: row.action_url,
      actionLabel: row.action_label,
    };
  }

  /**
   * Map database row to preferences
   */
  private mapRowToPreferences(row: any): NotificationPreferences {
    return {
      userId: row.user_id,
      teamId: row.team_id,
      enabled: row.enabled,
      priorities: JSON.parse(row.priorities),
      types: JSON.parse(row.types),
      channels: JSON.parse(row.channels),
    };
  }
}

// Singleton instance
let notificationSystemInstance: NotificationSystem | null = null;

/**
 * Get notification system instance
 */
export function getNotificationSystem(): NotificationSystem {
  if (!notificationSystemInstance) {
    notificationSystemInstance = new NotificationSystem();
  }
  return notificationSystemInstance;
}

/**
 * Reset notification system (for testing)
 */
export function resetNotificationSystem(): void {
  notificationSystemInstance = null;
}

// Export default instance
export default getNotificationSystem();
