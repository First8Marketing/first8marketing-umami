/**
 * WhatsApp Analytics Integration - Verification Manager
 *
 * Manages manual verification workflows for ambiguous correlations,
 * learning from human feedback to improve confidence scoring.
 */

import { executeWithContext, transactionWithContext } from '@/lib/whatsapp-db';
import { queue, cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError, ValidationError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Verification queue item
 */
export interface VerificationQueueItem {
  correlationId: string;
  teamId: string;
  waPhone: string;
  waContactName?: string;
  umamiUserId?: string;
  confidenceScore: number;
  correlationMethod: string;
  evidence: Record<string, any>;
  reason: string;
  queuedAt: Date;
  priority: number; // 1-10, higher = more urgent
}

/**
 * Verification decision
 */
export interface VerificationDecision {
  correlationId: string;
  approved: boolean;
  verifiedBy: string;
  verifiedAt: Date;
  reason?: string;
  adjustedConfidence?: number;
}

/**
 * Verification statistics
 */
export interface VerificationStats {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  avgProcessingTime: number; // milliseconds
  approvalRate: number; // 0.0-1.0
  byMethod: Record<
    string,
    {
      pending: number;
      approved: number;
      rejected: number;
    }
  >;
}

/**
 * Verification Manager class
 */
export class VerificationManager {
  private queueName = 'verification_queue';
  private cacheKeyPrefix = 'verification';

  /**
   * Queue correlation for manual verification
   */
  async queueForVerification(
    context: TenantContext,
    correlationId: string,
    reason: string,
    priority: number = 5,
  ): Promise<void> {
    try {
      // Get correlation details
      const correlationQuery = `
        SELECT 
          correlation_id,
          team_id,
          wa_phone,
          wa_contact_name,
          umami_user_id,
          confidence_score,
          correlation_method,
          correlation_evidence
        FROM whatsapp_user_identity_correlation
        WHERE correlation_id = $1
        AND team_id = $2;
      `;

      const result = await executeWithContext<{
        correlation_id: string;
        team_id: string;
        wa_phone: string;
        wa_contact_name: string;
        umami_user_id: string;
        confidence_score: number;
        correlation_method: string;
        correlation_evidence: any;
      }>(context, correlationQuery, [correlationId, context.teamId]);

      if (result.rows.length === 0) {
        throw new ValidationError('Correlation not found', { correlationId });
      }

      const correlation = result.rows[0];

      const queueItem: VerificationQueueItem = {
        correlationId: correlation.correlation_id,
        teamId: correlation.team_id,
        waPhone: correlation.wa_phone,
        waContactName: correlation.wa_contact_name,
        umamiUserId: correlation.umami_user_id,
        confidenceScore: parseFloat(String(correlation.confidence_score)),
        correlationMethod: correlation.correlation_method,
        evidence: correlation.correlation_evidence || {},
        reason,
        queuedAt: new Date(),
        priority: Math.max(1, Math.min(10, priority)),
      };

      // Add to Redis queue
      await queue.push(`${this.queueName}:${context.teamId}`, queueItem);

      logger.info('correlation', 'Correlation queued for verification', {
        correlationId,
        reason,
        priority,
      });
    } catch (error) {
      logger.error('correlation', 'Failed to queue for verification', error as Error, {
        correlationId,
      });
      throw new DatabaseError('Failed to queue for verification', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get pending verifications for team
   */
  async getPendingVerifications(
    context: TenantContext,
    limit: number = 50,
  ): Promise<VerificationQueueItem[]> {
    try {
      const queueLength = await queue.length(`${this.queueName}:${context.teamId}`);
      const items: VerificationQueueItem[] = [];

      // Peek at queue items (non-destructive)
      for (let i = 0; i < Math.min(limit, queueLength); i++) {
        const item = await queue.pop(`${this.queueName}:${context.teamId}`, 0);
        if (item) {
          items.push(item);
          // Re-queue to preserve
          await queue.push(`${this.queueName}:${context.teamId}`, item);
        }
      }

      // Sort by priority (descending)
      items.sort((a, b) => b.priority - a.priority);

      logger.debug('correlation', 'Fetched pending verifications', {
        count: items.length,
      });

      return items;
    } catch (error) {
      logger.error('correlation', 'Failed to get pending verifications', error as Error);
      throw new DatabaseError('Failed to get pending verifications');
    }
  }

  /**
   * Approve correlation
   */
  async approveCorrelation(
    context: TenantContext,
    correlationId: string,
    verifiedBy: string,
    adjustedConfidence?: number,
  ): Promise<void> {
    try {
      await transactionWithContext(context, async client => {
        // Update correlation record
        const updateQuery = `
          UPDATE whatsapp_user_identity_correlation
          SET 
            verified = TRUE,
            verified_by = $1,
            verified_at = NOW(),
            confidence_score = COALESCE($2, confidence_score),
            updated_at = NOW()
          WHERE correlation_id = $3
          AND team_id = $4;
        `;

        await client.query(updateQuery, [
          verifiedBy,
          adjustedConfidence,
          correlationId,
          context.teamId,
        ]);

        // Remove from queue
        await this.removeFromQueue(context, correlationId);

        // Record decision for learning
        await this.recordDecision(context, correlationId, true, verifiedBy, adjustedConfidence);

        logger.info('correlation', 'Correlation approved', {
          correlationId,
          verifiedBy,
          adjustedConfidence,
        });
      });
    } catch (error) {
      logger.error('correlation', 'Approval failed', error as Error, { correlationId });
      throw new DatabaseError('Approval failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reject correlation
   */
  async rejectCorrelation(
    context: TenantContext,
    correlationId: string,
    verifiedBy: string,
    reason: string,
  ): Promise<void> {
    try {
      await transactionWithContext(context, async client => {
        // Mark as inactive instead of deleting (for learning)
        const updateQuery = `
          UPDATE whatsapp_user_identity_correlation
          SET 
            is_active = FALSE,
            verified = TRUE,
            verified_by = $1,
            verified_at = NOW(),
            correlation_evidence = COALESCE(correlation_evidence, '{}'::jsonb) || 
              jsonb_build_object('rejection_reason', $2),
            updated_at = NOW()
          WHERE correlation_id = $3
          AND team_id = $4;
        `;

        await client.query(updateQuery, [verifiedBy, reason, correlationId, context.teamId]);

        // Remove from queue
        await this.removeFromQueue(context, correlationId);

        // Record decision for learning
        await this.recordDecision(context, correlationId, false, verifiedBy);

        logger.info('correlation', 'Correlation rejected', {
          correlationId,
          verifiedBy,
          reason,
        });
      });
    } catch (error) {
      logger.error('correlation', 'Rejection failed', error as Error, { correlationId });
      throw new DatabaseError('Rejection failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove correlation from verification queue
   */
  private async removeFromQueue(context: TenantContext, correlationId: string): Promise<void> {
    const queueKey = `${this.queueName}:${context.teamId}`;
    const queueLength = await queue.length(queueKey);
    const tempQueue: VerificationQueueItem[] = [];

    // Pop all items
    for (let i = 0; i < queueLength; i++) {
      const item = await queue.pop(queueKey, 0);
      if (item && item.correlationId !== correlationId) {
        tempQueue.push(item);
      }
    }

    // Re-queue everything except the removed item
    for (const item of tempQueue) {
      await queue.push(queueKey, item);
    }
  }

  /**
   * Record verification decision for machine learning
   */
  private async recordDecision(
    context: TenantContext,
    correlationId: string,
    approved: boolean,
    verifiedBy: string,
    adjustedConfidence?: number,
  ): Promise<void> {
    const cacheKey = `${this.cacheKeyPrefix}:decisions:${context.teamId}`;

    const decision = {
      correlationId,
      approved,
      verifiedBy,
      verifiedAt: new Date(),
      adjustedConfidence,
    };

    // Store in cache for learning aggregation
    const decisions = (await cache.get<any[]>(cacheKey)) || [];
    decisions.push(decision);

    // Keep last 1000 decisions
    if (decisions.length > 1000) {
      decisions.shift();
    }

    await cache.set(cacheKey, decisions, 86400 * 30); // 30 days
  }

  /**
   * Get verification statistics
   */
  async getStatistics(context: TenantContext): Promise<VerificationStats> {
    try {
      const query = `
        SELECT 
          correlation_method,
          COUNT(*) FILTER (WHERE verified = FALSE) as pending,
          COUNT(*) FILTER (WHERE verified = TRUE AND is_active = TRUE) as approved,
          COUNT(*) FILTER (WHERE verified = TRUE AND is_active = FALSE) as rejected,
          AVG(EXTRACT(EPOCH FROM (verified_at - created_at)) * 1000) FILTER (WHERE verified = TRUE) as avg_processing_ms
        FROM whatsapp_user_identity_correlation
        WHERE team_id = $1
        GROUP BY correlation_method;
      `;

      const result = await executeWithContext<{
        correlation_method: string;
        pending: number;
        approved: number;
        rejected: number;
        avg_processing_ms: number;
      }>(context, query, [context.teamId]);

      const byMethod: Record<string, any> = {};
      let totalPending = 0;
      let totalApproved = 0;
      let totalRejected = 0;
      let totalProcessingTime = 0;
      let methodCount = 0;

      for (const row of result.rows) {
        const pending = parseInt(String(row.pending), 10);
        const approved = parseInt(String(row.approved), 10);
        const rejected = parseInt(String(row.rejected), 10);

        byMethod[row.correlation_method] = {
          pending,
          approved,
          rejected,
        };

        totalPending += pending;
        totalApproved += approved;
        totalRejected += rejected;

        if (row.avg_processing_ms) {
          totalProcessingTime += parseFloat(String(row.avg_processing_ms));
          methodCount++;
        }
      }

      const totalVerified = totalApproved + totalRejected;
      const approvalRate = totalVerified > 0 ? totalApproved / totalVerified : 0;
      const avgProcessingTime = methodCount > 0 ? totalProcessingTime / methodCount : 0;

      return {
        totalPending,
        totalApproved,
        totalRejected,
        avgProcessingTime,
        approvalRate,
        byMethod,
      };
    } catch (error) {
      logger.error('correlation', 'Failed to get verification stats', error as Error);
      throw new DatabaseError('Failed to get verification stats');
    }
  }

  /**
   * Get verification history for correlation
   */
  async getHistory(
    context: TenantContext,
    correlationId: string,
  ): Promise<
    Array<{
      action: string;
      verifiedBy: string;
      timestamp: Date;
      reason?: string;
    }>
  > {
    try {
      // Check if there's a verification record
      const query = `
        SELECT 
          verified,
          verified_by,
          verified_at,
          is_active,
          correlation_evidence
        FROM whatsapp_user_identity_correlation
        WHERE correlation_id = $1
        AND team_id = $2;
      `;

      const result = await executeWithContext<{
        verified: boolean;
        verified_by: string;
        verified_at: Date;
        is_active: boolean;
        correlation_evidence: any;
      }>(context, query, [correlationId, context.teamId]);

      if (result.rows.length === 0) {
        return [];
      }

      const record = result.rows[0];
      const history: Array<{
        action: string;
        verifiedBy: string;
        timestamp: Date;
        reason?: string;
      }> = [];

      if (record.verified) {
        history.push({
          action: record.is_active ? 'approved' : 'rejected',
          verifiedBy: record.verified_by,
          timestamp: record.verified_at,
          reason: record.correlation_evidence?.rejection_reason,
        });
      }

      return history;
    } catch (error) {
      logger.error('correlation', 'Failed to get verification history', error as Error);
      throw new DatabaseError('Failed to get verification history');
    }
  }

  /**
   * Learn from verification patterns
   */
  async analyzeVerificationPatterns(context: TenantContext): Promise<{
    accuratePatterns: string[];
    inaccuratePatterns: string[];
    recommendations: string[];
  }> {
    try {
      // Get recent verification decisions
      const decisionsKey = `${this.cacheKeyPrefix}:decisions:${context.teamId}`;
      const decisions = (await cache.get<VerificationDecision[]>(decisionsKey)) || [];

      if (decisions.length < 10) {
        return {
          accuratePatterns: [],
          inaccuratePatterns: [],
          recommendations: ['Need more verification data (minimum 10 decisions)'],
        };
      }

      // Analyze patterns
      const methodAccuracy = new Map<string, { correct: number; total: number }>();

      const correlationQuery = `
        SELECT 
          correlation_id,
          correlation_method,
          confidence_score
        FROM whatsapp_user_identity_correlation
        WHERE correlation_id = ANY($1)
        AND team_id = $2;
      `;

      const correlationIds = decisions.map(d => d.correlationId);
      const correlations = await executeWithContext<{
        correlation_id: string;
        correlation_method: string;
        confidence_score: number;
      }>(context, correlationQuery, [correlationIds, context.teamId]);

      const correlationMap = new Map(correlations.rows.map(r => [r.correlation_id, r]));

      for (const decision of decisions) {
        const correlation = correlationMap.get(decision.correlationId);
        if (!correlation) continue;

        const method = correlation.correlation_method;
        const stats = methodAccuracy.get(method) || { correct: 0, total: 0 };

        stats.total++;
        if (decision.approved) {
          stats.correct++;
        }

        methodAccuracy.set(method, stats);
      }

      // Identify accurate and inaccurate patterns
      const accuratePatterns: string[] = [];
      const inaccuratePatterns: string[] = [];
      const recommendations: string[] = [];

      for (const [method, stats] of methodAccuracy.entries()) {
        const accuracy = stats.correct / stats.total;

        if (accuracy >= 0.8) {
          accuratePatterns.push(`${method}: ${(accuracy * 100).toFixed(0)}% accurate`);
        } else if (accuracy < 0.5) {
          inaccuratePatterns.push(`${method}: ${(accuracy * 100).toFixed(0)}% accurate`);
          recommendations.push(`Consider lowering confidence weight for "${method}" method`);
        }
      }

      logger.info('correlation', 'Verification patterns analyzed', {
        methodCount: methodAccuracy.size,
        decisionCount: decisions.length,
      });

      return {
        accuratePatterns,
        inaccuratePatterns,
        recommendations,
      };
    } catch (error) {
      logger.error('correlation', 'Pattern analysis failed', error as Error);
      return {
        accuratePatterns: [],
        inaccuratePatterns: [],
        recommendations: ['Analysis failed - check logs'],
      };
    }
  }

  /**
   * Auto-approve high confidence correlations
   */
  async autoApprove(
    context: TenantContext,
    threshold: number = 0.9,
    systemUserId: string = 'system',
  ): Promise<number> {
    try {
      const updateQuery = `
        UPDATE whatsapp_user_identity_correlation
        SET 
          verified = TRUE,
          verified_by = $1,
          verified_at = NOW(),
          updated_at = NOW()
        WHERE team_id = $2
        AND verified = FALSE
        AND confidence_score >= $3
        AND is_active = TRUE;
      `;

      const result = await executeWithContext(context, updateQuery, [
        systemUserId,
        context.teamId,
        threshold,
      ]);

      const approvedCount = result.rowCount || 0;

      logger.info('correlation', 'Auto-approved high confidence correlations', {
        threshold,
        approvedCount,
      });

      return approvedCount;
    } catch (error) {
      logger.error('correlation', 'Auto-approval failed', error as Error);
      throw new DatabaseError('Auto-approval failed');
    }
  }

  /**
   * Clear verification queue for team
   */
  async clearQueue(context: TenantContext): Promise<number> {
    const queueKey = `${this.queueName}:${context.teamId}`;
    const length = await queue.length(queueKey);
    await queue.clear(queueKey);

    logger.info('correlation', 'Verification queue cleared', {
      teamId: context.teamId,
      itemsCleared: length,
    });

    return length;
  }
}

/**
 * Create verification manager instance
 */
export function createVerificationManager(): VerificationManager {
  return new VerificationManager();
}

// Export default instance
export default createVerificationManager();
