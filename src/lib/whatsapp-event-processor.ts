/// <reference types="node" />
/**
 * WhatsApp Analytics Integration - Event Processor
 *
 * Processes and records WhatsApp client events for analytics and auditing.
 * Handles event batching, storage, and real-time broadcasting.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeWithContext } from '@/lib/whatsapp-db';
import { queue, pubsub } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import { InternalError } from '@/lib/whatsapp-errors';
import type { WhatsAppEvent, WhatsAppEventType, TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Event data interface
 */
export interface EventData {
  sessionId: string;
  eventType: WhatsAppEventType;
  eventData: Record<string, any>;
  timestamp?: Date;
}

/**
 * Event Processor for tracking WhatsApp events
 */
export class EventProcessor {
  private static processingInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;
  private config = getWhatsAppConfig();

  /**
   * Record a single event
   */
  static async recordEvent(
    context: TenantContext,
    sessionId: string,
    eventType: WhatsAppEventType,
    eventData: Record<string, any>,
  ): Promise<WhatsAppEvent> {
    try {
      const eventId = uuidv4();
      const timestamp = new Date();

      const query = `
        INSERT INTO whatsapp_event (
          event_id,
          team_id,
          session_id,
          event_type,
          event_data,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [eventId, context.teamId, sessionId, eventType, eventData, timestamp];

      const result = await executeWithContext<WhatsAppEvent>(context, query, values);
      const event = result.rows[0];

      logger.debug('event-processor', 'Event recorded', {
        eventId,
        eventType,
        sessionId,
      });

      // Emit event to WebSocket subscribers
      await this.emitEvent(context.teamId, sessionId, eventType, eventData);

      return event;
    } catch (error) {
      logger.error('event-processor', 'Failed to record event', error as Error);
      throw new InternalError('Failed to record event');
    }
  }

  /**
   * Queue event for batch processing
   */
  static async queueEvent(context: TenantContext, eventData: EventData): Promise<void> {
    try {
      const queueData = {
        context,
        event: eventData,
      };

      await queue.push('whatsapp:events', queueData);

      logger.debug('event-processor', 'Event queued', {
        eventType: eventData.eventType,
        sessionId: eventData.sessionId,
      });
    } catch (error) {
      logger.error('event-processor', 'Failed to queue event', error as Error);
      // Fall back to direct recording
      await this.recordEvent(
        context,
        eventData.sessionId,
        eventData.eventType,
        eventData.eventData,
      );
    }
  }

  /**
   * Process event batch from queue
   */
  static async processBatch(): Promise<number> {
    if (this.isProcessing) {
      logger.debug('event-processor', 'Batch processing already in progress');
      return 0;
    }

    this.isProcessing = true;
    let processed = 0;

    try {
      const config = getWhatsAppConfig();
      const batchSize = config.eventBatchSize;

      const events: { context: TenantContext; event: EventData }[] = [];

      // Dequeue events up to batch size
      for (let i = 0; i < batchSize; i++) {
        const item = await queue.pop('whatsapp:events', 0);
        if (!item) break;
        events.push(item);
      }

      if (events.length === 0) {
        return 0;
      }

      logger.debug('event-processor', 'Processing event batch', {
        count: events.length,
      });

      // Process each event
      for (const { context, event } of events) {
        try {
          await this.recordEvent(context, event.sessionId, event.eventType, event.eventData);
          processed++;
        } catch (error) {
          logger.error('event-processor', 'Failed to process event in batch', error as Error);
        }
      }

      logger.info('event-processor', 'Batch processed', {
        total: events.length,
        processed,
        failed: events.length - processed,
      });

      return processed;
    } catch (error) {
      logger.error('event-processor', 'Batch processing failed', error as Error);
      return processed;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic batch processing
   */
  static startBatchProcessing(): void {
    if (this.processingInterval) {
      logger.warn('event-processor', 'Batch processing already started');
      return;
    }

    const config = getWhatsAppConfig();
    const interval = config.eventProcessInterval;

    this.processingInterval = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('event-processor', 'Batch processing error', error as Error);
      }
    }, interval);

    logger.info('event-processor', 'Batch processing started', { interval });
  }

  /**
   * Stop automatic batch processing
   */
  static stopBatchProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('event-processor', 'Batch processing stopped');
    }
  }

  /**
   * Emit event to WebSocket subscribers
   */
  static async emitEvent(
    teamId: string,
    sessionId: string,
    eventType: WhatsAppEventType,
    eventData: Record<string, any>,
  ): Promise<void> {
    try {
      const channel = `team:${teamId}`;
      const message = {
        type: 'whatsapp_event',
        sessionId,
        eventType,
        data: eventData,
        timestamp: new Date().toISOString(),
      };

      await pubsub.publish(channel, message);

      logger.debug('event-processor', 'Event emitted', {
        channel,
        eventType,
      });
    } catch (error) {
      logger.error('event-processor', 'Failed to emit event', error as Error);
    }
  }

  /**
   * Get events for a session
   */
  static async getSessionEvents(
    context: TenantContext,
    sessionId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<WhatsAppEvent[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_event
        WHERE session_id = $1
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await executeWithContext<WhatsAppEvent>(context, query, [
        sessionId,
        limit,
        offset,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('event-processor', 'Failed to get session events', error as Error);
      return [];
    }
  }

  /**
   * Get events by type
   */
  static async getEventsByType(
    context: TenantContext,
    eventType: WhatsAppEventType,
    limit: number = 100,
  ): Promise<WhatsAppEvent[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_event
        WHERE team_id = $1 AND event_type = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `;

      const result = await executeWithContext<WhatsAppEvent>(context, query, [
        context.teamId,
        eventType,
        limit,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('event-processor', 'Failed to get events by type', error as Error);
      return [];
    }
  }

  /**
   * Get event statistics
   */
  static async getEventStats(
    context: TenantContext,
    sessionId?: string,
  ): Promise<Record<string, number>> {
    try {
      let query = `
        SELECT event_type, COUNT(*) as count
        FROM whatsapp_event
        WHERE team_id = $1
      `;

      const params: any[] = [context.teamId];

      if (sessionId) {
        query += ` AND session_id = $2`;
        params.push(sessionId);
      }

      query += ` GROUP BY event_type`;

      const result = await executeWithContext<{ event_type: string; count: string }>(
        context,
        query,
        params,
      );

      const stats: Record<string, number> = {};
      for (const row of result.rows) {
        stats[row.event_type] = parseInt(row.count, 10);
      }

      return stats;
    } catch (error) {
      logger.error('event-processor', 'Failed to get event stats', error as Error);
      return {};
    }
  }

  /**
   * Mark events as processed
   */
  static async markAsProcessed(context: TenantContext, eventIds: string[]): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_event
        SET processed = true, processed_at = NOW()
        WHERE event_id = ANY($1)
      `;

      await executeWithContext(context, query, [eventIds]);

      logger.debug('event-processor', 'Events marked as processed', {
        count: eventIds.length,
      });
    } catch (error) {
      logger.error('event-processor', 'Failed to mark events as processed', error as Error);
    }
  }

  /**
   * Mark events as sent to analytics
   */
  static async markAsSentToAnalytics(context: TenantContext, eventIds: string[]): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_event
        SET sent_to_analytics = true
        WHERE event_id = ANY($1)
      `;

      await executeWithContext(context, query, [eventIds]);

      logger.debug('event-processor', 'Events marked as sent to analytics', {
        count: eventIds.length,
      });
    } catch (error) {
      logger.error('event-processor', 'Failed to mark events as sent', error as Error);
    }
  }

  /**
   * Get unprocessed events
   */
  static async getUnprocessedEvents(
    context: TenantContext,
    limit: number = 100,
  ): Promise<WhatsAppEvent[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_event
        WHERE team_id = $1 AND processed = false
        ORDER BY timestamp ASC
        LIMIT $2
      `;

      const result = await executeWithContext<WhatsAppEvent>(context, query, [
        context.teamId,
        limit,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('event-processor', 'Failed to get unprocessed events', error as Error);
      return [];
    }
  }

  /**
   * Clean up old events
   */
  static async cleanupOldEvents(context: TenantContext, daysToKeep: number = 180): Promise<number> {
    try {
      const query = `
        DELETE FROM whatsapp_event
        WHERE team_id = $1
        AND timestamp < NOW() - INTERVAL '${daysToKeep} days'
        AND processed = true
      `;

      const result = await executeWithContext(context, query, [context.teamId]);

      logger.info('event-processor', 'Old events cleaned up', {
        deleted: result.rowCount,
        daysToKeep,
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('event-processor', 'Failed to cleanup old events', error as Error);
      return 0;
    }
  }
}

// Export convenience functions
export const recordEvent = EventProcessor.recordEvent.bind(EventProcessor);
export const queueEvent = EventProcessor.queueEvent.bind(EventProcessor);
export const processBatch = EventProcessor.processBatch.bind(EventProcessor);
export const startBatchProcessing = EventProcessor.startBatchProcessing.bind(EventProcessor);
export const stopBatchProcessing = EventProcessor.stopBatchProcessing.bind(EventProcessor);
export const getSessionEvents = EventProcessor.getSessionEvents.bind(EventProcessor);
export const getEventStats = EventProcessor.getEventStats.bind(EventProcessor);

export default EventProcessor;
