/**
 * WhatsApp Analytics Integration - Report Generator
 *
 * Comprehensive reporting service that aggregates data from all analytics
 * modules and generates reports in multiple formats (JSON, CSV).
 */

import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import { cache } from '@/lib/whatsapp-redis';
import { createMetricsCalculator } from './metrics-calculator';
import { createFunnelAnalyzer } from './funnel-analyzer';
import { createConversionTracker } from './conversion-tracker';
import { createCohortAnalyzer } from './cohort-analyzer';
import type { TenantContext } from '@/types/whatsapp';
import type { MetricsDateRange } from './metrics-calculator';

const logger = getLogger();

/**
 * Report types
 */
export type ReportType =
  | 'summary'
  | 'detailed'
  | 'performance'
  | 'funnel'
  | 'conversion'
  | 'cohort'
  | 'custom';

/**
 * Export formats
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Chart data types
 */
export type ChartType = 'line' | 'bar' | 'pie' | 'funnel' | 'sankey' | 'heatmap';

/**
 * Chart configuration
 */
export interface ChartData {
  type: ChartType;
  title: string;
  data: any[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  colors?: string[];
}

/**
 * Table configuration
 */
export interface TableData {
  title: string;
  columns: string[];
  rows: any[][];
  footer?: string[];
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  generatedAt: Date;
  generatedBy?: string;
  filters: Record<string, any>;
  version: string;
  teamId: string;
}

/**
 * Analytics report
 */
export interface AnalyticsReport {
  reportId: string;
  teamId: string;
  reportType: ReportType;
  dateRange: { start: Date; end: Date };
  data: {
    summary: Record<string, any>;
    metrics: Record<string, number>;
    charts: ChartData[];
    tables: TableData[];
  };
  metadata: ReportMetadata;
}

/**
 * Report Generator
 */
export class ReportGenerator {
  private metricsCalculator = createMetricsCalculator();
  private funnelAnalyzer = createFunnelAnalyzer();
  private conversionTracker = createConversionTracker();
  private cohortAnalyzer = createCohortAnalyzer();

  /**
   * Generate summary report
   */
  async generateSummaryReport(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<AnalyticsReport> {
    try {
      logger.info('report', 'Generating summary report', {
        teamId: context.teamId,
        range,
      });

      // Gather all metrics
      const [volumeMetrics, conversationMetrics, responseTimeMetrics, engagementMetrics] =
        await Promise.all([
          this.metricsCalculator.calculateVolumeMetrics(context, range),
          this.metricsCalculator.calculateConversationMetrics(context, range),
          this.metricsCalculator.calculateResponseTimeMetrics(context, range),
          this.metricsCalculator.calculateEngagementMetrics(context, range),
        ]);

      // Build summary
      const summary = {
        totalMessages: volumeMetrics.totalMessages,
        activeConversations: conversationMetrics.openConversations,
        avgResponseTime: `${Math.round(responseTimeMetrics.avgResponseTime / 60)}m`,
        dailyActiveUsers: engagementMetrics.dailyActiveUsers,
        resolutionRate: `${conversationMetrics.resolutionRate.toFixed(1)}%`,
      };

      // Build metrics map
      const metrics = {
        total_messages: volumeMetrics.totalMessages,
        inbound_messages: volumeMetrics.inboundMessages,
        outbound_messages: volumeMetrics.outboundMessages,
        open_conversations: conversationMetrics.openConversations,
        closed_conversations: conversationMetrics.closedConversations,
        avg_response_time: responseTimeMetrics.avgResponseTime,
        daily_active_users: engagementMetrics.dailyActiveUsers,
        weekly_active_users: engagementMetrics.weeklyActiveUsers,
        resolution_rate: conversationMetrics.resolutionRate,
      };

      // Build charts
      const charts: ChartData[] = [
        {
          type: 'line',
          title: 'Messages Over Time',
          data: volumeMetrics.messagesByDay,
          xAxisLabel: 'Date',
          yAxisLabel: 'Messages',
        },
        {
          type: 'bar',
          title: 'Peak Activity Hours',
          data: volumeMetrics.peakHours,
          xAxisLabel: 'Hour',
          yAxisLabel: 'Messages',
        },
        {
          type: 'pie',
          title: 'Conversation Status Distribution',
          data: [
            { label: 'Open', value: conversationMetrics.openConversations },
            { label: 'Closed', value: conversationMetrics.closedConversations },
            { label: 'Archived', value: conversationMetrics.archivedConversations },
          ],
        },
      ];

      // Build tables
      const tables: TableData[] = [
        {
          title: 'Key Performance Indicators',
          columns: ['Metric', 'Value'],
          rows: [
            ['Total Messages', volumeMetrics.totalMessages.toString()],
            ['Active Conversations', conversationMetrics.openConversations.toString()],
            ['Avg Response Time', `${Math.round(responseTimeMetrics.avgResponseTime / 60)} min`],
            ['Resolution Rate', `${conversationMetrics.resolutionRate.toFixed(1)}%`],
            ['Daily Active Users', engagementMetrics.dailyActiveUsers.toString()],
          ],
        },
      ];

      return {
        reportId: this.generateReportId(),
        teamId: context.teamId,
        reportType: 'summary',
        dateRange: { start: range.startDate, end: range.endDate },
        data: { summary, metrics, charts, tables },
        metadata: this.createMetadata(context, range),
      };
    } catch (error) {
      logger.error('report', 'Failed to generate summary report', error as Error);
      throw new DatabaseError('Failed to generate summary report');
    }
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<AnalyticsReport> {
    try {
      logger.info('report', 'Generating performance report', { teamId: context.teamId });

      const [responseTimeMetrics, agentMetrics] = await Promise.all([
        this.metricsCalculator.calculateResponseTimeMetrics(context, range),
        this.metricsCalculator.calculateAgentPerformanceMetrics(context, range),
      ]);

      const summary = {
        avgFirstResponseTime: `${Math.round(responseTimeMetrics.avgFirstResponseTime / 60)}m`,
        avgResponseTime: `${Math.round(responseTimeMetrics.avgResponseTime / 60)}m`,
        medianResponseTime: `${Math.round(responseTimeMetrics.medianResponseTime / 60)}m`,
        p95ResponseTime: `${Math.round(responseTimeMetrics.p95ResponseTime / 60)}m`,
        totalAgents: agentMetrics.length,
      };

      const charts: ChartData[] = [
        {
          type: 'line',
          title: 'Response Time by Hour of Day',
          data: responseTimeMetrics.byTimeOfDay.map(d => ({
            hour: d.hour,
            responseTime: Math.round(d.avgResponseTime / 60),
          })),
          xAxisLabel: 'Hour',
          yAxisLabel: 'Response Time (minutes)',
        },
        {
          type: 'bar',
          title: 'Agent Performance',
          data: agentMetrics.map(a => ({
            agent: a.agentId,
            messages: a.messagesHandled,
            responseTime: Math.round(a.avgResponseTime / 60),
          })),
        },
      ];

      const tables: TableData[] = [
        {
          title: 'Agent Performance Metrics',
          columns: ['Agent ID', 'Messages Handled', 'Avg Response Time', 'Conversations Resolved'],
          rows: agentMetrics.map(a => [
            a.agentId,
            a.messagesHandled.toString(),
            `${Math.round(a.avgResponseTime / 60)} min`,
            a.conversationsResolved.toString(),
          ]),
        },
      ];

      return {
        reportId: this.generateReportId(),
        teamId: context.teamId,
        reportType: 'performance',
        dateRange: { start: range.startDate, end: range.endDate },
        data: {
          summary,
          metrics: {
            avg_first_response: responseTimeMetrics.avgFirstResponseTime,
            avg_response: responseTimeMetrics.avgResponseTime,
            median_response: responseTimeMetrics.medianResponseTime,
            p95_response: responseTimeMetrics.p95ResponseTime,
          },
          charts,
          tables,
        },
        metadata: this.createMetadata(context, range),
      };
    } catch (error) {
      logger.error('report', 'Failed to generate performance report', error as Error);
      throw new DatabaseError('Failed to generate performance report');
    }
  }

  /**
   * Generate funnel report
   */
  async generateFunnelReport(
    context: TenantContext,
    range: MetricsDateRange,
  ): Promise<AnalyticsReport> {
    try {
      logger.info('report', 'Generating funnel report', { teamId: context.teamId });

      const funnelAnalysis = await this.funnelAnalyzer.analyzeFunnel(
        context,
        range.startDate,
        range.endDate,
      );

      const summary = {
        totalEntries: funnelAnalysis.totalEntries,
        totalCompletions: funnelAnalysis.totalCompletions,
        conversionRate: `${funnelAnalysis.overallConversionRate.toFixed(1)}%`,
        avgFunnelTime: `${Math.round(funnelAnalysis.funnelVelocity / 3600)}h`,
        dropOffPoints: funnelAnalysis.dropOffPoints.length,
      };

      const charts: ChartData[] = [
        {
          type: 'funnel',
          title: 'Conversion Funnel',
          data: funnelAnalysis.stages.map(s => ({
            stage: s.stageName,
            count: s.conversationCount,
            rate: s.conversionRate,
          })),
        },
        {
          type: 'bar',
          title: 'Drop-off Rates by Stage',
          data: funnelAnalysis.stages.map(s => ({
            stage: s.stageName,
            dropOffRate: s.dropOffRate,
          })),
          yAxisLabel: 'Drop-off Rate (%)',
        },
      ];

      const tables: TableData[] = [
        {
          title: 'Funnel Stage Metrics',
          columns: ['Stage', 'Count', 'Conversion Rate', 'Drop-off Rate', 'Avg Time'],
          rows: funnelAnalysis.stages.map(s => [
            s.stageName,
            s.conversationCount.toString(),
            `${s.conversionRate.toFixed(1)}%`,
            `${s.dropOffRate.toFixed(1)}%`,
            `${Math.round(s.avgTimeInStage / 3600)}h`,
          ]),
        },
      ];

      return {
        reportId: this.generateReportId(),
        teamId: context.teamId,
        reportType: 'funnel',
        dateRange: { start: range.startDate, end: range.endDate },
        data: {
          summary,
          metrics: {
            total_entries: funnelAnalysis.totalEntries,
            total_completions: funnelAnalysis.totalCompletions,
            conversion_rate: funnelAnalysis.overallConversionRate,
            funnel_velocity: funnelAnalysis.funnelVelocity,
          },
          charts,
          tables,
        },
        metadata: this.createMetadata(context, range),
      };
    } catch (error) {
      logger.error('report', 'Failed to generate funnel report', error as Error);
      throw new DatabaseError('Failed to generate funnel report');
    }
  }

  /**
   * Export report to CSV
   */
  exportToCSV(report: AnalyticsReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`${report.reportType.toUpperCase()} REPORT`);
    lines.push(`Team ID: ${report.teamId}`);
    lines.push(
      `Date Range: ${report.dateRange.start.toISOString()} to ${report.dateRange.end.toISOString()}`,
    );
    lines.push(`Generated: ${report.metadata.generatedAt.toISOString()}`);
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    for (const [key, value] of Object.entries(report.data.summary)) {
      lines.push(`${key},${value}`);
    }
    lines.push('');

    // Metrics
    lines.push('METRICS');
    for (const [key, value] of Object.entries(report.data.metrics)) {
      lines.push(`${key},${value}`);
    }
    lines.push('');

    // Tables
    for (const table of report.data.tables) {
      lines.push(table.title);
      lines.push(table.columns.join(','));
      for (const row of table.rows) {
        lines.push(row.join(','));
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export report to JSON
   */
  exportToJSON(report: AnalyticsReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Schedule report generation
   */
  async scheduleReport(
    context: TenantContext,
    schedule: {
      reportType: ReportType;
      frequency: 'daily' | 'weekly' | 'monthly';
      recipients: string[];
      format: ExportFormat;
    },
  ): Promise<{ scheduleId: string }> {
    try {
      const scheduleId = this.generateReportId();

      // Store schedule in cache for now (would use job queue in production)
      await cache.set(
        `report:schedule:${context.teamId}:${scheduleId}`,
        schedule,
        86400 * 30, // 30 days
      );

      logger.info('report', 'Report scheduled', {
        scheduleId,
        teamId: context.teamId,
        frequency: schedule.frequency,
      });

      return { scheduleId };
    } catch (error) {
      logger.error('report', 'Failed to schedule report', error as Error);
      throw new DatabaseError('Failed to schedule report');
    }
  }

  /**
   * Generate custom report
   */
  async generateCustomReport(
    context: TenantContext,
    config: {
      dateRange: MetricsDateRange;
      metrics: string[];
      charts: string[];
      filters?: Record<string, any>;
    },
  ): Promise<AnalyticsReport> {
    try {
      logger.info('report', 'Generating custom report', {
        teamId: context.teamId,
        metrics: config.metrics,
      });

      const data: any = {
        summary: {},
        metrics: {},
        charts: [],
        tables: [],
      };

      // Dynamically gather requested metrics
      if (config.metrics.includes('volume')) {
        const volumeMetrics = await this.metricsCalculator.calculateVolumeMetrics(
          context,
          config.dateRange,
        );
        data.metrics.volume = volumeMetrics;
      }

      if (config.metrics.includes('response_time')) {
        const responseMetrics = await this.metricsCalculator.calculateResponseTimeMetrics(
          context,
          config.dateRange,
        );
        data.metrics.response_time = responseMetrics;
      }

      if (config.metrics.includes('engagement')) {
        const engagementMetrics = await this.metricsCalculator.calculateEngagementMetrics(
          context,
          config.dateRange,
        );
        data.metrics.engagement = engagementMetrics;
      }

      return {
        reportId: this.generateReportId(),
        teamId: context.teamId,
        reportType: 'custom',
        dateRange: {
          start: config.dateRange.startDate,
          end: config.dateRange.endDate,
        },
        data,
        metadata: {
          ...this.createMetadata(context, config.dateRange),
          filters: config.filters || {},
        },
      };
    } catch (error) {
      logger.error('report', 'Failed to generate custom report', error as Error);
      throw new DatabaseError('Failed to generate custom report');
    }
  }

  /**
   * Create report metadata
   */
  private createMetadata(context: TenantContext, range: MetricsDateRange): ReportMetadata {
    return {
      generatedAt: new Date(),
      generatedBy: context.userId,
      filters: {
        startDate: range.startDate,
        endDate: range.endDate,
        timezone: range.timezone || 'UTC',
      },
      version: '1.0.0',
      teamId: context.teamId,
    };
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let reportGeneratorInstance: ReportGenerator | null = null;

/**
 * Create report generator instance
 */
export function createReportGenerator(): ReportGenerator {
  return new ReportGenerator();
}

/**
 * Get report generator singleton instance
 */
export function getReportGenerator(): ReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = createReportGenerator();
  }
  return reportGeneratorInstance;
}

export default createReportGenerator();
