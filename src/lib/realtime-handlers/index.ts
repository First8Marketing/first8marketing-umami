/**
 * WhatsApp Analytics Integration - Real-Time Event Handlers Index
 *
 * Central export for all real-time event handlers
 */

export { sessionEventHandler } from './session-event-handler';
export { messageEventHandler } from './message-event-handler';
export { conversationEventHandler } from './conversation-event-handler';
export { analyticsEventHandler } from './analytics-event-handler';

// Re-export types for convenience
export type { MetricThreshold } from './analytics-event-handler';
