/**
 * WhatsApp Analytics Integration - Journey Mapper
 *
 * Reconstructs cross-channel user journeys by combining WhatsApp messages
 * and web analytics events into unified timelines with stage tracking.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Journey stage enum
 */
export type JourneyStage = 'awareness' | 'consideration' | 'conversion' | 'retention';

/**
 * Touchpoint channel
 */
export type TouchpointChannel = 'whatsapp' | 'web' | 'email' | 'other';

/**
 * Journey touchpoint
 */
export interface JourneyTouchpoint {
  touchpointId: string;
  timestamp: Date;
  channel: TouchpointChannel;
  type: string; // message_received, page_view, form_submit, etc.
  data: Record<string, any>;
  stage?: JourneyStage;
}

/**
 * Journey stage info
 */
export interface JourneyStageInfo {
  stage: JourneyStage;
  entryTime: Date;
  exitTime?: Date;
  duration?: number; // milliseconds
  touchpoints: number;
  channels: Set<TouchpointChannel>;
}

/**
 * Conversion event
 */
export interface ConversionEvent {
  type: string;
  timestamp: Date;
  value?: number;
  currency?: string;
  attributedTo: string[]; // Touchpoint IDs that contributed
  metadata?: Record<string, any>;
}

/**
 * Complete user journey
 */
export interface UserJourney {
  userId: string;
  teamId: string;
  waPhone?: string;
  umamiUserId?: string;
  touchpoints: JourneyTouchpoint[];
  stages: JourneyStageInfo[];
  conversionEvents: ConversionEvent[];
  metrics: {
    totalTouchpoints: number;
    totalDuration: number; // milliseconds
    channelDistribution: Record<TouchpointChannel, number>;
    firstTouchDate: Date;
    lastTouchDate: Date;
    avgTimeBetweenTouches: number; // milliseconds
  };
}

/**
 * Journey mapping options
 */
export interface JourneyMapOptions {
  dayRange?: number;
  includeAnonymous?: boolean;
  minTouchpoints?: number;
  stageClassification?: 'auto' | 'manual';
}

/**
 * Journey Mapper class
 */
export class JourneyMapper {
  private cacheKeyPrefix = 'journey_map';
  private cacheTtl = 1800; // 30 minutes

  /**
   * Build complete user journey
   */
  async buildJourney(
    context: TenantContext,
    waPhone: string,
    umamiUserId?: string,
    options: JourneyMapOptions = {},
  ): Promise<UserJourney | null> {
    const dayRange = options.dayRange || 90;

    // Check cache
    const cacheKey = `${this.cacheKeyPrefix}:${context.teamId}:${waPhone}:${umamiUserId || 'unknown'}`;
    const cached = await cache.get<UserJourney>(cacheKey);
    if (cached) {
      logger.debug('correlation', 'Journey cache hit', { waPhone, umamiUserId });
      return cached;
    }

    try {
      // Fetch WhatsApp touchpoints
      const waTouchpoints = await this.fetchWATouchpoints(context, waPhone, dayRange);

      // Fetch web touchpoints (if umami user ID provided)
      const webTouchpoints = umamiUserId
        ? await this.fetchWebTouchpoints(context, umamiUserId, dayRange)
        : [];

      // Combine and sort by timestamp
      const allTouchpoints = [...waTouchpoints, ...webTouchpoints].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );

      if (allTouchpoints.length < (options.minTouchpoints || 1)) {
        return null;
      }

      // Classify stages
      const stages =
        options.stageClassification === 'manual' ? [] : this.classifyStages(allTouchpoints);

      // Identify conversion events
      const conversionEvents = this.identifyConversions(allTouchpoints);

      // Calculate metrics
      const metrics = this.calculateMetrics(allTouchpoints);

      const journey: UserJourney = {
        userId: umamiUserId || waPhone,
        teamId: context.teamId,
        waPhone,
        umamiUserId,
        touchpoints: allTouchpoints,
        stages,
        conversionEvents,
        metrics,
      };

      // Cache journey
      await cache.set(cacheKey, journey, this.cacheTtl);

      logger.info('correlation', 'User journey built', {
        waPhone,
        umamiUserId,
        touchpoints: allTouchpoints.length,
        stages: stages.length,
        conversions: conversionEvents.length,
      });

      return journey;
    } catch (error) {
      logger.error('correlation', 'Journey building failed', error as Error, {
        waPhone,
        umamiUserId,
      });
      throw new DatabaseError('Journey building failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetch WhatsApp touchpoints
   */
  private async fetchWATouchpoints(
    context: TenantContext,
    waPhone: string,
    dayRange: number,
  ): Promise<JourneyTouchpoint[]> {
    const query = `
      SELECT 
        m.message_id,
        m.timestamp,
        m.direction,
        m.message_type,
        m.message_body,
        c.stage as conversation_stage
      FROM whatsapp_message m
      LEFT JOIN whatsapp_conversation c ON c.conversation_id = m.conversation_id
      WHERE m.team_id = $1
      AND (m.from_phone = $2 OR m.to_phone = $2)
      AND m.timestamp > NOW() - INTERVAL '${dayRange} days'
      ORDER BY m.timestamp ASC;
    `;

    const result = await executeWithContext<{
      message_id: string;
      timestamp: Date;
      direction: string;
      message_type: string;
      message_body: string;
      conversation_stage: string;
    }>(context, query, [context.teamId, waPhone]);

    return result.rows.map(row => ({
      touchpointId: `wa_${row.message_id}`,
      timestamp: row.timestamp,
      channel: 'whatsapp',
      type: `message_${row.direction}`,
      data: {
        direction: row.direction,
        messageType: row.message_type,
        messageBody: row.message_body,
        conversationStage: row.conversation_stage,
      },
      stage: this.mapConversationStageToJourney(row.conversation_stage),
    }));
  }

  /**
   * Fetch web analytics touchpoints
   */
  private async fetchWebTouchpoints(
    context: TenantContext,
    umamiUserId: string,
    dayRange: number,
  ): Promise<JourneyTouchpoint[]> {
    const query = `
      SELECT 
        e.event_id,
        e.created_at,
        e.url_path,
        e.url_query,
        e.referrer_path,
        e.event_name,
        e.visit_id
      FROM website_event e
      INNER JOIN session s ON s.session_id = e.session_id
      WHERE e.website_id IN (
        SELECT website_id 
        FROM website 
        WHERE team_id = $1
      )
      AND s.user_id = $2
      AND e.created_at > NOW() - INTERVAL '${dayRange} days'
      ORDER BY e.created_at ASC;
    `;

    const result = await executeWithContext<{
      event_id: string;
      created_at: Date;
      url_path: string;
      url_query: string;
      referrer_path: string;
      event_name: string;
      visit_id: string;
    }>(context, query, [context.teamId, umamiUserId]);

    return result.rows.map(row => ({
      touchpointId: `web_${row.event_id}`,
      timestamp: row.created_at,
      channel: 'web',
      type: row.event_name || 'page_view',
      data: {
        urlPath: row.url_path,
        urlQuery: row.url_query,
        referrerPath: row.referrer_path,
        eventName: row.event_name,
        visitId: row.visit_id,
      },
      stage: this.classifyWebEventStage(row.url_path, row.event_name),
    }));
  }

  /**
   * Map conversation stage to journey stage
   */
  private mapConversationStageToJourney(stage: string | null): JourneyStage | undefined {
    if (!stage) return undefined;

    const mapping: Record<string, JourneyStage> = {
      initial_contact: 'awareness',
      qualification: 'consideration',
      proposal: 'consideration',
      negotiation: 'conversion',
      close: 'conversion',
    };

    return mapping[stage];
  }

  /**
   * Classify web event stage from URL and event name
   */
  private classifyWebEventStage(urlPath: string, eventName?: string): JourneyStage {
    const path = urlPath.toLowerCase();
    const event = (eventName || '').toLowerCase();

    // Conversion indicators
    if (
      path.includes('/checkout') ||
      path.includes('/purchase') ||
      path.includes('/thank') ||
      path.includes('/success') ||
      event.includes('purchase') ||
      event.includes('conversion')
    ) {
      return 'conversion';
    }

    // Consideration indicators
    if (
      path.includes('/cart') ||
      path.includes('/compare') ||
      path.includes('/pricing') ||
      event.includes('add_to_cart') ||
      event.includes('view_item')
    ) {
      return 'consideration';
    }

    // Retention indicators
    if (
      path.includes('/account') ||
      path.includes('/dashboard') ||
      path.includes('/profile') ||
      event.includes('login')
    ) {
      return 'retention';
    }

    // Default: awareness
    return 'awareness';
  }

  /**
   * Classify journey stages from touchpoints
   */
  private classifyStages(touchpoints: JourneyTouchpoint[]): JourneyStageInfo[] {
    const stages: JourneyStageInfo[] = [];
    let currentStage: JourneyStage | null = null;
    let stageStart: Date | null = null;
    let stageTouchpoints = 0;
    const stageChannels = new Set<TouchpointChannel>();

    for (let i = 0; i < touchpoints.length; i++) {
      const touchpoint = touchpoints[i];
      const tpStage = touchpoint.stage || 'awareness';

      // Stage transition
      if (currentStage !== tpStage) {
        // Save previous stage
        if (currentStage && stageStart) {
          stages.push({
            stage: currentStage,
            entryTime: stageStart,
            exitTime: touchpoint.timestamp,
            duration: touchpoint.timestamp.getTime() - stageStart.getTime(),
            touchpoints: stageTouchpoints,
            channels: new Set(stageChannels),
          });
        }

        // Start new stage
        currentStage = tpStage;
        stageStart = touchpoint.timestamp;
        stageTouchpoints = 1;
        stageChannels.clear();
        stageChannels.add(touchpoint.channel);
      } else {
        stageTouchpoints++;
        stageChannels.add(touchpoint.channel);
      }
    }

    // Add final stage
    if (currentStage && stageStart) {
      stages.push({
        stage: currentStage,
        entryTime: stageStart,
        exitTime: touchpoints[touchpoints.length - 1].timestamp,
        duration: touchpoints[touchpoints.length - 1].timestamp.getTime() - stageStart.getTime(),
        touchpoints: stageTouchpoints,
        channels: new Set(stageChannels),
      });
    }

    return stages;
  }

  /**
   * Identify conversion events
   */
  private identifyConversions(touchpoints: JourneyTouchpoint[]): ConversionEvent[] {
    const conversions: ConversionEvent[] = [];

    for (const touchpoint of touchpoints) {
      const { type, data } = touchpoint;

      // WhatsApp conversion (closed deal)
      if (type === 'message_received' && data.conversationStage === 'close') {
        conversions.push({
          type: 'whatsapp_conversion',
          timestamp: touchpoint.timestamp,
          attributedTo: this.findAttributedTouchpoints(touchpoints, touchpoint.timestamp),
          metadata: data,
        });
      }

      // Web conversion
      if (
        type.includes('purchase') ||
        type.includes('conversion') ||
        data.urlPath?.includes('/success') ||
        data.urlPath?.includes('/thank')
      ) {
        conversions.push({
          type: 'web_conversion',
          timestamp: touchpoint.timestamp,
          value: data.value,
          currency: data.currency,
          attributedTo: this.findAttributedTouchpoints(touchpoints, touchpoint.timestamp),
          metadata: data,
        });
      }
    }

    return conversions;
  }

  /**
   * Find touchpoints that contributed to conversion (30-day window)
   */
  private findAttributedTouchpoints(
    touchpoints: JourneyTouchpoint[],
    conversionTime: Date,
  ): string[] {
    const attributionWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
    const conversionTimestamp = conversionTime.getTime();

    return touchpoints
      .filter(tp => {
        const diff = conversionTimestamp - tp.timestamp.getTime();
        return diff >= 0 && diff <= attributionWindow;
      })
      .map(tp => tp.touchpointId);
  }

  /**
   * Calculate journey metrics
   */
  private calculateMetrics(touchpoints: JourneyTouchpoint[]) {
    if (touchpoints.length === 0) {
      return {
        totalTouchpoints: 0,
        totalDuration: 0,
        channelDistribution: {},
        firstTouchDate: new Date(),
        lastTouchDate: new Date(),
        avgTimeBetweenTouches: 0,
      };
    }

    const channelDistribution: Record<TouchpointChannel, number> = {
      whatsapp: 0,
      web: 0,
      email: 0,
      other: 0,
    };

    for (const tp of touchpoints) {
      channelDistribution[tp.channel]++;
    }

    const firstTouch = touchpoints[0];
    const lastTouch = touchpoints[touchpoints.length - 1];
    const totalDuration = lastTouch.timestamp.getTime() - firstTouch.timestamp.getTime();

    // Calculate average time between touches
    let totalTimeDiff = 0;
    for (let i = 1; i < touchpoints.length; i++) {
      totalTimeDiff += touchpoints[i].timestamp.getTime() - touchpoints[i - 1].timestamp.getTime();
    }
    const avgTimeBetweenTouches =
      touchpoints.length > 1 ? totalTimeDiff / (touchpoints.length - 1) : 0;

    return {
      totalTouchpoints: touchpoints.length,
      totalDuration,
      channelDistribution,
      firstTouchDate: firstTouch.timestamp,
      lastTouchDate: lastTouch.timestamp,
      avgTimeBetweenTouches,
    };
  }

  /**
   * Get journey attribution model (last-touch, first-touch, linear, time-decay)
   */
  calculateAttribution(
    touchpoints: JourneyTouchpoint[],
    conversionTime: Date,
    model: 'last_touch' | 'first_touch' | 'linear' | 'time_decay' = 'time_decay',
  ): Map<string, number> {
    const attribution = new Map<string, number>();
    const relevantTouchpoints = touchpoints.filter(tp => tp.timestamp <= conversionTime);

    if (relevantTouchpoints.length === 0) {
      return attribution;
    }

    switch (model) {
      case 'last_touch': {
        attribution.set(relevantTouchpoints[relevantTouchpoints.length - 1].touchpointId, 1.0);
        break;
      }

      case 'first_touch': {
        attribution.set(relevantTouchpoints[0].touchpointId, 1.0);
        break;
      }

      case 'linear': {
        const linearCredit = 1.0 / relevantTouchpoints.length;
        relevantTouchpoints.forEach(tp => {
          attribution.set(tp.touchpointId, linearCredit);
        });
        break;
      }

      case 'time_decay': {
        // Exponential decay with half-life of 7 days
        const halfLife = 7 * 24 * 60 * 60 * 1000;
        const conversionTimestamp = conversionTime.getTime();
        let totalWeight = 0;

        // Calculate weights
        const weights = new Map<string, number>();
        relevantTouchpoints.forEach(tp => {
          const age = conversionTimestamp - tp.timestamp.getTime();
          const weight = Math.exp((-Math.log(2) * age) / halfLife);
          weights.set(tp.touchpointId, weight);
          totalWeight += weight;
        });

        // Normalize to sum to 1.0
        weights.forEach((weight, id) => {
          attribution.set(id, weight / totalWeight);
        });
        break;
      }
    }

    return attribution;
  }

  /**
   * Generate journey visualization data
   */
  generateVisualization(journey: UserJourney): {
    timeline: Array<{ x: Date; y: number; channel: TouchpointChannel }>;
    funnelData: Array<{ stage: JourneyStage; count: number; percentage: number }>;
    channelFlow: Array<{ from: TouchpointChannel; to: TouchpointChannel; count: number }>;
  } {
    // Timeline data (for line/scatter chart)
    const timeline = journey.touchpoints.map((tp, index) => ({
      x: tp.timestamp,
      y: index + 1,
      channel: tp.channel,
    }));

    // Funnel data
    const stageCounts = new Map<JourneyStage, number>();
    for (const stage of journey.stages) {
      stageCounts.set(stage.stage, (stageCounts.get(stage.stage) || 0) + 1);
    }

    const totalStages = journey.stages.length;
    const funnelData: Array<{ stage: JourneyStage; count: number; percentage: number }> = [
      'awareness',
      'consideration',
      'conversion',
      'retention',
    ].map(stage => ({
      stage: stage as JourneyStage,
      count: stageCounts.get(stage as JourneyStage) || 0,
      percentage:
        totalStages > 0 ? ((stageCounts.get(stage as JourneyStage) || 0) / totalStages) * 100 : 0,
    }));

    // Channel flow (Sankey diagram data)
    const channelFlow = new Map<string, number>();
    for (let i = 1; i < journey.touchpoints.length; i++) {
      const from = journey.touchpoints[i - 1].channel;
      const to = journey.touchpoints[i].channel;
      const key = `${from}->${to}`;
      channelFlow.set(key, (channelFlow.get(key) || 0) + 1);
    }

    const channelFlowData = Array.from(channelFlow.entries()).map(([key, count]) => {
      const [from, to] = key.split('->');
      return {
        from: from as TouchpointChannel,
        to: to as TouchpointChannel,
        count,
      };
    });

    return {
      timeline,
      funnelData,
      channelFlow: channelFlowData,
    };
  }

  /**
   * Calculate journey quality score
   */
  calculateJourneyQuality(journey: UserJourney): number {
    let score = 0;

    // Multi-channel bonus
    const channelCount = Object.values(journey.metrics.channelDistribution).filter(
      count => count > 0,
    ).length;
    score += Math.min(0.3, channelCount * 0.15);

    // Touchpoint count bonus (more touchpoints = more confidence)
    const touchpointScore = Math.min(0.3, journey.touchpoints.length * 0.03);
    score += touchpointScore;

    // Stage progression bonus
    if (journey.stages.length > 1) {
      score += 0.2;
    }

    // Conversion bonus
    if (journey.conversionEvents.length > 0) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  /**
   * Clear journey cache for team
   */
  async clearCache(context: TenantContext): Promise<void> {
    const pattern = `${this.cacheKeyPrefix}:${context.teamId}:*`;
    await cache.deletePattern(pattern);

    logger.info('correlation', 'Journey map cache cleared', {
      teamId: context.teamId,
    });
  }
}

/**
 * Create journey mapper instance
 */
export function createJourneyMapper(): JourneyMapper {
  return new JourneyMapper();
}

// Export default instance
export default createJourneyMapper();
