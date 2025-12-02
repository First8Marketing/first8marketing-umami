/**
 * WhatsApp Analytics Integration - Metrics Calculator
 *
 * Core metrics computation service for response times, volumes, conversations,
 * engagement, and agent performance. Leverages database aggregations and Redis caching.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Date range for metrics
 */
export interface MetricsDateRange {
  startDate: Date;
  endDate: Date;
  timezone?: string; // IANA timezone (default: UTC)
}

/**
 * Response time metrics
 */
export interface ResponseTimeMetrics {
  avgFirstResponseTime: number; // seconds
  avgResponseTime: number; // seconds
  medianResponseTime: number; // seconds
  p95ResponseTime: number; // seconds
  byTimeOfDay: Array<{ hour: number; avgResponseTime: number }>;
  byDayOfWeek: Array<{ dayOfWeek: number; avgResponseTime: number }>;
}

/**
 * Volume metrics
 */
export interface VolumeMetrics {
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  messagesByHour: Array<{ hour: string; count: number }>;
  messagesByDay: Array<{ day: string; count: number }>;
  messagesByWeek: Array<{ week: string; count: number }>;
  messagesByMonth: Array<{ month: string; count: number }>;
  peakHours: Array<{ hour: number; count: number }>;
  growthRate: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

/**
 * Conversation metrics
 */
export interface ConversationMetrics {
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  archivedConversations: number;
  avgMessagesPerConversation: number;
  avgConversationDuration: number; // seconds
  resolutionRate: number; // percentage
  reopenedRate: number; // percentage
  conversationsByStage: Record<string, number>;
}

/**
 * Engagement metrics
 */
export interface EngagementMetrics {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  avgMessageFrequency: number; // messages per user per day
  userRetentionRate: number; // percentage
  userChurnRate: number; // percentage
  engagementScore: number; // 0-100
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  agentId: string;
  messagesHandled: number;
  avgResponseTime: number;
  conversationsResolved: number;
  satisfactionScore: number | null;
}

/**
 * Metrics Calculator
 */
export class MetricsCalculator {
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 900; // 15 minutes

  /**
   * Calculate response time metrics
   */
  async calculateResponseTimeMetrics(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<ResponseTimeMetrics> {
    const cacheKey = `metrics:response_time:${context.teamId}:${range.startDate.getTime()}-${range.endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<ResponseTimeMetrics>(cacheKey);
      if (cached) {
        logger.debug('metrics', 'Response time metrics cache hit', { teamId: context.teamId });
        return cached;
      }
    }

    try {
      logger.info('metrics', 'Calculating response time metrics', {
        teamId: context.teamId,
        range,
      });

      // Calculate response times using window functions
      const query = `
        WITH message_pairs AS (
          SELECT 
            m1.message_id,
            m1.timestamp as customer_msg_time,
            m2.timestamp as agent_msg_time,
            EXTRACT(EPOCH FROM (m2.timestamp - m1.timestamp)) as response_time_seconds,
            EXTRACT(HOUR FROM m1.timestamp AT TIME ZONE COALESCE($4, 'UTC')) as hour_of_day,
            EXTRACT(DOW FROM m1.timestamp AT TIME ZONE COALESCE($4, 'UTC')) as day_of_week,
            ROW_NUMBER() OVER (PARTITION BY m1.conversation_id ORDER BY m1.timestamp) as is_first
          FROM whatsapp_message m1
          INNER JOIN whatsapp_message m2 ON m1.conversation_id = m2.conversation_id
          WHERE m1.team_id = $1
            AND m1.timestamp >= $2
            AND m1.timestamp < $3
            AND m1.direction = 'inbound'
            AND m2.direction = 'outbound'
            AND m2.timestamp > m1.timestamp
            AND m2.timestamp <= m1.timestamp + INTERVAL '24 hours'
        )
        SELECT
          AVG(CASE WHEN is_first = 1 THEN response_time_seconds END) as avg_first_response,
          AVG(response_time_seconds) as avg_response,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_seconds) as median_response,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_seconds) as p95_response,
          json_agg(
            json_build_object('hour', hour_of_day, 'avg', AVG(response_time_seconds))
          ) FILTER (WHERE hour_of_day IS NOT NULL) as by_hour,
          json_agg(
            json_build_object('day', day_of_week, 'avg', AVG(response_time_seconds))
          ) FILTER (WHERE day_of_week IS NOT NULL) as by_day
        FROM message_pairs
        GROUP BY hour_of_day, day_of_week;
      `;

      const result = await executeWithContext<{
        avg_first_response: number;
        avg_response: number;
        median_response: number;
        p95_response: number;
        by_hour: Array<{ hour: number; avg: number }>;
        by_day: Array<{ day: number; avg: number }>;
      }>(context, query, [context.teamId, range.startDate, range.endDate, range.timezone || 'UTC']);

      const row = result.rows[0];
      const metrics: ResponseTimeMetrics = {
        avgFirstResponseTime: row?.avg_first_response || 0,
        avgResponseTime: row?.avg_response || 0,
        medianResponseTime: row?.median_response || 0,
        p95ResponseTime: row?.p95_response || 0,
        byTimeOfDay: row?.by_hour || [],
        byDayOfWeek: row?.by_day || [],
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('metrics', 'Failed to calculate response time metrics', error as Error);
      throw new DatabaseError('Failed to calculate response time metrics');
    }
  }

  /**
   * Calculate volume metrics
   */
  async calculateVolumeMetrics(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<VolumeMetrics> {
    const cacheKey = `metrics:volume:${context.teamId}:${range.startDate.getTime()}-${range.endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<VolumeMetrics>(cacheKey);
      if (cached) return cached;
    }

    try {
      // Total and directional counts
      const countsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
          COUNT(*) FILTER (WHERE direction = 'outbound') as outbound
        FROM whatsapp_message
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $3;
      `;

      const countsResult = await executeWithContext<{
        total: string;
        inbound: string;
        outbound: string;
      }>(context, countsQuery, [context.teamId, range.startDate, range.endDate]);

      const counts = countsResult.rows[0];

      // Time-series data
      const timeSeriesQuery = `
        SELECT
          date_trunc('hour', timestamp AT TIME ZONE COALESCE($4, 'UTC')) as hour,
          date_trunc('day', timestamp AT TIME ZONE COALESCE($4, 'UTC')) as day,
          date_trunc('week', timestamp AT TIME ZONE COALESCE($4, 'UTC')) as week,
          date_trunc('month', timestamp AT TIME ZONE COALESCE($4, 'UTC')) as month,
          COUNT(*) as count
        FROM whatsapp_message
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $3
        GROUP BY hour, day, week, month
        ORDER BY hour, day, week, month;
      `;

      const timeSeriesResult = await executeWithContext<{
        hour: Date;
        day: Date;
        week: Date;
        month: Date;
        count: string;
      }>(context, timeSeriesQuery, [
        context.teamId,
        range.startDate,
        range.endDate,
        range.timezone || 'UTC',
      ]);

      // Aggregate by period
      const messagesByHour: Map<string, number> = new Map();
      const messagesByDay: Map<string, number> = new Map();
      const messagesByWeek: Map<string, number> = new Map();
      const messagesByMonth: Map<string, number> = new Map();

      for (const row of timeSeriesResult.rows) {
        const count = parseInt(row.count, 10);
        const hourKey = row.hour.toISOString();
        const dayKey = row.day.toISOString().split('T')[0];
        const weekKey = row.week.toISOString().split('T')[0];
        const monthKey = row.month.toISOString().substring(0, 7);

        messagesByHour.set(hourKey, (messagesByHour.get(hourKey) || 0) + count);
        messagesByDay.set(dayKey, (messagesByDay.get(dayKey) || 0) + count);
        messagesByWeek.set(weekKey, (messagesByWeek.get(weekKey) || 0) + count);
        messagesByMonth.set(monthKey, (messagesByMonth.get(monthKey) || 0) + count);
      }

      // Peak hours (top 5)
      const hourCounts = Array.from(messagesByHour.entries())
        .map(([hour, count]) => ({
          hour: new Date(hour).getHours(),
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Growth rates (simplified - requires previous period data)
      const metrics: VolumeMetrics = {
        totalMessages: parseInt(counts?.total || '0', 10),
        inboundMessages: parseInt(counts?.inbound || '0', 10),
        outboundMessages: parseInt(counts?.outbound || '0', 10),
        messagesByHour: Array.from(messagesByHour.entries()).map(([hour, count]) => ({
          hour,
          count,
        })),
        messagesByDay: Array.from(messagesByDay.entries()).map(([day, count]) => ({ day, count })),
        messagesByWeek: Array.from(messagesByWeek.entries()).map(([week, count]) => ({
          week,
          count,
        })),
        messagesByMonth: Array.from(messagesByMonth.entries()).map(([month, count]) => ({
          month,
          count,
        })),
        peakHours: hourCounts,
        growthRate: {
          daily: 0, // TODO: Calculate from previous period
          weekly: 0,
          monthly: 0,
        },
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('metrics', 'Failed to calculate volume metrics', error as Error);
      throw new DatabaseError('Failed to calculate volume metrics');
    }
  }

  /**
   * Calculate conversation metrics
   */
  async calculateConversationMetrics(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<ConversationMetrics> {
    const cacheKey = `metrics:conversation:${context.teamId}:${range.startDate.getTime()}-${range.endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<ConversationMetrics>(cacheKey);
      if (cached) return cached;
    }

    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'closed') as closed,
          COUNT(*) FILTER (WHERE status = 'archived') as archived,
          AVG(message_count) as avg_messages,
          AVG(EXTRACT(EPOCH FROM (last_message_at - first_message_at))) as avg_duration,
          COUNT(*) FILTER (WHERE status = 'closed') * 100.0 / NULLIF(COUNT(*), 0) as resolution_rate,
          stage,
          COUNT(*) as stage_count
        FROM whatsapp_conversation
        WHERE team_id = $1
          AND created_at >= $2
          AND created_at < $3
        GROUP BY stage;
      `;

      const result = await executeWithContext<{
        total: string;
        open: string;
        closed: string;
        archived: string;
        avg_messages: number;
        avg_duration: number;
        resolution_rate: number;
        stage: string;
        stage_count: string;
      }>(context, query, [context.teamId, range.startDate, range.endDate]);

      const conversationsByStage: Record<string, number> = {};
      let total = 0;
      let open = 0;
      let closed = 0;
      let archived = 0;
      let avgMessages = 0;
      let avgDuration = 0;
      let resolutionRate = 0;

      for (const row of result.rows) {
        total = parseInt(row.total, 10);
        open = parseInt(row.open, 10);
        closed = parseInt(row.closed, 10);
        archived = parseInt(row.archived, 10);
        avgMessages = row.avg_messages;
        avgDuration = row.avg_duration;
        resolutionRate = row.resolution_rate;

        if (row.stage) {
          conversationsByStage[row.stage] = parseInt(row.stage_count, 10);
        }
      }

      const metrics: ConversationMetrics = {
        totalConversations: total,
        openConversations: open,
        closedConversations: closed,
        archivedConversations: archived,
        avgMessagesPerConversation: avgMessages || 0,
        avgConversationDuration: avgDuration || 0,
        resolutionRate: resolutionRate || 0,
        reopenedRate: 0, // TODO: Track reopened conversations
        conversationsByStage,
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('metrics', 'Failed to calculate conversation metrics', error as Error);
      throw new DatabaseError('Failed to calculate conversation metrics');
    }
  }

  /**
   * Calculate engagement metrics
   */
  async calculateEngagementMetrics(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<EngagementMetrics> {
    const cacheKey = `metrics:engagement:${context.teamId}:${range.startDate.getTime()}-${range.endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<EngagementMetrics>(cacheKey);
      if (cached) return cached;
    }

    try {
      // Active users by period
      const activeUsersQuery = `
        WITH daily AS (
          SELECT COUNT(DISTINCT from_phone) as dau
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $3
            AND direction = 'inbound'
            AND timestamp >= CURRENT_DATE - INTERVAL '1 day'
        ),
        weekly AS (
          SELECT COUNT(DISTINCT from_phone) as wau
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $3
            AND direction = 'inbound'
            AND timestamp >= CURRENT_DATE - INTERVAL '7 days'
        ),
        monthly AS (
          SELECT COUNT(DISTINCT from_phone) as mau
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $3
            AND direction = 'inbound'
            AND timestamp >= CURRENT_DATE - INTERVAL '30 days'
        )
        SELECT 
          (SELECT dau FROM daily) as daily_active_users,
          (SELECT wau FROM weekly) as weekly_active_users,
          (SELECT mau FROM monthly) as monthly_active_users;
      `;

      const activeUsersResult = await executeWithContext<{
        daily_active_users: string;
        weekly_active_users: string;
        monthly_active_users: string;
      }>(context, activeUsersQuery, [context.teamId, range.startDate, range.endDate]);

      const activeUsers = activeUsersResult.rows[0];

      // Message frequency
      const frequencyQuery = `
        SELECT 
          COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT from_phone), 0) / 
          NULLIF(EXTRACT(DAYS FROM ($3 - $2)), 0) as avg_frequency
        FROM whatsapp_message
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $3
          AND direction = 'inbound';
      `;

      const frequencyResult = await executeWithContext<{
        avg_frequency: number;
      }>(context, frequencyQuery, [context.teamId, range.startDate, range.endDate]);

      const metrics: EngagementMetrics = {
        dailyActiveUsers: parseInt(activeUsers?.daily_active_users || '0', 10),
        weeklyActiveUsers: parseInt(activeUsers?.weekly_active_users || '0', 10),
        monthlyActiveUsers: parseInt(activeUsers?.monthly_active_users || '0', 10),
        avgMessageFrequency: frequencyResult.rows[0]?.avg_frequency || 0,
        userRetentionRate: 0, // TODO: Implement cohort-based retention
        userChurnRate: 0, // TODO: Implement churn tracking
        engagementScore: 0, // TODO: Implement composite engagement score
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('metrics', 'Failed to calculate engagement metrics', error as Error);
      throw new DatabaseError('Failed to calculate engagement metrics');
    }
  }

  /**
   * Calculate agent performance metrics
   */
  async calculateAgentPerformanceMetrics(
    context: TenantContext,
    range: MetricsDateRange,
    agentId?: string,
  ): Promise<AgentPerformanceMetrics[]> {
    const cacheKey = `metrics:agent:${context.teamId}:${agentId || 'all'}:${range.startDate.getTime()}-${range.endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<AgentPerformanceMetrics[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const query = `
        SELECT 
          c.assigned_to as agent_id,
          COUNT(DISTINCT m.message_id) as messages_handled,
          AVG(
            EXTRACT(EPOCH FROM (
              m.timestamp - LAG(m.timestamp) OVER (
                PARTITION BY m.conversation_id 
                ORDER BY m.timestamp
              )
            ))
          ) as avg_response_time,
          COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.conversation_id END) as conversations_resolved
        FROM whatsapp_conversation c
        LEFT JOIN whatsapp_message m ON c.conversation_id = m.conversation_id
        WHERE c.team_id = $1
          AND c.created_at >= $2
          AND c.created_at < $3
          ${agentId ? 'AND c.assigned_to = $4' : ''}
          AND c.assigned_to IS NOT NULL
        GROUP BY c.assigned_to;
      `;

      const params = agentId
        ? [context.teamId, range.startDate, range.endDate, agentId]
        : [context.teamId, range.startDate, range.endDate];

      const result = await executeWithContext<{
        agent_id: string;
        messages_handled: string;
        avg_response_time: number;
        conversations_resolved: string;
      }>(context, query, params);

      const metrics: AgentPerformanceMetrics[] = result.rows.map(row => ({
        agentId: row.agent_id,
        messagesHandled: parseInt(row.messages_handled, 10),
        avgResponseTime: row.avg_response_time || 0,
        conversationsResolved: parseInt(row.conversations_resolved, 10),
        satisfactionScore: null, // TODO: Implement satisfaction tracking
      }));

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('metrics', 'Failed to calculate agent performance metrics', error as Error);
      throw new DatabaseError('Failed to calculate agent performance metrics');
    }
  }

  /**
   * Set cache configuration
   */
  setCacheConfig(enabled: boolean, ttl?: number): void {
    this.cacheEnabled = enabled;
    if (ttl !== undefined) {
      this.cacheTTL = ttl;
    }
  }
}

/**
 * Create metrics calculator instance
 */
export function createMetricsCalculator(): MetricsCalculator {
  return new MetricsCalculator();
}

export default createMetricsCalculator();
