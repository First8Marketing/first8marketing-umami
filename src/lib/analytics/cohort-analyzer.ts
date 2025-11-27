/**
 * WhatsApp Analytics Integration - Cohort Analyzer
 *
 * User cohort analysis with retention tracking, segment-based cohorts,
 * and comparative analysis across different time periods and user groups.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Cohort definition criteria
 */
export type CohortPeriod = 'daily' | 'weekly' | 'monthly';
export type CohortType = 'acquisition' | 'behavioral' | 'segment' | 'custom';

/**
 * Cohort definition
 */
export interface CohortDefinition {
  cohortId: string;
  name: string;
  type: CohortType;
  period: CohortPeriod;
  startDate: Date;
  endDate?: Date;
  criteria?: Record<string, any>;
}

/**
 * Cohort data
 */
export interface Cohort {
  cohortId: string;
  name: string;
  period: string; // e.g., '2024-01' for monthly, '2024-W01' for weekly
  userCount: number;
  firstActivity: Date;
  metadata?: Record<string, any>;
}

/**
 * Retention data point
 */
export interface RetentionDataPoint {
  period: number; // Periods since cohort start (0, 1, 2, ...)
  activeUsers: number;
  retentionRate: number; // Percentage
  churnedUsers: number;
  churnRate: number; // Percentage
}

/**
 * Cohort metrics
 */
export interface CohortMetrics {
  cohort: Cohort;
  retention: RetentionDataPoint[];
  lifetimeValue: number;
  avgActivityRate: number;
  avgMessagesPerUser: number;
  conversionRate: number;
}

/**
 * Cohort comparison
 */
export interface CohortComparison {
  cohorts: CohortMetrics[];
  retentionTrends: Array<{
    period: number;
    cohortRates: Record<string, number>;
  }>;
  topPerformingCohort: {
    cohortId: string;
    name: string;
    retentionRate: number;
  };
  insights: string[];
}

/**
 * Cohort Analyzer
 */
export class CohortAnalyzer {
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 1800; // 30 minutes

  /**
   * Create acquisition cohorts
   */
  async createAcquisitionCohorts(
    context: TenantContext,
    period: CohortPeriod,
    startDate: Date,
    endDate: Date,
  ): Promise<Cohort[]> {
    const cacheKey = `cohort:acquisition:${context.teamId}:${period}:${startDate.getTime()}-${endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<Cohort[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      logger.info('cohort', 'Creating acquisition cohorts', {
        teamId: context.teamId,
        period,
      });

      const periodFormat = this.getPeriodFormat(period);

      const query = `
        WITH first_activity AS (
          SELECT 
            from_phone as user_phone,
            MIN(timestamp) as first_seen
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $3
            AND direction = 'inbound'
          GROUP BY from_phone
        )
        SELECT 
          to_char(first_seen, $4) as cohort_period,
          COUNT(*) as user_count,
          MIN(first_seen) as first_activity
        FROM first_activity
        GROUP BY cohort_period
        ORDER BY cohort_period;
      `;

      const result = await executeWithContext<{
        cohort_period: string;
        user_count: string;
        first_activity: Date;
      }>(context, query, [context.teamId, startDate, endDate, periodFormat]);

      const cohorts: Cohort[] = result.rows.map(row => ({
        cohortId: `acquisition_${period}_${row.cohort_period}`,
        name: `Acquisition ${this.formatPeriodName(row.cohort_period, period)}`,
        period: row.cohort_period,
        userCount: parseInt(row.user_count, 10),
        firstActivity: row.first_activity,
      }));

      if (this.cacheEnabled) {
        await cache.set(cacheKey, cohorts, this.cacheTTL);
      }

      return cohorts;
    } catch (error) {
      logger.error('cohort', 'Failed to create acquisition cohorts', error as Error);
      throw new DatabaseError('Failed to create acquisition cohorts');
    }
  }

  /**
   * Calculate cohort retention
   */
  async calculateRetention(
    context: TenantContext,
    cohort: Cohort,
    period: CohortPeriod,
    maxPeriods: number = 12,
  ): Promise<RetentionDataPoint[]> {
    const cacheKey = `cohort:retention:${context.teamId}:${cohort.cohortId}:${maxPeriods}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<RetentionDataPoint[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      logger.info('cohort', 'Calculating cohort retention', {
        teamId: context.teamId,
        cohortId: cohort.cohortId,
      });

      const periodInterval = this.getPeriodInterval(period);
      const retention: RetentionDataPoint[] = [];

      // Get cohort users
      const cohortUsersQuery = `
        SELECT DISTINCT from_phone as user_phone
        FROM whatsapp_message
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $2 + INTERVAL '1 ${period}'
          AND direction = 'inbound';
      `;

      const cohortUsersResult = await executeWithContext<{ user_phone: string }>(
        context,
        cohortUsersQuery,
        [context.teamId, cohort.firstActivity],
      );

      const totalUsers = cohortUsersResult.rows.length;
      const userPhones = cohortUsersResult.rows.map(r => r.user_phone);

      if (totalUsers === 0) {
        return [];
      }

      // Calculate retention for each period
      for (let periodNum = 0; periodNum < maxPeriods; periodNum++) {
        const periodStart = new Date(cohort.firstActivity);
        periodStart.setTime(periodStart.getTime() + periodNum * periodInterval);

        const periodEnd = new Date(periodStart);
        periodEnd.setTime(periodEnd.getTime() + periodInterval);

        const activeQuery = `
          SELECT COUNT(DISTINCT from_phone) as active_count
          FROM whatsapp_message
          WHERE team_id = $1
            AND from_phone = ANY($2)
            AND timestamp >= $3
            AND timestamp < $4
            AND direction = 'inbound';
        `;

        const activeResult = await executeWithContext<{ active_count: string }>(
          context,
          activeQuery,
          [context.teamId, userPhones, periodStart, periodEnd],
        );

        const activeUsers = parseInt(activeResult.rows[0]?.active_count || '0', 10);
        const retentionRate = (activeUsers / totalUsers) * 100;
        const churnedUsers = totalUsers - activeUsers;
        const churnRate = (churnedUsers / totalUsers) * 100;

        retention.push({
          period: periodNum,
          activeUsers,
          retentionRate,
          churnedUsers,
          churnRate,
        });
      }

      if (this.cacheEnabled) {
        await cache.set(cacheKey, retention, this.cacheTTL);
      }

      return retention;
    } catch (error) {
      logger.error('cohort', 'Failed to calculate retention', error as Error);
      throw new DatabaseError('Failed to calculate retention');
    }
  }

  /**
   * Get cohort metrics
   */
  async getCohortMetrics(
    context: TenantContext,
    cohort: Cohort,
    period: CohortPeriod,
  ): Promise<CohortMetrics> {
    const cacheKey = `cohort:metrics:${context.teamId}:${cohort.cohortId}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<CohortMetrics>(cacheKey);
      if (cached) return cached;
    }

    try {
      // Calculate retention
      const retention = await this.calculateRetention(context, cohort, period);

      // Calculate activity metrics
      const activityQuery = `
        WITH cohort_users AS (
          SELECT DISTINCT from_phone as user_phone
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $2 + INTERVAL '1 ${period}'
            AND direction = 'inbound'
        )
        SELECT 
          COUNT(m.message_id) as total_messages,
          COUNT(DISTINCT m.from_phone) as active_users,
          COUNT(DISTINCT DATE(m.timestamp)) as active_days
        FROM whatsapp_message m
        INNER JOIN cohort_users cu ON m.from_phone = cu.user_phone
        WHERE m.team_id = $1
          AND m.direction = 'inbound';
      `;

      const activityResult = await executeWithContext<{
        total_messages: string;
        active_users: string;
        active_days: string;
      }>(context, activityQuery, [context.teamId, cohort.firstActivity]);

      const activity = activityResult.rows[0];
      const totalMessages = parseInt(activity?.total_messages || '0', 10);
      const activeUsers = parseInt(activity?.active_users || '0', 10);
      const activeDays = parseInt(activity?.active_days || '0', 10);

      const avgActivityRate = activeUsers > 0 ? activeDays / activeUsers : 0;
      const avgMessagesPerUser = activeUsers > 0 ? totalMessages / activeUsers : 0;

      // Calculate lifetime value (placeholder - would integrate with conversion data)
      const lifetimeValue = 0;
      const conversionRate = 0;

      const metrics: CohortMetrics = {
        cohort,
        retention,
        lifetimeValue,
        avgActivityRate,
        avgMessagesPerUser,
        conversionRate,
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('cohort', 'Failed to get cohort metrics', error as Error);
      throw new DatabaseError('Failed to get cohort metrics');
    }
  }

  /**
   * Compare multiple cohorts
   */
  async compareCohorts(
    context: TenantContext,
    cohorts: Cohort[],
    period: CohortPeriod,
  ): Promise<CohortComparison> {
    try {
      logger.info('cohort', 'Comparing cohorts', {
        teamId: context.teamId,
        cohortCount: cohorts.length,
      });

      // Get metrics for all cohorts
      const metricsPromises = cohorts.map(cohort => this.getCohortMetrics(context, cohort, period));
      const allMetrics = await Promise.all(metricsPromises);

      // Build retention trends (cohort comparison over time)
      const maxPeriods = Math.max(...allMetrics.map(m => m.retention.length));
      const retentionTrends: Array<{
        period: number;
        cohortRates: Record<string, number>;
      }> = [];

      for (let p = 0; p < maxPeriods; p++) {
        const cohortRates: Record<string, number> = {};
        for (const metrics of allMetrics) {
          if (metrics.retention[p]) {
            cohortRates[metrics.cohort.cohortId] = metrics.retention[p].retentionRate;
          }
        }
        retentionTrends.push({ period: p, cohortRates });
      }

      // Find top performing cohort (highest average retention)
      let topCohort = allMetrics[0];
      let topAvgRetention = 0;

      for (const metrics of allMetrics) {
        const avgRetention =
          metrics.retention.reduce((sum, r) => sum + r.retentionRate, 0) / metrics.retention.length;
        if (avgRetention > topAvgRetention) {
          topAvgRetention = avgRetention;
          topCohort = metrics;
        }
      }

      // Generate insights
      const insights = this.generateCohortInsights(allMetrics);

      return {
        cohorts: allMetrics,
        retentionTrends,
        topPerformingCohort: {
          cohortId: topCohort.cohort.cohortId,
          name: topCohort.cohort.name,
          retentionRate: topAvgRetention,
        },
        insights,
      };
    } catch (error) {
      logger.error('cohort', 'Failed to compare cohorts', error as Error);
      throw new DatabaseError('Failed to compare cohorts');
    }
  }

  /**
   * Create behavioral cohorts based on activity patterns
   */
  async createBehavioralCohorts(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
  ): Promise<Cohort[]> {
    try {
      logger.info('cohort', 'Creating behavioral cohorts', { teamId: context.teamId });

      const query = `
        WITH user_activity AS (
          SELECT 
            from_phone,
            COUNT(*) as message_count,
            COUNT(DISTINCT DATE(timestamp)) as active_days,
            MIN(timestamp) as first_seen
          FROM whatsapp_message
          WHERE team_id = $1
            AND timestamp >= $2
            AND timestamp < $3
            AND direction = 'inbound'
          GROUP BY from_phone
        ),
        cohort_assignment AS (
          SELECT 
            from_phone,
            first_seen,
            CASE 
              WHEN message_count >= 50 THEN 'highly_active'
              WHEN message_count >= 20 THEN 'active'
              WHEN message_count >= 5 THEN 'moderate'
              ELSE 'low_activity'
            END as cohort_segment
          FROM user_activity
        )
        SELECT 
          cohort_segment,
          COUNT(*) as user_count,
          MIN(first_seen) as first_activity
        FROM cohort_assignment
        GROUP BY cohort_segment;
      `;

      const result = await executeWithContext<{
        cohort_segment: string;
        user_count: string;
        first_activity: Date;
      }>(context, query, [context.teamId, startDate, endDate]);

      return result.rows.map(row => ({
        cohortId: `behavioral_${row.cohort_segment}`,
        name: `${this.capitalize(row.cohort_segment)} Users`,
        period: 'behavioral',
        userCount: parseInt(row.user_count, 10),
        firstActivity: row.first_activity,
      }));
    } catch (error) {
      logger.error('cohort', 'Failed to create behavioral cohorts', error as Error);
      throw new DatabaseError('Failed to create behavioral cohorts');
    }
  }

  /**
   * Generate insights from cohort analysis
   */
  private generateCohortInsights(metrics: CohortMetrics[]): string[] {
    const insights: string[] = [];

    if (metrics.length === 0) return insights;

    // Retention trend analysis
    const firstCohortRetention = metrics[0].retention.map(r => r.retentionRate);
    const lastCohortRetention = metrics[metrics.length - 1].retention.map(r => r.retentionRate);

    const firstAvg = firstCohortRetention.reduce((a, b) => a + b, 0) / firstCohortRetention.length;
    const lastAvg = lastCohortRetention.reduce((a, b) => a + b, 0) / lastCohortRetention.length;

    if (lastAvg > firstAvg * 1.1) {
      insights.push('Recent cohorts show improved retention, indicating product improvements');
    } else if (lastAvg < firstAvg * 0.9) {
      insights.push('Recent cohorts show declining retention, requires attention');
    }

    // Activity analysis
    const avgActivity = metrics.reduce((sum, m) => sum + m.avgMessagesPerUser, 0) / metrics.length;
    if (avgActivity > 50) {
      insights.push('High user engagement across cohorts');
    } else if (avgActivity < 10) {
      insights.push('Low engagement levels, consider activation strategies');
    }

    // Cohort size trends
    const sizeIncrease =
      (metrics[metrics.length - 1].cohort.userCount / metrics[0].cohort.userCount - 1) * 100;
    if (sizeIncrease > 20) {
      insights.push(`User acquisition growing by ${sizeIncrease.toFixed(0)}%`);
    }

    return insights;
  }

  /**
   * Helper: Get period format for SQL
   */
  private getPeriodFormat(period: CohortPeriod): string {
    switch (period) {
      case 'daily':
        return 'YYYY-MM-DD';
      case 'weekly':
        return 'IYYY-"W"IW';
      case 'monthly':
        return 'YYYY-MM';
    }
  }

  /**
   * Helper: Get period interval in milliseconds
   */
  private getPeriodInterval(period: CohortPeriod): number {
    switch (period) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Helper: Format period name for display
   */
  private formatPeriodName(period: string, type: CohortPeriod): string {
    switch (type) {
      case 'daily':
        return period;
      case 'weekly':
        return `Week ${period}`;
      case 'monthly':
        return period;
      default:
        return period;
    }
  }

  /**
   * Helper: Capitalize string
   */
  private capitalize(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
 * Create cohort analyzer instance
 */
export function createCohortAnalyzer(): CohortAnalyzer {
  return new CohortAnalyzer();
}

export default createCohortAnalyzer();
