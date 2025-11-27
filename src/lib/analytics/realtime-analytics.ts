/// <reference types="node" />
/**
 * WhatsApp Analytics Integration - Real-Time Analytics
 *
 * Live analytics processing for real-time metrics, active conversations,
 * streaming data, and WebSocket-ready data structures.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache, pubsub } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError, ValidationError } from '@/lib/whatsapp-errors';
import type { TenantContext, ConversationStatus } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Real-time metric types
 */
export type RealTimeMetricType =
  | 'active_conversations'
  | 'messages_per_minute'
  | 'response_time'
  | 'funnel_distribution'
  | 'agent_status';

/**
 * Real-time event
 */
export interface RealTimeEvent {
  eventId: string;
  teamId: string;
  type: string;
  timestamp: Date;
  data: Record<string, any>;
}

/**
 * Live metric snapshot
 */
export interface LiveMetricSnapshot {
  timestamp: Date;
  activeConversations: number;
  messagesLastHour: number;
  messagesLastMinute: number;
  avgResponseTime: number;
  activeAgents: number;
  queueLength: number;
}

/**
 * Active conversation data
 */
export interface ActiveConversation {
  conversationId: string;
  contactPhone: string;
  contactName?: string;
  status: ConversationStatus;
  lastMessageAt: Date;
  unreadCount: number;
  assignedTo?: string;
  stage?: string;
  waitingTime: number; // seconds
}

/**
 * Funnel stage distribution
 */
export interface FunnelDistribution {
  stage: string;
  count: number;
  percentage: number;
}

/**
 * Agent status
 */
export interface AgentStatus {
  agentId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  activeConversations: number;
  lastActivity: Date;
}

/**
 * Real-Time Analytics
 */
export class RealTimeAnalytics {
  private updateInterval: number = 10000; // 10 seconds
  private cacheKeyPrefix = 'realtime';

  /**
   * Get current live metrics
   */
  async getLiveMetrics(context: TenantContext): Promise<LiveMetricSnapshot> {
    const cacheKey = `${this.cacheKeyPrefix}:metrics:${context.teamId}`;

    // Try cache first for performance
    const cached = await cache.get<LiveMetricSnapshot>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      logger.debug('realtime', 'Calculating live metrics', { teamId: context.teamId });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      // Parallel queries for performance
      const [conversationsResult, messagesHourResult, messagesMinuteResult, responseTimeResult] =
        await Promise.all([
          // Active conversations
          executeWithContext<{ count: string }>(
            context,
            `SELECT COUNT(*) as count 
             FROM whatsapp_conversation 
             WHERE team_id = $1 AND status = 'open'`,
            [context.teamId],
          ),
          // Messages in last hour
          executeWithContext<{ count: string }>(
            context,
            `SELECT COUNT(*) as count 
             FROM whatsapp_message 
             WHERE team_id = $1 AND timestamp >= $2`,
            [context.teamId, oneHourAgo],
          ),
          // Messages in last minute
          executeWithContext<{ count: string }>(
            context,
            `SELECT COUNT(*) as count 
             FROM whatsapp_message 
             WHERE team_id = $1 AND timestamp >= $2`,
            [context.teamId, oneMinuteAgo],
          ),
          // Avg response time (last hour)
          executeWithContext<{ avg_time: number }>(
            context,
            `WITH response_pairs AS (
               SELECT 
                 EXTRACT(EPOCH FROM (m2.timestamp - m1.timestamp)) as response_time
               FROM whatsapp_message m1
               JOIN whatsapp_message m2 ON m1.conversation_id = m2.conversation_id
               WHERE m1.team_id = $1
                 AND m1.timestamp >= $2
                 AND m1.direction = 'inbound'
                 AND m2.direction = 'outbound'
                 AND m2.timestamp > m1.timestamp
                 AND m2.timestamp <= m1.timestamp + INTERVAL '1 hour'
             )
             SELECT AVG(response_time) as avg_time FROM response_pairs`,
            [context.teamId, oneHourAgo],
          ),
        ]);

      const metrics: LiveMetricSnapshot = {
        timestamp: now,
        activeConversations: parseInt(conversationsResult.rows[0]?.count || '0', 10),
        messagesLastHour: parseInt(messagesHourResult.rows[0]?.count || '0', 10),
        messagesLastMinute: parseInt(messagesMinuteResult.rows[0]?.count || '0', 10),
        avgResponseTime: responseTimeResult.rows[0]?.avg_time || 0,
        activeAgents: 0, // TODO: Implement agent tracking
        queueLength: 0, // TODO: Implement queue tracking
      };

      // Cache for short duration
      await cache.set(cacheKey, metrics, 30); // 30 seconds

      return metrics;
    } catch (error) {
      logger.error('realtime', 'Failed to get live metrics', error as Error);
      throw new DatabaseError('Failed to get live metrics');
    }
  }

  /**
   * Get active conversations with real-time data
   */
  async getActiveConversations(
    context: TenantContext,
    limit: number = 50,
  ): Promise<ActiveConversation[]> {
    try {
      const now = new Date();

      const query = `
        SELECT 
          c.conversation_id,
          c.contact_phone,
          c.contact_name,
          c.status,
          c.last_message_at,
          c.unread_count,
          c.assigned_to,
          c.stage,
          EXTRACT(EPOCH FROM ($2 - c.last_message_at)) as waiting_seconds
        FROM whatsapp_conversation c
        WHERE c.team_id = $1
          AND c.status = 'open'
        ORDER BY c.last_message_at DESC
        LIMIT $3;
      `;

      const result = await executeWithContext<{
        conversation_id: string;
        contact_phone: string;
        contact_name: string;
        status: ConversationStatus;
        last_message_at: Date;
        unread_count: number;
        assigned_to: string;
        stage: string;
        waiting_seconds: number;
      }>(context, query, [context.teamId, now, limit]);

      return result.rows.map(row => ({
        conversationId: row.conversation_id,
        contactPhone: row.contact_phone,
        contactName: row.contact_name,
        status: row.status,
        lastMessageAt: row.last_message_at,
        unreadCount: row.unread_count,
        assignedTo: row.assigned_to,
        stage: row.stage,
        waitingTime: row.waiting_seconds,
      }));
    } catch (error) {
      logger.error('realtime', 'Failed to get active conversations', error as Error);
      throw new DatabaseError('Failed to get active conversations');
    }
  }

  /**
   * Get current funnel stage distribution
   */
  async getFunnelDistribution(context: TenantContext): Promise<FunnelDistribution[]> {
    const cacheKey = `${this.cacheKeyPrefix}:funnel:${context.teamId}`;

    const cached = await cache.get<FunnelDistribution[]>(cacheKey);
    if (cached) return cached;

    try {
      const query = `
        SELECT 
          stage,
          COUNT(*) as count,
          COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
        FROM whatsapp_conversation
        WHERE team_id = $1
          AND status = 'open'
          AND stage IS NOT NULL
        GROUP BY stage
        ORDER BY 
          CASE stage
            WHEN 'initial_contact' THEN 1
            WHEN 'qualification' THEN 2
            WHEN 'proposal' THEN 3
            WHEN 'negotiation' THEN 4
            WHEN 'close' THEN 5
            ELSE 6
          END;
      `;

      const result = await executeWithContext<{
        stage: string;
        count: string;
        percentage: number;
      }>(context, query, [context.teamId]);

      const distribution = result.rows.map(row => ({
        stage: row.stage,
        count: parseInt(row.count, 10),
        percentage: row.percentage,
      }));

      await cache.set(cacheKey, distribution, 60); // 1 minute cache

      return distribution;
    } catch (error) {
      logger.error('realtime', 'Failed to get funnel distribution', error as Error);
      throw new DatabaseError('Failed to get funnel distribution');
    }
  }

  /**
   * Process real-time event
   */
  async processEvent(event: RealTimeEvent): Promise<void> {
    try {
      logger.debug('realtime', 'Processing real-time event', {
        eventId: event.eventId,
        type: event.type,
      });

      // Publish event to subscribers
      await pubsub.publish(`realtime:${event.teamId}`, event);

      // Update relevant metrics
      switch (event.type) {
        case 'message_received':
        case 'message_sent':
          await this.incrementMessageCounter(event.teamId);
          break;
        case 'conversation_opened':
        case 'conversation_closed':
          await this.invalidateConversationCache(event.teamId);
          break;
        case 'funnel_stage_changed':
          await this.invalidateFunnelCache(event.teamId);
          break;
      }
    } catch (error) {
      logger.error('realtime', 'Failed to process event', error as Error, {
        eventId: event.eventId,
      });
    }
  }

  /**
   * Subscribe to real-time events
   */
  async subscribe(teamId: string, callback: (event: RealTimeEvent) => void): Promise<void> {
    try {
      await pubsub.subscribe(`realtime:${teamId}`, callback);
      logger.info('realtime', 'Subscribed to real-time events', { teamId });
    } catch (error) {
      logger.error('realtime', 'Failed to subscribe to events', error as Error);
      throw new DatabaseError('Failed to subscribe to events');
    }
  }

  /**
   * Unsubscribe from real-time events
   */
  async unsubscribe(teamId: string): Promise<void> {
    try {
      await pubsub.unsubscribe(`realtime:${teamId}`);
      logger.info('realtime', 'Unsubscribed from real-time events', { teamId });
    } catch (error) {
      logger.error('realtime', 'Failed to unsubscribe from events', error as Error);
    }
  }

  /**
   * Get streaming data for dashboard
   */
  async getStreamingData(context: TenantContext): Promise<{
    liveMetrics: LiveMetricSnapshot;
    activeConversations: ActiveConversation[];
    funnelDistribution: FunnelDistribution[];
    recentActivity: Array<{
      timestamp: Date;
      type: string;
      description: string;
    }>;
  }> {
    try {
      const [liveMetrics, activeConversations, funnelDistribution] = await Promise.all([
        this.getLiveMetrics(context),
        this.getActiveConversations(context, 10),
        this.getFunnelDistribution(context),
      ]);

      // Get recent activity (last 10 events)
      const recentActivity = await this.getRecentActivity(context, 10);

      return {
        liveMetrics,
        activeConversations,
        funnelDistribution,
        recentActivity,
      };
    } catch (error) {
      logger.error('realtime', 'Failed to get streaming data', error as Error);
      throw new DatabaseError('Failed to get streaming data');
    }
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(
    context: TenantContext,
    limit: number,
  ): Promise<Array<{ timestamp: Date; type: string; description: string }>> {
    try {
      const query = `
        SELECT 
          timestamp,
          event_type as type,
          event_data->>'description' as description
        FROM whatsapp_event
        WHERE team_id = $1
          AND processed = true
        ORDER BY timestamp DESC
        LIMIT $2;
      `;

      const result = await executeWithContext<{
        timestamp: Date;
        type: string;
        description: string;
      }>(context, query, [context.teamId, limit]);

      return result.rows;
    } catch (error) {
      logger.error('realtime', 'Failed to get recent activity', error as Error);
      return [];
    }
  }

  /**
   * Increment message counter
   */
  private async incrementMessageCounter(teamId: string): Promise<void> {
    const key = `${this.cacheKeyPrefix}:message_count:${teamId}`;
    await cache.get(key); // Increment logic would go here
  }

  /**
   * Invalidate conversation cache
   */
  private async invalidateConversationCache(teamId: string): Promise<void> {
    await cache.delete(`${this.cacheKeyPrefix}:metrics:${teamId}`);
  }

  /**
   * Invalidate funnel cache
   */
  private async invalidateFunnelCache(teamId: string): Promise<void> {
    await cache.delete(`${this.cacheKeyPrefix}:funnel:${teamId}`);
  }

  /**
   * Start metrics collection (for background processing)
   */
  startMetricsCollection(
    context: TenantContext,
    callback: (metrics: LiveMetricSnapshot) => void,
  ): NodeJS.Timeout {
    logger.info('realtime', 'Starting metrics collection', {
      teamId: context.teamId,
      interval: this.updateInterval,
    });

    const intervalId = setInterval(async () => {
      try {
        const metrics = await this.getLiveMetrics(context);
        callback(metrics);
      } catch (error) {
        logger.error('realtime', 'Metrics collection error', error as Error);
      }
    }, this.updateInterval);

    return intervalId;
  }

  /**
   * Stop metrics collection
   */
  stopMetricsCollection(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    logger.info('realtime', 'Metrics collection stopped');
  }

  /**
   * Set update interval
   */
  setUpdateInterval(milliseconds: number): void {
    if (milliseconds < 1000) {
      throw new ValidationError('Update interval must be at least 1000ms');
    }
    this.updateInterval = milliseconds;
  }

  /**
   * Get alert thresholds status
   */
  async checkAlertThresholds(
    context: TenantContext,
    thresholds: {
      maxResponseTime?: number;
      maxQueueLength?: number;
      maxWaitingTime?: number;
    },
  ): Promise<{
    alerts: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      value: number;
      threshold: number;
    }>;
  }> {
    try {
      const metrics = await this.getLiveMetrics(context);
      const activeConversations = await this.getActiveConversations(context, 100);
      const alerts: any[] = [];

      // Check response time
      if (thresholds.maxResponseTime && metrics.avgResponseTime > thresholds.maxResponseTime) {
        alerts.push({
          type: 'response_time',
          severity: 'high',
          message: 'Average response time exceeds threshold',
          value: metrics.avgResponseTime,
          threshold: thresholds.maxResponseTime,
        });
      }

      // Check queue length
      if (thresholds.maxQueueLength && metrics.queueLength > thresholds.maxQueueLength) {
        alerts.push({
          type: 'queue_length',
          severity: 'medium',
          message: 'Queue length exceeds threshold',
          value: metrics.queueLength,
          threshold: thresholds.maxQueueLength,
        });
      }

      // Check waiting times
      if (thresholds.maxWaitingTime) {
        const longWaiting = activeConversations.filter(
          c => c.waitingTime > thresholds.maxWaitingTime!,
        );
        if (longWaiting.length > 0) {
          alerts.push({
            type: 'waiting_time',
            severity: 'medium',
            message: `${longWaiting.length} conversations waiting too long`,
            value: longWaiting.length,
            threshold: thresholds.maxWaitingTime,
          });
        }
      }

      return { alerts };
    } catch (error) {
      logger.error('realtime', 'Failed to check alert thresholds', error as Error);
      throw new DatabaseError('Failed to check alert thresholds');
    }
  }
}

/**
 * Create real-time analytics instance
 */
export function createRealTimeAnalytics(): RealTimeAnalytics {
  return new RealTimeAnalytics();
}

export default createRealTimeAnalytics();
