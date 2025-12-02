/**
 * WhatsApp Analytics Integration - Funnel Analyzer
 *
 * Conversation funnel tracking and analysis with configurable stages,
 * conversion rate calculation, and drop-off point identification.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext, ConversationStage } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Funnel stage definition
 */
export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
  entryKeywords?: string[]; // Keywords that indicate stage entry
  color?: string;
}

/**
 * Funnel configuration
 */
export interface FunnelConfig {
  funnelId: string;
  name: string;
  stages: FunnelStage[];
  isDefault?: boolean;
}

/**
 * Funnel metrics for a specific stage
 */
export interface FunnelStageMetrics {
  stageId: string;
  stageName: string;
  conversationCount: number;
  conversionToNext: number; // Count that progressed to next stage
  conversionRate: number; // Percentage that progressed
  dropOffCount: number;
  dropOffRate: number;
  avgTimeInStage: number; // seconds
  medianTimeInStage: number;
}

/**
 * Complete funnel analysis
 */
export interface FunnelAnalysis {
  funnelId: string;
  funnelName: string;
  totalEntries: number;
  totalCompletions: number;
  overallConversionRate: number;
  stages: FunnelStageMetrics[];
  funnelVelocity: number; // Average time through entire funnel in seconds
  dropOffPoints: Array<{
    stageId: string;
    stageName: string;
    dropOffRate: number;
  }>;
}

/**
 * Funnel comparison data
 */
export interface FunnelComparison {
  period1: FunnelAnalysis;
  period2: FunnelAnalysis;
  changes: {
    conversionRateChange: number;
    velocityChange: number;
    stageChanges: Array<{
      stageId: string;
      conversionRateChange: number;
      timeInStageChange: number;
    }>;
  };
}

/**
 * Default funnel stages
 */
const DEFAULT_FUNNEL: FunnelConfig = {
  funnelId: 'default',
  name: 'Default Sales Funnel',
  isDefault: true,
  stages: [
    {
      id: 'initial_contact',
      name: 'Initial Contact',
      order: 1,
      description: 'First message received from customer',
      entryKeywords: ['hello', 'hi', 'interested', 'info'],
      color: '#3B82F6',
    },
    {
      id: 'qualification',
      name: 'Qualification',
      order: 2,
      description: 'Customer profile identified and qualified',
      entryKeywords: ['budget', 'timeline', 'requirements', 'need'],
      color: '#8B5CF6',
    },
    {
      id: 'proposal',
      name: 'Proposal',
      order: 3,
      description: 'Offer or solution proposed to customer',
      entryKeywords: ['proposal', 'quote', 'offer', 'solution'],
      color: '#EC4899',
    },
    {
      id: 'negotiation',
      name: 'Negotiation',
      order: 4,
      description: 'Price and terms discussion',
      entryKeywords: ['price', 'discount', 'terms', 'negotiate'],
      color: '#F59E0B',
    },
    {
      id: 'close',
      name: 'Close',
      order: 5,
      description: 'Deal closed or conversation ended',
      entryKeywords: ['deal', 'purchase', 'accept', 'proceed'],
      color: '#10B981',
    },
  ],
};

/**
 * Funnel Analyzer
 */
export class FunnelAnalyzer {
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 600; // 10 minutes
  private defaultFunnel: FunnelConfig = DEFAULT_FUNNEL;

  /**
   * Analyze funnel for date range
   */
  async analyzeFunnel(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
    funnelConfig?: FunnelConfig,
  ): Promise<FunnelAnalysis> {
    const funnel = funnelConfig || this.defaultFunnel;
    const cacheKey = `funnel:analysis:${context.teamId}:${funnel.funnelId}:${startDate.getTime()}-${endDate.getTime()}`;

    if (this.cacheEnabled) {
      const cached = await cache.get<FunnelAnalysis>(cacheKey);
      if (cached) {
        logger.debug('funnel', 'Funnel analysis cache hit', { teamId: context.teamId });
        return cached;
      }
    }

    try {
      logger.info('funnel', 'Analyzing funnel', {
        teamId: context.teamId,
        funnelId: funnel.funnelId,
        stageCount: funnel.stages.length,
      });

      const stageMetrics: FunnelStageMetrics[] = [];
      let totalEntries = 0;
      let totalCompletions = 0;

      // Analyze each stage
      for (let i = 0; i < funnel.stages.length; i++) {
        const stage = funnel.stages[i];
        const nextStage = funnel.stages[i + 1];

        const metrics = await this.analyzeStage(context, stage, nextStage, startDate, endDate);

        stageMetrics.push(metrics);

        if (i === 0) {
          totalEntries = metrics.conversationCount;
        }
        if (i === funnel.stages.length - 1) {
          totalCompletions = metrics.conversationCount;
        }
      }

      // Calculate overall conversion rate
      const overallConversionRate = totalEntries > 0 ? (totalCompletions / totalEntries) * 100 : 0;

      // Calculate funnel velocity (average time to complete)
      const funnelVelocity = await this.calculateFunnelVelocity(
        context,
        funnel.stages,
        startDate,
        endDate,
      );

      // Identify drop-off points (stages with >30% drop-off)
      const dropOffPoints = stageMetrics
        .filter(s => s.dropOffRate > 30)
        .map(s => ({
          stageId: s.stageId,
          stageName: s.stageName,
          dropOffRate: s.dropOffRate,
        }))
        .sort((a, b) => b.dropOffRate - a.dropOffRate);

      const analysis: FunnelAnalysis = {
        funnelId: funnel.funnelId,
        funnelName: funnel.name,
        totalEntries,
        totalCompletions,
        overallConversionRate,
        stages: stageMetrics,
        funnelVelocity,
        dropOffPoints,
      };

      if (this.cacheEnabled) {
        await cache.set(cacheKey, analysis, this.cacheTTL);
      }

      return analysis;
    } catch (error) {
      logger.error('funnel', 'Failed to analyze funnel', error as Error);
      throw new DatabaseError('Failed to analyze funnel');
    }
  }

  /**
   * Analyze a single funnel stage
   */
  private async analyzeStage(
    context: TenantContext,
    stage: FunnelStage,
    nextStage: FunnelStage | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<FunnelStageMetrics> {
    try {
      // Count conversations in this stage
      const stageQuery = `
        SELECT 
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))) as median_time
        FROM whatsapp_conversation
        WHERE team_id = $1
          AND created_at >= $2
          AND created_at < $3
          AND stage = $4;
      `;

      const stageResult = await executeWithContext<{
        count: string;
        avg_time: number;
        median_time: number;
      }>(context, stageQuery, [context.teamId, startDate, endDate, stage.id]);

      const stageData = stageResult.rows[0];
      const conversationCount = parseInt(stageData?.count || '0', 10);
      const avgTimeInStage = stageData?.avg_time || 0;
      const medianTimeInStage = stageData?.median_time || 0;

      // Count conversations that progressed to next stage
      let conversionToNext = 0;
      if (nextStage) {
        const progressQuery = `
          SELECT COUNT(*) as count
          FROM whatsapp_conversation
          WHERE team_id = $1
            AND created_at >= $2
            AND created_at < $3
            AND stage = $4
            AND metadata->>'previous_stage' = $5;
        `;

        const progressResult = await executeWithContext<{ count: string }>(context, progressQuery, [
          context.teamId,
          startDate,
          endDate,
          nextStage.id,
          stage.id,
        ]);

        conversionToNext = parseInt(progressResult.rows[0]?.count || '0', 10);
      }

      const conversionRate =
        conversationCount > 0 ? (conversionToNext / conversationCount) * 100 : 0;

      const dropOffCount = conversationCount - conversionToNext;
      const dropOffRate = conversationCount > 0 ? (dropOffCount / conversationCount) * 100 : 0;

      return {
        stageId: stage.id,
        stageName: stage.name,
        conversationCount,
        conversionToNext,
        conversionRate,
        dropOffCount,
        dropOffRate,
        avgTimeInStage,
        medianTimeInStage,
      };
    } catch (error) {
      logger.error('funnel', 'Failed to analyze stage', error as Error, {
        stageId: stage.id,
      });
      throw error;
    }
  }

  /**
   * Calculate funnel velocity (average time to complete)
   */
  private async calculateFunnelVelocity(
    context: TenantContext,
    stages: FunnelStage[],
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      const firstStage = stages[0].id;
      const lastStage = stages[stages.length - 1].id;

      const query = `
        WITH first_stage_conversations AS (
          SELECT conversation_id, created_at as start_time
          FROM whatsapp_conversation
          WHERE team_id = $1
            AND created_at >= $2
            AND created_at < $3
            AND stage = $4
        ),
        completed_conversations AS (
          SELECT c.conversation_id, c.updated_at as end_time, f.start_time
          FROM whatsapp_conversation c
          INNER JOIN first_stage_conversations f ON c.conversation_id = f.conversation_id
          WHERE c.stage = $5
        )
        SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_velocity
        FROM completed_conversations;
      `;

      const result = await executeWithContext<{ avg_velocity: number }>(context, query, [
        context.teamId,
        startDate,
        endDate,
        firstStage,
        lastStage,
      ]);

      return result.rows[0]?.avg_velocity || 0;
    } catch (error) {
      logger.error('funnel', 'Failed to calculate funnel velocity', error as Error);
      return 0;
    }
  }

  /**
   * Compare funnel performance between two periods
   */
  async compareFunnels(
    context: TenantContext,
    period1Start: Date,
    period1End: Date,
    period2Start: Date,
    period2End: Date,
    funnelConfig?: FunnelConfig,
  ): Promise<FunnelComparison> {
    try {
      logger.info('funnel', 'Comparing funnel periods', { teamId: context.teamId });

      const [period1, period2] = await Promise.all([
        this.analyzeFunnel(context, period1Start, period1End, funnelConfig),
        this.analyzeFunnel(context, period2Start, period2End, funnelConfig),
      ]);

      const conversionRateChange = period2.overallConversionRate - period1.overallConversionRate;
      const velocityChange = period2.funnelVelocity - period1.funnelVelocity;

      const stageChanges = period1.stages.map((stage1, index) => {
        const stage2 = period2.stages[index];
        return {
          stageId: stage1.stageId,
          conversionRateChange: stage2.conversionRate - stage1.conversionRate,
          timeInStageChange: stage2.avgTimeInStage - stage1.avgTimeInStage,
        };
      });

      return {
        period1,
        period2,
        changes: {
          conversionRateChange,
          velocityChange,
          stageChanges,
        },
      };
    } catch (error) {
      logger.error('funnel', 'Failed to compare funnels', error as Error);
      throw new DatabaseError('Failed to compare funnels');
    }
  }

  /**
   * Get funnel visualization data
   */
  async getFunnelVisualizationData(
    context: TenantContext,
    startDate: Date,
    endDate: Date,
    funnelConfig?: FunnelConfig,
  ): Promise<{
    stages: Array<{
      name: string;
      value: number;
      color?: string;
    }>;
    conversions: Array<{
      from: string;
      to: string;
      count: number;
      rate: number;
    }>;
  }> {
    const analysis = await this.analyzeFunnel(context, startDate, endDate, funnelConfig);
    const funnel = funnelConfig || this.defaultFunnel;

    const stages = analysis.stages.map((stage, index) => ({
      name: stage.stageName,
      value: stage.conversationCount,
      color: funnel.stages[index]?.color,
    }));

    const conversions = analysis.stages
      .filter(stage => stage.conversionToNext > 0)
      .map(stage => {
        const nextStage = analysis.stages.find(
          s =>
            s.stageId !== stage.stageId &&
            funnel.stages.findIndex(fs => fs.id === s.stageId) >
              funnel.stages.findIndex(fs => fs.id === stage.stageId),
        );

        return {
          from: stage.stageName,
          to: nextStage?.stageName || 'Unknown',
          count: stage.conversionToNext,
          rate: stage.conversionRate,
        };
      });

    return { stages, conversions };
  }

  /**
   * Update conversation stage
   */
  async updateConversationStage(
    context: TenantContext,
    conversationId: string,
    newStage: ConversationStage,
    previousStage?: ConversationStage,
  ): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_conversation
        SET 
          stage = $1,
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{previous_stage}',
            to_jsonb($2::text)
          ),
          updated_at = NOW()
        WHERE conversation_id = $3
          AND team_id = $4;
      `;

      await executeWithContext(context, query, [
        newStage,
        previousStage || null,
        conversationId,
        context.teamId,
      ]);

      logger.info('funnel', 'Conversation stage updated', {
        conversationId,
        newStage,
        previousStage,
      });
    } catch (error) {
      logger.error('funnel', 'Failed to update conversation stage', error as Error);
      throw new DatabaseError('Failed to update conversation stage');
    }
  }

  /**
   * Auto-detect stage from conversation content
   */
  detectStageFromContent(
    messageContent: string,
    currentStage?: ConversationStage,
    funnelConfig?: FunnelConfig,
  ): ConversationStage | null {
    const funnel = funnelConfig || this.defaultFunnel;
    const content = messageContent.toLowerCase();

    // Find stages with matching keywords
    const matches = funnel.stages
      .filter(stage => {
        if (!stage.entryKeywords) return false;
        return stage.entryKeywords.some(keyword => content.includes(keyword.toLowerCase()));
      })
      .sort((a, b) => b.order - a.order); // Prefer later stages

    if (matches.length === 0) {
      return null;
    }

    // If current stage exists, only progress forward
    if (currentStage) {
      const currentOrder = funnel.stages.find(s => s.id === currentStage)?.order || 0;
      const progressStage = matches.find(s => s.order > currentOrder);
      return (progressStage?.id as ConversationStage) || null;
    }

    return matches[0].id as ConversationStage;
  }

  /**
   * Get custom funnel configuration
   */
  getDefaultFunnel(): FunnelConfig {
    return this.defaultFunnel;
  }

  /**
   * Set custom funnel as default
   */
  setDefaultFunnel(config: FunnelConfig): void {
    this.defaultFunnel = config;
  }

  /**
   * Validate funnel configuration
   */
  validateFunnelConfig(config: FunnelConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.funnelId) {
      errors.push('Funnel ID is required');
    }

    if (!config.name) {
      errors.push('Funnel name is required');
    }

    if (!config.stages || config.stages.length === 0) {
      errors.push('At least one stage is required');
    }

    if (config.stages) {
      const orders = config.stages.map(s => s.order);
      const uniqueOrders = new Set(orders);
      if (orders.length !== uniqueOrders.size) {
        errors.push('Stage orders must be unique');
      }

      const ids = config.stages.map(s => s.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        errors.push('Stage IDs must be unique');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
 * Create funnel analyzer instance
 */
export function createFunnelAnalyzer(): FunnelAnalyzer {
  return new FunnelAnalyzer();
}

export default createFunnelAnalyzer();
