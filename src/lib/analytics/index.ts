/**
 * WhatsApp Analytics Integration - Analytics Module Exports
 *
 * Central export point for all analytics capabilities including metrics,
 * funnels, conversions, cohorts, reports, and real-time analytics.
 */

// Metrics Calculator
export {
  MetricsCalculator,
  createMetricsCalculator,
  type MetricsDateRange,
  type ResponseTimeMetrics,
  type VolumeMetrics,
  type ConversationMetrics,
  type EngagementMetrics,
  type AgentPerformanceMetrics,
} from './metrics-calculator';

// Funnel Analyzer
export {
  FunnelAnalyzer,
  createFunnelAnalyzer,
  type FunnelStage,
  type FunnelConfig,
  type FunnelStageMetrics,
  type FunnelAnalysis,
  type FunnelComparison,
} from './funnel-analyzer';

// Conversion Tracker
export {
  ConversionTracker,
  createConversionTracker,
  type ConversionType,
  type ConversionChannel,
  type AttributionModel,
  type Touchpoint,
  type Conversion,
  type ConversionMetrics,
  type ConversionPathAnalysis,
} from './conversion-tracker';

// Cohort Analyzer
export {
  CohortAnalyzer,
  createCohortAnalyzer,
  type CohortPeriod,
  type CohortType,
  type CohortDefinition,
  type Cohort,
  type RetentionDataPoint,
  type CohortMetrics,
  type CohortComparison,
} from './cohort-analyzer';

// Report Generator
export {
  ReportGenerator,
  createReportGenerator,
  type ReportType,
  type ExportFormat,
  type ChartType,
  type ChartData,
  type TableData,
  type ReportMetadata,
  type AnalyticsReport,
} from './report-generator';

// Real-Time Analytics
export {
  RealTimeAnalytics,
  createRealTimeAnalytics,
  type RealTimeMetricType,
  type RealTimeEvent,
  type LiveMetricSnapshot,
  type ActiveConversation,
  type FunnelDistribution,
  type AgentStatus,
} from './realtime-analytics';

// Default exports (singleton instances)
import metricsCalculator from './metrics-calculator';
import funnelAnalyzer from './funnel-analyzer';
import conversionTracker from './conversion-tracker';
import cohortAnalyzer from './cohort-analyzer';
import reportGenerator from './report-generator';
import realTimeAnalytics from './realtime-analytics';

export default {
  metricsCalculator,
  funnelAnalyzer,
  conversionTracker,
  cohortAnalyzer,
  reportGenerator,
  realTimeAnalytics,
};

/**
 * Analytics Suite - Unified interface for all analytics operations
 */
export class AnalyticsSuite {
  public readonly metrics = metricsCalculator;
  public readonly funnels = funnelAnalyzer;
  public readonly conversions = conversionTracker;
  public readonly cohorts = cohortAnalyzer;
  public readonly reports = reportGenerator;
  public readonly realtime = realTimeAnalytics;

  /**
   * Configure cache settings for all modules
   */
  configureCaching(enabled: boolean, ttl?: number): void {
    this.metrics.setCacheConfig(enabled, ttl);
    this.funnels.setCacheConfig(enabled, ttl);
    this.conversions.setCacheConfig(enabled, ttl);
    this.cohorts.setCacheConfig(enabled, ttl);
  }
}

/**
 * Create analytics suite instance
 */
export function createAnalyticsSuite(): AnalyticsSuite {
  return new AnalyticsSuite();
}
