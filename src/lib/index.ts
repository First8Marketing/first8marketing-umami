/**
 * Library Exports Index
 *
 * Centralized exports for commonly used library modules.
 * Allows for cleaner imports across the application.
 */

// =============================================================================
// Demo Data Exports
// =============================================================================

/**
 * Demo data exports for cross-channel analytics demonstration
 * Used by demo mode components to display unified analytics data
 */
export {
  // Constants
  DEMO_ACCOUNT,
  DEMO_JOURNEY,
  DEMO_ANALYTICS,
  // Functions
  getDemoConfig,
  shouldUseDemoData,
  getDemoJourneyTimeline,
  getDemoWebsiteId,
  getDemoTeamId,
  getDemoUser,
  getDemoCorrelationId,
  // Types
  type DemoAccount,
  type DemoJourney,
  type DemoAnalytics,
  type DemoConfig,
  type WebsiteEvent,
  type EmailEvent,
  type WhatsAppEvent,
  type ConversionEvent,
  type PageMetric,
  type CampaignMetric,
  type IntentMetric,
  type JourneyMetric,
} from './demo-data';
