/**
 * WhatsApp Analytics Integration - Conversion Tracker
 *
 * Cross-channel conversion tracking with multiple attribution models.
 * Integrates with correlation engine for user journey analysis.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeWithContext, transactionWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import { createJourneyMapper } from '@/lib/correlation/journey-mapper';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Conversion event types
 */
export type ConversionType = 'purchase' | 'lead' | 'booking' | 'signup' | 'download' | 'custom';

/**
 * Channel types
 */
export type ConversionChannel = 'whatsapp' | 'web' | 'email' | 'social' | 'direct';

/**
 * Attribution models
 */
export type AttributionModel =
  | 'last_touch'
  | 'first_touch'
  | 'linear'
  | 'time_decay'
  | 'position_based';

/**
 * Touchpoint in conversion path
 */
export interface Touchpoint {
  channel: ConversionChannel;
  timestamp: Date;
  type: string;
  value?: number;
  metadata?: Record<string, any>;
}

/**
 * Conversion event
 */
export interface Conversion {
  conversionId: string;
  teamId: string;
  userId: string;
  waPhone?: string;
  type: ConversionType;
  value: number;
  currency?: string;
  timestamp: Date;
  touchpoints: Touchpoint[];
  attribution: Record<AttributionModel, Record<ConversionChannel, number>>;
  metadata?: Record<string, any>;
}

/**
 * Conversion metrics
 */
export interface ConversionMetrics {
  totalConversions: number;
  totalValue: number;
  avgConversionValue: number;
  conversionRate: number;
  avgTimeToConversion: number; // seconds
  avgTouchpoints: number;
  byChannel: Record<
    ConversionChannel,
    {
      conversions: number;
      value: number;
      rate: number;
    }
  >;
  byType: Record<
    ConversionType,
    {
      conversions: number;
      value: number;
      avgValue: number;
    }
  >;
}

/**
 * Conversion path analysis
 */
export interface ConversionPathAnalysis {
  topPaths: Array<{
    path: string[];
    count: number;
    conversionRate: number;
    avgValue: number;
  }>;
  pathLengthDistribution: Record<number, number>;
  channelSequences: Array<{
    sequence: ConversionChannel[];
    count: number;
  }>;
  assistingChannels: Record<ConversionChannel, number>;
}

/**
 * Conversion Tracker
 */
export class ConversionTracker {
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 600; // 10 minutes
  private journeyMapper = createJourneyMapper();

  /**
   * Track a conversion event
   */
  async trackConversion(
    context: TenantContext,
    conversion: Omit<Conversion, 'conversionId' | 'teamId' | 'attribution'>,
  ): Promise<Conversion> {
    try {
      logger.info('conversion', 'Tracking conversion', {
        teamId: context.teamId,
        userId: conversion.userId,
        type: conversion.type,
        value: conversion.value,
      });

      // Calculate attribution for all models
      const attribution = this.calculateAllAttributions(conversion.touchpoints);

      const conversionId = uuidv4();
      const fullConversion: Conversion = {
        conversionId,
        teamId: context.teamId,
        ...conversion,
        attribution,
      };

      // Save to database
      await this.saveConversion(context, fullConversion);

      // Invalidate cache
      await this.invalidateCache(context.teamId);

      return fullConversion;
    } catch (error) {
      logger.error('conversion', 'Failed to track conversion', error as Error);
      throw new DatabaseError('Failed to track conversion');
    }
  }

  /**
   * Calculate attribution for all models
   */
  private calculateAllAttributions(
    touchpoints: Touchpoint[],
  ): Record<AttributionModel, Record<ConversionChannel, number>> {
    return {
      last_touch: this.calculateLastTouch(touchpoints),
      first_touch: this.calculateFirstTouch(touchpoints),
      linear: this.calculateLinear(touchpoints),
      time_decay: this.calculateTimeDecay(touchpoints),
      position_based: this.calculatePositionBased(touchpoints),
    };
  }

  /**
   * Last-touch attribution (100% to last touchpoint)
   */
  private calculateLastTouch(touchpoints: Touchpoint[]): Record<ConversionChannel, number> {
    const attribution: Record<string, number> = {};
    if (touchpoints.length > 0) {
      const lastTouch = touchpoints[touchpoints.length - 1];
      attribution[lastTouch.channel] = 1.0;
    }
    return attribution as Record<ConversionChannel, number>;
  }

  /**
   * First-touch attribution (100% to first touchpoint)
   */
  private calculateFirstTouch(touchpoints: Touchpoint[]): Record<ConversionChannel, number> {
    const attribution: Record<string, number> = {};
    if (touchpoints.length > 0) {
      const firstTouch = touchpoints[0];
      attribution[firstTouch.channel] = 1.0;
    }
    return attribution as Record<ConversionChannel, number>;
  }

  /**
   * Linear attribution (equal credit to all touchpoints)
   */
  private calculateLinear(touchpoints: Touchpoint[]): Record<ConversionChannel, number> {
    const attribution: Record<string, number> = {};
    if (touchpoints.length === 0) return attribution as Record<ConversionChannel, number>;

    const credit = 1.0 / touchpoints.length;
    for (const touchpoint of touchpoints) {
      attribution[touchpoint.channel] = (attribution[touchpoint.channel] || 0) + credit;
    }
    return attribution as Record<ConversionChannel, number>;
  }

  /**
   * Time-decay attribution (recent touchpoints weighted higher)
   */
  private calculateTimeDecay(touchpoints: Touchpoint[]): Record<ConversionChannel, number> {
    const attribution: Record<string, number> = {};
    if (touchpoints.length === 0) return attribution as Record<ConversionChannel, number>;

    const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const conversionTime = touchpoints[touchpoints.length - 1].timestamp.getTime();

    let totalWeight = 0;
    const weights: number[] = [];

    // Calculate weights using exponential decay
    for (const touchpoint of touchpoints) {
      const timeDiff = conversionTime - touchpoint.timestamp.getTime();
      const weight = Math.exp((-Math.log(2) * timeDiff) / halfLife);
      weights.push(weight);
      totalWeight += weight;
    }

    // Normalize weights and assign attribution
    for (let i = 0; i < touchpoints.length; i++) {
      const channel = touchpoints[i].channel;
      const credit = weights[i] / totalWeight;
      attribution[channel] = (attribution[channel] || 0) + credit;
    }

    return attribution as Record<ConversionChannel, number>;
  }

  /**
   * Position-based attribution (40% first, 40% last, 20% middle)
   */
  private calculatePositionBased(touchpoints: Touchpoint[]): Record<ConversionChannel, number> {
    const attribution: Record<string, number> = {};
    if (touchpoints.length === 0) return attribution as Record<ConversionChannel, number>;

    if (touchpoints.length === 1) {
      attribution[touchpoints[0].channel] = 1.0;
    } else if (touchpoints.length === 2) {
      attribution[touchpoints[0].channel] = 0.5;
      attribution[touchpoints[1].channel] = 0.5;
    } else {
      const middleCredit = 0.2 / (touchpoints.length - 2);

      // First touch: 40%
      attribution[touchpoints[0].channel] = 0.4;

      // Middle touches: 20% divided equally
      for (let i = 1; i < touchpoints.length - 1; i++) {
        const channel = touchpoints[i].channel;
        attribution[channel] = (attribution[channel] || 0) + middleCredit;
      }

      // Last touch: 40%
      const lastChannel = touchpoints[touchpoints.length - 1].channel;
      attribution[lastChannel] = (attribution[lastChannel] || 0) + 0.4;
    }

    return attribution as Record<ConversionChannel, number>;
  }

  /**
   * Save conversion to database
   */
  private async saveConversion(context: TenantContext, conversion: Conversion): Promise<void> {
    await transactionWithContext(context, async client => {
      const query = `
        INSERT INTO whatsapp_conversions (
          conversion_id,
          team_id,
          user_id,
          wa_phone,
          conversion_type,
          conversion_value,
          currency,
          timestamp,
          touchpoints,
          attribution,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `;

      await client.query(query, [
        conversion.conversionId,
        conversion.teamId,
        conversion.userId,
        conversion.waPhone,
        conversion.type,
        conversion.value,
        conversion.currency || 'USD',
        conversion.timestamp,
        JSON.stringify(conversion.touchpoints),
        JSON.stringify(conversion.attribution),
        JSON.stringify(conversion.metadata || {}),
      ]);

      logger.debug('conversion', 'Conversion saved', {
        conversionId: conversion.conversionId,
      });
    });
  }

  /**
   * Get conversion metrics
   */
  async getConversionMetrics(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
    attributionModel: AttributionModel = 'last_touch',
  ): Promise<ConversionMetrics> {
    const cacheKey = `conversion:metrics:${context.teamId}:${startDate.getTime()}-${endDate.getTime()}:${attributionModel}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<ConversionMetrics>(cacheKey);
      if (cached) return cached;
    }

    try {
      const query = `
        SELECT 
          COUNT(*) as total_conversions,
          SUM(conversion_value) as total_value,
          AVG(conversion_value) as avg_value,
          AVG(jsonb_array_length(touchpoints)) as avg_touchpoints,
          conversion_type,
          COUNT(*) as type_count,
          SUM(conversion_value) as type_value
        FROM whatsapp_conversions
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $3
        GROUP BY conversion_type;
      `;

      const result = await executeWithContext<{
        total_conversions: string;
        total_value: number;
        avg_value: number;
        avg_touchpoints: number;
        conversion_type: ConversionType;
        type_count: string;
        type_value: number;
      }>(context, query, [context.teamId, startDate, endDate]);

      const byType: Record<string, any> = {};
      let totalConversions = 0;
      let totalValue = 0;
      let avgValue = 0;
      let avgTouchpoints = 0;

      for (const row of result.rows) {
        totalConversions = parseInt(row.total_conversions, 10);
        totalValue = row.total_value || 0;
        avgValue = row.avg_value || 0;
        avgTouchpoints = row.avg_touchpoints || 0;

        byType[row.conversion_type] = {
          conversions: parseInt(row.type_count, 10),
          value: row.type_value || 0,
          avgValue: row.type_value / parseInt(row.type_count, 10) || 0,
        };
      }

      // Calculate channel metrics using attribution model
      const byChannel = await this.getChannelMetrics(context, startDate, endDate, attributionModel);

      const metrics: ConversionMetrics = {
        totalConversions,
        totalValue,
        avgConversionValue: avgValue,
        conversionRate: 0, // TODO: Calculate from total visitors/users
        avgTimeToConversion: 0, // TODO: Calculate from journey data
        avgTouchpoints,
        byChannel,
        byType: byType as Record<ConversionType, any>,
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, metrics, this.cacheTTL);
      }

      return metrics;
    } catch (error) {
      logger.error('conversion', 'Failed to get conversion metrics', error as Error);
      throw new DatabaseError('Failed to get conversion metrics');
    }
  }

  /**
   * Get channel metrics with attribution
   */
  private async getChannelMetrics(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
    attributionModel: AttributionModel,
  ): Promise<Record<ConversionChannel, any>> {
    const query = `
      SELECT 
        conversion_id,
        conversion_value,
        attribution
      FROM whatsapp_conversions
      WHERE team_id = $1
        AND timestamp >= $2
        AND timestamp < $3;
    `;

    const result = await executeWithContext<{
      conversion_id: string;
      conversion_value: number;
      attribution: any;
    }>(context, query, [context.teamId, startDate, endDate]);

    const channelMetrics: Record<string, any> = {};

    for (const row of result.rows) {
      const attribution = row.attribution[attributionModel] || {};

      for (const [channel, credit] of Object.entries(attribution)) {
        if (!channelMetrics[channel]) {
          channelMetrics[channel] = {
            conversions: 0,
            value: 0,
            rate: 0,
          };
        }
        channelMetrics[channel].conversions += credit as number;
        channelMetrics[channel].value += row.conversion_value * (credit as number);
      }
    }

    return channelMetrics as Record<ConversionChannel, any>;
  }

  /**
   * Analyze conversion paths
   */
  async analyzeConversionPaths(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<ConversionPathAnalysis> {
    const cacheKey = `conversion:paths:${context.teamId}:${startDate.getTime()}-${endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<ConversionPathAnalysis>(cacheKey);
      if (cached) return cached;
    }

    try {
      const query = `
        SELECT 
          touchpoints,
          conversion_value,
          COUNT(*) as path_count
        FROM whatsapp_conversions
        WHERE team_id = $1
          AND timestamp >= $2
          AND timestamp < $3
        GROUP BY touchpoints, conversion_value;
      `;

      const result = await executeWithContext<{
        touchpoints: any;
        conversion_value: number;
        path_count: string;
      }>(context, query, [context.teamId, startDate, endDate]);

      const pathMap = new Map<
        string,
        {
          path: string[];
          count: number;
          totalValue: number;
        }
      >();

      const lengthDistribution: Record<number, number> = {};
      const channelSequences = new Map<string, number>();
      const assistingChannels: Record<string, number> = {};

      for (const row of result.rows) {
        const touchpoints: Touchpoint[] = row.touchpoints;
        const path = touchpoints.map(t => t.channel);
        const pathKey = path.join(' → ');
        const count = parseInt(row.path_count, 10);

        // Track paths
        if (!pathMap.has(pathKey)) {
          pathMap.set(pathKey, {
            path,
            count: 0,
            totalValue: 0,
          });
        }
        const pathData = pathMap.get(pathKey)!;
        pathData.count += count;
        pathData.totalValue += row.conversion_value * count;

        // Track length distribution
        lengthDistribution[path.length] = (lengthDistribution[path.length] || 0) + count;

        // Track sequences
        const seqKey = path.join(',');
        channelSequences.set(seqKey, (channelSequences.get(seqKey) || 0) + count);

        // Track assisting channels (all except last)
        for (let i = 0; i < path.length - 1; i++) {
          const channel = path[i];
          assistingChannels[channel] = (assistingChannels[channel] || 0) + count;
        }
      }

      // Get top paths
      const topPaths = Array.from(pathMap.entries())
        .map(([, data]) => ({
          path: data.path,
          count: data.count,
          conversionRate: 0, // TODO: Calculate from total sessions
          avgValue: data.totalValue / data.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      // Format channel sequences
      const topSequences = Array.from(channelSequences.entries())
        .map(([seq, count]) => ({
          sequence: seq.split(',') as ConversionChannel[],
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      const analysis: ConversionPathAnalysis = {
        topPaths,
        pathLengthDistribution: lengthDistribution,
        channelSequences: topSequences,
        assistingChannels: assistingChannels as Record<ConversionChannel, number>,
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, analysis, this.cacheTTL);
      }

      return analysis;
    } catch (error) {
      logger.error('conversion', 'Failed to analyze conversion paths', error as Error);
      throw new DatabaseError('Failed to analyze conversion paths');
    }
  }

  /**
   * Get conversions for a user
   */
  async getUserConversions(
    context: TenantContext,
    userId: string,
    limit: number = 50,
  ): Promise<Conversion[]> {
    try {
      const query = `
        SELECT *
        FROM whatsapp_conversions
        WHERE team_id = $1
          AND user_id = $2
        ORDER BY timestamp DESC
        LIMIT $3;
      `;

      const result = await executeWithContext<any>(context, query, [context.teamId, userId, limit]);

      return result.rows.map(row => ({
        conversionId: row.conversion_id,
        teamId: row.team_id,
        userId: row.user_id,
        waPhone: row.wa_phone,
        type: row.conversion_type,
        value: row.conversion_value,
        currency: row.currency,
        timestamp: row.timestamp,
        touchpoints: row.touchpoints,
        attribution: row.attribution,
        metadata: row.metadata,
      }));
    } catch (error) {
      logger.error('conversion', 'Failed to get user conversions', error as Error);
      throw new DatabaseError('Failed to get user conversions');
    }
  }

  /**
   * Invalidate cache for team
   */
  private async invalidateCache(teamId: string): Promise<void> {
    await cache.deletePattern(`conversion:*:${teamId}:*`);
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
 * Create conversion tracker instance
 */
export function createConversionTracker(): ConversionTracker {
  return new ConversionTracker();
}

export default createConversionTracker();
