/**
 * Demo Data Configuration for Cross-Channel Analytics
 *
 * This module provides demo account configuration and sample journey data
 * for showcasing unified website, email, and WhatsApp tracking bound together
 * for the same account.
 *
 * Architecture Understanding:
 * - Website: session, website_event tables with user_id
 * - Email: Events via Umami API with user_id, campaign_id
 * - WhatsApp: whatsapp_message, whatsapp_event, whatsapp_conversation tables
 * - Binding: whatsapp_user_identity_correlation table links wa_phone ↔ umami_user_id
 */

// =============================================================================
// Demo Account Configuration
// =============================================================================

/**
 * Demo Account - The demo team/tenant and user identity configuration
 * Environment variables allow customization without code changes
 */
export const DEMO_ACCOUNT = {
  // The demo team/tenant
  teamId: process.env.DEMO_TEAM_ID || 'demo-team-001',
  teamName: process.env.DEMO_TEAM_NAME || 'Demo Company',

  // The demo website being tracked
  websiteId: process.env.DEMO_WEBSITE_ID || 'demo-website-001',
  websiteName: process.env.DEMO_WEBSITE_NAME || 'Demo E-commerce Store',
  websiteDomain: process.env.DEMO_WEBSITE_DOMAIN || 'demo.first8marketing.com',

  // Demo user identity (correlated across channels)
  user: {
    id: 'demo-user-001',
    email: 'john.demo@example.com',
    phone: '+60123456789', // WhatsApp number (Malaysian format)
    name: 'John Demo',
    firstName: 'John',
    lastName: 'Demo',
  },

  // Correlation ID linking all channels via whatsapp_user_identity_correlation table
  correlationId: 'demo-correlation-001',
} as const;

// =============================================================================
// Demo Journey Types
// =============================================================================

export interface WebsiteEvent {
  event: string;
  page?: string;
  product?: string;
  timestamp: string;
}

export interface EmailEvent {
  event: string;
  campaign?: string;
  link?: string;
  timestamp: string;
}

export interface WhatsAppEvent {
  event: string;
  text?: string;
  timestamp: string;
}

export interface ConversionEvent {
  event: string;
  product: string;
  amount: number;
  currency: string;
  channel: string;
  timestamp: string;
}

// =============================================================================
// Sample User Journey Events (for display purposes)
// =============================================================================

/**
 * Demo Journey - A realistic multi-day customer journey across all channels
 * Demonstrates the correlation engine binding website, email, and WhatsApp interactions
 */
export const DEMO_JOURNEY = {
  // Day 1: Website Visit - Initial discovery and cart abandonment
  websiteEvents: [
    {
      event: 'pageview',
      page: '/products',
      timestamp: '2024-01-15T10:00:00Z',
    },
    {
      event: 'pageview',
      page: '/products/shoes',
      timestamp: '2024-01-15T10:05:00Z',
    },
    {
      event: 'add_to_cart',
      product: 'Running Shoes',
      timestamp: '2024-01-15T10:10:00Z',
    },
    {
      event: 'cart_abandon',
      timestamp: '2024-01-15T10:15:00Z',
    },
  ] as WebsiteEvent[],

  // Day 2: Email Campaign - Automated cart recovery sequence
  emailEvents: [
    {
      event: 'email_sent',
      campaign: 'Cart Abandon Reminder',
      timestamp: '2024-01-16T09:00:00Z',
    },
    {
      event: 'email_open',
      timestamp: '2024-01-16T10:30:00Z',
    },
    {
      event: 'email_click',
      link: '/cart',
      timestamp: '2024-01-16T10:32:00Z',
    },
  ] as EmailEvent[],

  // Day 2-3: WhatsApp Conversation - Sales conversation leading to conversion
  whatsappEvents: [
    {
      event: 'message_received',
      text: 'Hi, I saw your running shoes on sale?',
      timestamp: '2024-01-16T14:00:00Z',
    },
    {
      event: 'message_sent',
      text: 'Yes! We have a 20% discount this week. Would you like me to reserve a pair?',
      timestamp: '2024-01-16T14:02:00Z',
    },
    {
      event: 'message_received',
      text: 'Yes please! Size 42',
      timestamp: '2024-01-16T14:05:00Z',
    },
    {
      event: 'message_sent',
      text: 'Done! Checkout link: demo.first8marketing.com/checkout/abc123',
      timestamp: '2024-01-16T14:07:00Z',
    },
    {
      event: 'message_read',
      timestamp: '2024-01-16T14:08:00Z',
    },
  ] as WhatsAppEvent[],

  // Day 3: Conversion - Final purchase with WhatsApp attribution
  conversion: {
    event: 'purchase',
    product: 'Running Shoes',
    amount: 89.99,
    currency: 'USD',
    channel: 'WhatsApp', // Last-touch attribution
    timestamp: '2024-01-17T11:00:00Z',
  } as ConversionEvent,
} as const;

// =============================================================================
// Demo Analytics Types
// =============================================================================

export interface PageMetric {
  page: string;
  views: number;
}

export interface CampaignMetric {
  name: string;
  sent: number;
  opened: number;
}

export interface IntentMetric {
  intent: string;
  count: number;
}

export interface JourneyMetric {
  path: string;
  count: number;
  revenue: number;
}

// =============================================================================
// Demo Analytics Summary (pre-calculated for display)
// =============================================================================

/**
 * Demo Analytics - Pre-calculated metrics for the demo dashboard
 * These values represent realistic analytics data for demonstration purposes
 */
export const DEMO_ANALYTICS = {
  // Website Analytics - Core Umami metrics
  website: {
    sessions: 1247,
    pageviews: 4823,
    avgDuration: '3:42',
    bounceRate: '34%',
    topPages: [
      { page: '/products', views: 892 },
      { page: '/products/shoes', views: 567 },
      { page: '/checkout', views: 234 },
    ] as PageMetric[],
  },

  // Email Analytics - Campaign performance metrics
  email: {
    sent: 5420,
    delivered: 5312,
    opened: 2134,
    clicked: 876,
    openRate: '40.2%',
    clickRate: '16.5%',
    campaigns: [
      { name: 'Weekly Newsletter', sent: 2500, opened: 1100 },
      { name: 'Cart Abandon', sent: 420, opened: 234 },
      { name: 'Product Launch', sent: 2500, opened: 800 },
    ] as CampaignMetric[],
  },

  // WhatsApp Analytics - Conversation metrics
  whatsapp: {
    conversations: 156,
    messages: {
      sent: 423,
      received: 389,
      read: 401,
    },
    responseRate: '94%',
    avgResponseTime: '2.3 min',
    conversionRate: '23%',
    topIntents: [
      { intent: 'Product Inquiry', count: 67 },
      { intent: 'Order Status', count: 45 },
      { intent: 'Support Request', count: 34 },
    ] as IntentMetric[],
  },

  // Cross-Channel Analytics - Unified view across all channels
  crossChannel: {
    totalUsers: 3240,
    identifiedAcrossChannels: 1876,
    conversionsByChannel: {
      website: 45,
      email: 32,
      whatsapp: 89,
    },
    attributionModel: 'last-touch' as const,
    topJourneys: [
      { path: 'Website → Email → Purchase', count: 156, revenue: 14532 },
      { path: 'Website → WhatsApp → Purchase', count: 89, revenue: 8234 },
      { path: 'Email → Website → Purchase', count: 67, revenue: 5678 },
    ] as JourneyMetric[],
  },
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get complete demo configuration object
 * Used by demo pages to access all demo data in a single call
 */
export function getDemoConfig() {
  return {
    account: DEMO_ACCOUNT,
    journey: DEMO_JOURNEY,
    analytics: DEMO_ANALYTICS,
    isEnabled: process.env.DEMO_MODE === 'true',
  };
}

/**
 * Check if demo data should be used
 */
export function shouldUseDemoData(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/**
 * Get demo website ID for API calls
 */
export function getDemoWebsiteId(): string {
  return DEMO_ACCOUNT.websiteId;
}

/**
 * Get demo team ID for tenant-scoped operations
 */
export function getDemoTeamId(): string {
  return DEMO_ACCOUNT.teamId;
}

/**
 * Get demo user identity for correlation display
 */
export function getDemoUser() {
  return DEMO_ACCOUNT.user;
}

/**
 * Get demo correlation ID for cross-channel binding
 */
export function getDemoCorrelationId(): string {
  return DEMO_ACCOUNT.correlationId;
}

/**
 * Calculate journey timeline from demo events
 * Returns events sorted by timestamp with channel attribution
 */
export function getDemoJourneyTimeline() {
  const events: Array<{
    channel: 'website' | 'email' | 'whatsapp';
    event: string;
    detail?: string;
    timestamp: string;
  }> = [];

  // Add website events
  DEMO_JOURNEY.websiteEvents.forEach(e => {
    events.push({
      channel: 'website',
      event: e.event,
      detail: e.page || e.product,
      timestamp: e.timestamp,
    });
  });

  // Add email events
  DEMO_JOURNEY.emailEvents.forEach(e => {
    events.push({
      channel: 'email',
      event: e.event,
      detail: e.campaign || e.link,
      timestamp: e.timestamp,
    });
  });

  // Add WhatsApp events
  DEMO_JOURNEY.whatsappEvents.forEach(e => {
    events.push({
      channel: 'whatsapp',
      event: e.event,
      detail: e.text?.substring(0, 50),
      timestamp: e.timestamp,
    });
  });

  // Add conversion
  events.push({
    channel: DEMO_JOURNEY.conversion.channel.toLowerCase() as 'whatsapp',
    event: DEMO_JOURNEY.conversion.event,
    detail: `${DEMO_JOURNEY.conversion.product} - $${DEMO_JOURNEY.conversion.amount}`,
    timestamp: DEMO_JOURNEY.conversion.timestamp,
  });

  // Sort by timestamp
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// =============================================================================
// Type Exports
// =============================================================================

export type DemoAccount = typeof DEMO_ACCOUNT;
export type DemoJourney = typeof DEMO_JOURNEY;
export type DemoAnalytics = typeof DEMO_ANALYTICS;
export type DemoConfig = ReturnType<typeof getDemoConfig>;
