/**
 * WhatsApp Analytics Integration - Analytics Event Handler
 *
 * Handles real-time events related to WhatsApp analytics:
 * - Real-time analytics updates
 * - Metric changes
 * - Live dashboard data
 * - Threshold breach alerts
 */

import { getEventBroadcaster } from '@/lib/websocket-broadcaster';
import { getNotificationSystem, NotificationType } from '@/lib/notification-system';
import { NotificationPriority } from '@/lib/websocket-broadcaster';
import { getLogger } from '@/lib/whatsapp-logger';
import type { TenantContext, WhatsAppMetrics } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Metric threshold configuration
 */
export interface MetricThreshold {
  metric: string;
  threshold: number;
  comparison: 'above' | 'below';
  priority: NotificationPriority;
}

/**
 * Analytics Event Handler
 */
export class AnalyticsEventHandler {
  private broadcaster = getEventBroadcaster();
  private notificationSystem = getNotificationSystem();
  private thresholds: MetricThreshold[] = [
    {
      metric: 'response_time',
      threshold: 300, // 5 minutes
      comparison: 'above',
      priority: NotificationPriority.HIGH,
    },
    {
      metric: 'active_conversations',
      threshold: 50,
      comparison: 'above',
      priority: NotificationPriority.MEDIUM,
    },
    {
      metric: 'unread_messages',
      threshold: 20,
      comparison: 'above',
      priority: NotificationPriority.HIGH,
    },
  ];

  /**
   * Handle real-time analytics update
   */
  async onAnalyticsUpdate(context: TenantContext, metrics: WhatsAppMetrics): Promise<void> {
    try {
      logger.debug('analytics-handler', 'Analytics update', {
        totalMessages: metrics.totalMessages,
        activeConversations: metrics.activeConversations,
      });

      // Broadcast metrics to team
      this.broadcaster.broadcastAnalyticsUpdate(context.teamId, metrics);

      // Check for threshold breaches
      await this.checkThresholds(context, metrics);
    } catch (error) {
      logger.error('analytics-handler', 'Failed to handle analytics update', error as Error);
    }
  }

  /**
   * Handle metric change
   */
  async onMetricChanged(
    context: TenantContext,
    metricType: string,
    value: number,
    previousValue?: number,
    metadata?: any,
  ): Promise<void> {
    try {
      logger.debug('analytics-handler', 'Metric changed', {
        metricType,
        value,
        previousValue,
      });

      // Broadcast metric update
      this.broadcaster.broadcastMetricsUpdate(context.teamId, metricType, value, metadata);

      // Calculate change percentage if previous value exists
      if (previousValue !== undefined && previousValue !== 0) {
        const changePercent = ((value - previousValue) / previousValue) * 100;

        // Notify on significant changes (>20%)
        if (Math.abs(changePercent) > 20) {
          await this.notifySignificantChange(
            context,
            metricType,
            value,
            previousValue,
            changePercent,
          );
        }
      }
    } catch (error) {
      logger.error('analytics-handler', 'Failed to handle metric change', error as Error);
    }
  }

  /**
   * Handle live dashboard data update
   */
  async onDashboardUpdate(
    context: TenantContext,
    dashboardData: Record<string, any>,
  ): Promise<void> {
    try {
      logger.debug('analytics-handler', 'Dashboard update', {
        dataKeys: Object.keys(dashboardData),
      });

      // Broadcast dashboard data
      this.broadcaster.broadcastAnalyticsUpdate(context.teamId, dashboardData);
    } catch (error) {
      logger.error('analytics-handler', 'Failed to handle dashboard update', error as Error);
    }
  }

  /**
   * Handle threshold breach alert
   */
  async onThresholdBreach(
    context: TenantContext,
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical',
  ): Promise<void> {
    try {
      logger.warn('analytics-handler', 'Threshold breach detected', {
        metric,
        value,
        threshold,
        severity,
      });

      const type = severity === 'critical' ? NotificationType.ERROR : NotificationType.WARNING;
      const priority =
        severity === 'critical' ? NotificationPriority.CRITICAL : NotificationPriority.HIGH;

      // Create alert notification
      await this.notificationSystem.create(context, {
        teamId: context.teamId,
        type,
        priority,
        title: 'Metric Threshold Breached',
        message: `${this.formatMetricName(metric)} has ${value > threshold ? 'exceeded' : 'fallen below'} threshold: ${value} (threshold: ${threshold})`,
        data: {
          metric,
          value,
          threshold,
          severity,
        },
        actionUrl: '/whatsapp/analytics',
        actionLabel: 'View Analytics',
      });

      // Broadcast alert
      this.broadcaster.broadcastAlert(
        context.teamId,
        'Threshold Breach',
        `${this.formatMetricName(metric)}: ${value}`,
        { metric, value, threshold },
      );
    } catch (error) {
      logger.error('analytics-handler', 'Failed to handle threshold breach', error as Error);
    }
  }

  /**
   * Check metric thresholds
   */
  private async checkThresholds(context: TenantContext, metrics: WhatsAppMetrics): Promise<void> {
    for (const threshold of this.thresholds) {
      const value = this.getMetricValue(metrics, threshold.metric);
      if (value === undefined) continue;

      const breached =
        threshold.comparison === 'above'
          ? value > threshold.threshold
          : value < threshold.threshold;

      if (breached) {
        await this.onThresholdBreach(
          context,
          threshold.metric,
          value,
          threshold.threshold,
          threshold.priority === NotificationPriority.CRITICAL ? 'critical' : 'warning',
        );
      }
    }
  }

  /**
   * Get metric value from metrics object
   */
  private getMetricValue(metrics: WhatsAppMetrics, metricName: string): number | undefined {
    const metricMap: Record<string, keyof WhatsAppMetrics> = {
      total_messages: 'totalMessages',
      sent_messages: 'sentMessages',
      received_messages: 'receivedMessages',
      active_conversations: 'activeConversations',
      response_time: 'avgResponseTime',
      resolution_rate: 'resolutionRate',
    };

    const key = metricMap[metricName];
    return key ? (metrics[key] as number) : undefined;
  }

  /**
   * Notify about significant metric change
   */
  private async notifySignificantChange(
    context: TenantContext,
    metric: string,
    newValue: number,
    oldValue: number,
    changePercent: number,
  ): Promise<void> {
    const isIncrease = newValue > oldValue;
    const type = isIncrease ? NotificationType.INFO : NotificationType.WARNING;

    await this.notificationSystem.create(context, {
      teamId: context.teamId,
      type,
      priority: NotificationPriority.MEDIUM,
      title: 'Significant Metric Change',
      message: `${this.formatMetricName(metric)} ${isIncrease ? 'increased' : 'decreased'} by ${Math.abs(changePercent).toFixed(1)}%`,
      data: {
        metric,
        newValue,
        oldValue,
        changePercent,
      },
      actionUrl: '/whatsapp/analytics',
      actionLabel: 'View Details',
    });
  }

  /**
   * Format metric name for display
   */
  private formatMetricName(metric: string): string {
    return metric
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Add custom threshold
   */
  addThreshold(threshold: MetricThreshold): void {
    this.thresholds.push(threshold);
    logger.info('analytics-handler', 'Threshold added', {
      metric: threshold.metric,
      threshold: threshold.threshold,
    });
  }

  /**
   * Remove threshold
   */
  removeThreshold(metric: string): void {
    this.thresholds = this.thresholds.filter(t => t.metric !== metric);
    logger.info('analytics-handler', 'Threshold removed', { metric });
  }
}

// Export singleton instance
export const analyticsEventHandler = new AnalyticsEventHandler();
