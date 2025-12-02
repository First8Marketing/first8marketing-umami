/**
 * WhatsApp Analytics Integration - Correlation Engine
 *
 * Main orchestrator for linking WhatsApp users with umami analytics users.
 * Combines multiple matching methods to create high-confidence correlations.
 */

import { v4 as uuidv4 } from 'uuid';
import { executeWithContext, transactionWithContext } from '@/lib/whatsapp-db';
import { getLogger } from '@/lib/whatsapp-logger';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import { DatabaseError, ValidationError } from '@/lib/whatsapp-errors';
import type { TenantContext, UserIdentityCorrelation, CorrelationMethod } from '@/types/whatsapp';

// Correlation components
import {
  ConfidenceScorer,
  CorrelationEvidence,
  createConfidenceScorer,
} from '@/lib/correlation/confidence-scorer';
import { PhoneMatcher, createPhoneMatcher } from '@/lib/correlation/phone-matcher';
import { EmailMatcher, createEmailMatcher } from '@/lib/correlation/email-matcher';
import { SessionMatcher, createSessionMatcher } from '@/lib/correlation/session-matcher';
import { BehavioralMatcher, createBehavioralMatcher } from '@/lib/correlation/behavioral-matcher';
import { JourneyMapper, createJourneyMapper } from '@/lib/correlation/journey-mapper';
import {
  VerificationManager,
  createVerificationManager,
} from '@/lib/correlation/verification-manager';

const logger = getLogger();

/**
 * Correlation request
 */
export interface CorrelationRequest {
  waPhone: string;
  waContactName?: string;
  messageTimestamp?: Date;
  messageContent?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Correlation result
 */
export interface CorrelationResult {
  correlationId: string;
  waPhone: string;
  umamiUserId?: string;
  umamiSessionId?: string;
  confidenceScore: number;
  correlationMethod: CorrelationMethod;
  evidence: CorrelationEvidence[];
  verified: boolean;
  needsVerification: boolean;
  created: boolean; // True if new, false if updated
  metadata?: Record<string, any>;
}

/**
 * Correlation engine options
 */
export interface CorrelationEngineOptions {
  autoVerifyThreshold?: number; // Auto-verify if confidence >= this (default: 0.90)
  minConfidenceThreshold?: number; // Minimum to create correlation (default: 0.40)
  enableBehavioral?: boolean; // Enable behavioral matching (slower)
  enableJourneyMapping?: boolean; // Build journey maps
  batchSize?: number; // Batch processing size
}

/**
 * WhatsApp Correlation Engine
 */
export class WhatsAppCorrelationEngine {
  private confidenceScorer: ConfidenceScorer;
  private phoneMatcher: PhoneMatcher;
  private emailMatcher: EmailMatcher;
  private sessionMatcher: SessionMatcher;
  private behavioralMatcher: BehavioralMatcher;
  private journeyMapper: JourneyMapper;
  private verificationManager: VerificationManager;
  private config: ReturnType<typeof getWhatsAppConfig>;

  constructor() {
    this.confidenceScorer = createConfidenceScorer();
    this.phoneMatcher = createPhoneMatcher();
    this.emailMatcher = createEmailMatcher();
    this.sessionMatcher = createSessionMatcher();
    this.behavioralMatcher = createBehavioralMatcher();
    this.journeyMapper = createJourneyMapper();
    this.verificationManager = createVerificationManager();
    this.config = getWhatsAppConfig();
  }

  /**
   * Correlate WhatsApp user with umami users
   */
  async correlate(
    context: TenantContext,
    request: CorrelationRequest,
    options: CorrelationEngineOptions = {},
  ): Promise<CorrelationResult> {
    const {
      autoVerifyThreshold = 0.9,
      minConfidenceThreshold = 0.4,
      enableBehavioral = true,
      enableJourneyMapping = false,
    } = options;

    logger.info('correlation', 'Starting correlation process', {
      waPhone: request.waPhone,
    });

    try {
      // Check if correlation already exists
      const existing = await this.findExistingCorrelation(context, request.waPhone);

      // Collect evidence from all matchers
      const evidence: CorrelationEvidence[] = [];

      // 1. Phone matching (highest confidence)
      logger.debug('correlation', 'Running phone matcher');
      const phoneMatches = await this.phoneMatcher.findMatches(context, request.waPhone);
      evidence.push(this.phoneMatcher.createEvidence(phoneMatches));

      // 2. Email matching (if email found in message content)
      if (request.messageContent) {
        logger.debug('correlation', 'Running email matcher');
        const emails = this.emailMatcher.extractEmails(request.messageContent);
        for (const email of emails.slice(0, 3)) {
          // Max 3 emails
          const emailMatches = await this.emailMatcher.findMatches(context, email);
          evidence.push(this.emailMatcher.createEvidence(emailMatches));
        }
      }

      // 3. Session matching (temporal correlation)
      if (request.messageTimestamp) {
        logger.debug('correlation', 'Running session matcher');
        const sessionMatches = await this.sessionMatcher.findTemporalMatches(
          context,
          request.messageTimestamp,
        );
        evidence.push(this.sessionMatcher.createEvidence(sessionMatches));

        // Enhanced with user agent if available
        if (request.userAgent && sessionMatches.length > 0) {
          const uaMatches = await this.sessionMatcher.findUserAgentMatches(
            context,
            request.userAgent,
            request.messageTimestamp,
          );
          if (uaMatches.length > 0) {
            evidence.push({
              method: 'user_agent',
              matched: true,
              weight: 0.5,
              quality: uaMatches[0].quality,
              data: { matches: uaMatches },
            });
          }
        }
      }

      // 4. Behavioral matching (optional, slower)
      if (enableBehavioral) {
        logger.debug('correlation', 'Running behavioral matcher');
        const behavioralMatches = await this.behavioralMatcher.findPatternMatches(
          context,
          request.waPhone,
        );
        if (behavioralMatches.length > 0) {
          evidence.push(this.behavioralMatcher.createEvidence(behavioralMatches));
        }
      }

      // Calculate confidence score
      const confidenceResult = this.confidenceScorer.calculate(evidence);

      logger.info('correlation', 'Confidence calculated', {
        score: confidenceResult.score,
        method: confidenceResult.method,
        evidenceCount: evidence.filter(e => e.matched).length,
      });

      // Check minimum threshold
      if (confidenceResult.score < minConfidenceThreshold) {
        logger.warn('correlation', 'Confidence below threshold', {
          score: confidenceResult.score,
          threshold: minConfidenceThreshold,
        });

        // Don't create correlation if too low confidence
        return {
          correlationId: '',
          waPhone: request.waPhone,
          confidenceScore: confidenceResult.score,
          correlationMethod: confidenceResult.method,
          evidence,
          verified: false,
          needsVerification: false,
          created: false,
        };
      }

      // Extract best umami user/session IDs from evidence
      const { umamiUserId, umamiSessionId } = this.extractBestMatch(evidence);

      // Create or update correlation
      const correlationId = existing?.correlationId || uuidv4();
      const created = !existing;

      await this.saveCorrelation(context, {
        correlationId,
        waPhone: request.waPhone,
        waContactName: request.waContactName,
        umamiUserId,
        umamiSessionId,
        confidenceScore: confidenceResult.score,
        method: confidenceResult.method,
        evidence: confidenceResult,
        autoVerify: confidenceResult.score >= autoVerifyThreshold,
      });

      // Queue for verification if needed
      const needsVerification = this.confidenceScorer.needsManualVerification(
        confidenceResult.score,
      );

      if (needsVerification && !existing) {
        await this.verificationManager.queueForVerification(
          context,
          correlationId,
          `Confidence score ${(confidenceResult.score * 100).toFixed(0)}% requires manual review`,
          this.calculatePriority(confidenceResult.score),
        );
      }

      // Build journey map if requested
      if (enableJourneyMapping && umamiUserId) {
        logger.debug('correlation', 'Building journey map');
        const journey = await this.journeyMapper.buildJourney(
          context,
          request.waPhone,
          umamiUserId,
        );

        if (journey) {
          const journeyQuality = this.journeyMapper.calculateJourneyQuality(journey);
          logger.info('correlation', 'Journey built', {
            touchpoints: journey.touchpoints.length,
            quality: journeyQuality,
          });
        }
      }

      return {
        correlationId,
        waPhone: request.waPhone,
        umamiUserId,
        umamiSessionId,
        confidenceScore: confidenceResult.score,
        correlationMethod: confidenceResult.method,
        evidence,
        verified: confidenceResult.score >= autoVerifyThreshold,
        needsVerification,
        created,
        metadata: {
          reasoning: confidenceResult.reasoning,
          breakdown: confidenceResult.breakdown,
        },
      };
    } catch (error) {
      logger.error('correlation', 'Correlation process failed', error as Error, {
        waPhone: request.waPhone,
      });
      throw new DatabaseError('Correlation process failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find existing correlation for WhatsApp phone
   */
  private async findExistingCorrelation(
    context: TenantContext,
    waPhone: string,
  ): Promise<{ correlationId: string; umamiUserId?: string } | null> {
    const query = `
      SELECT correlation_id, umami_user_id
      FROM whatsapp_user_identity_correlation
      WHERE team_id = $1
      AND wa_phone = $2
      AND is_active = TRUE
      ORDER BY confidence_score DESC
      LIMIT 1;
    `;

    const result = await executeWithContext<{
      correlation_id: string;
      umami_user_id: string;
    }>(context, query, [context.teamId, waPhone]);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      correlationId: result.rows[0].correlation_id,
      umamiUserId: result.rows[0].umami_user_id,
    };
  }

  /**
   * Extract best umami user/session IDs from evidence
   */
  private extractBestMatch(evidence: CorrelationEvidence[]): {
    umamiUserId?: string;
    umamiSessionId?: string;
  } {
    // Priority: phone > email > session > behavioral
    const priorities: CorrelationMethod[] = ['phone', 'email', 'session', 'ml_model', 'user_agent'];

    for (const method of priorities) {
      const match = evidence.find(e => e.method === method && e.matched);
      if (match?.data) {
        const bestMatch = match.data.bestMatch;
        if (bestMatch) {
          return {
            umamiUserId: bestMatch.umamiUserId,
            umamiSessionId: bestMatch.umamiSessionId,
          };
        }
      }
    }

    return {};
  }

  /**
   * Save correlation to database
   */
  private async saveCorrelation(
    context: TenantContext,
    data: {
      correlationId: string;
      waPhone: string;
      waContactName?: string;
      umamiUserId?: string;
      umamiSessionId?: string;
      confidenceScore: number;
      method: CorrelationMethod;
      evidence: any;
      autoVerify: boolean;
    },
  ): Promise<void> {
    await transactionWithContext(context, async client => {
      const query = `
        INSERT INTO whatsapp_user_identity_correlation (
          correlation_id,
          team_id,
          wa_phone,
          wa_contact_name,
          umami_user_id,
          umami_session_id,
          confidence_score,
          correlation_method,
          correlation_evidence,
          verified,
          user_consent,
          is_active,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT (correlation_id) DO UPDATE SET
          umami_user_id = COALESCE($5, whatsapp_user_identity_correlation.umami_user_id),
          umami_session_id = COALESCE($6, whatsapp_user_identity_correlation.umami_session_id),
          confidence_score = $7,
          correlation_method = $8,
          correlation_evidence = $9,
          verified = $10,
          updated_at = NOW();
      `;

      await client.query(query, [
        data.correlationId,
        context.teamId,
        data.waPhone,
        data.waContactName,
        data.umamiUserId,
        data.umamiSessionId,
        data.confidenceScore,
        data.method,
        JSON.stringify(data.evidence),
        data.autoVerify,
        true, // user_consent - default true, should be managed separately
        true, // is_active
      ]);

      logger.info('correlation', 'Correlation saved', {
        correlationId: data.correlationId,
        method: data.method,
        confidence: data.confidenceScore,
      });
    });
  }

  /**
   * Calculate verification priority (1-10)
   */
  private calculatePriority(confidenceScore: number): number {
    // Higher confidence = lower priority (less urgent)
    if (confidenceScore >= 0.8) return 3;
    if (confidenceScore >= 0.7) return 5;
    if (confidenceScore >= 0.6) return 7;
    if (confidenceScore >= 0.5) return 8;
    return 10; // Low confidence = highest priority
  }

  /**
   * Batch correlate multiple WhatsApp users
   */
  async batchCorrelate(
    context: TenantContext,
    requests: CorrelationRequest[],
    options: CorrelationEngineOptions = {},
  ): Promise<CorrelationResult[]> {
    const batchSize = options.batchSize || 10;
    const results: CorrelationResult[] = [];

    logger.info('correlation', 'Starting batch correlation', {
      totalRequests: requests.length,
      batchSize,
    });

    // Process in batches
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(request => this.correlate(context, request, options)),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('correlation', 'Batch item failed', result.reason);
        }
      }

      logger.debug('correlation', 'Batch processed', {
        batchIndex: i / batchSize + 1,
        processedCount: results.length,
      });
    }

    logger.info('correlation', 'Batch correlation complete', {
      totalRequests: requests.length,
      successCount: results.length,
      failureCount: requests.length - results.length,
    });

    return results;
  }

  /**
   * Update existing correlation with new data
   */
  async updateCorrelation(
    context: TenantContext,
    correlationId: string,
    newData: Partial<CorrelationRequest>,
  ): Promise<CorrelationResult> {
    try {
      // Get existing correlation
      const existingQuery = `
        SELECT *
        FROM whatsapp_user_identity_correlation
        WHERE correlation_id = $1
        AND team_id = $2
        AND is_active = TRUE;
      `;

      const existingResult = await executeWithContext<UserIdentityCorrelation>(
        context,
        existingQuery,
        [correlationId, context.teamId],
      );

      if (existingResult.rows.length === 0) {
        throw new ValidationError('Correlation not found', { correlationId });
      }

      const existing = existingResult.rows[0];

      // Re-run correlation with combined data
      const request: CorrelationRequest = {
        waPhone: existing.waPhone,
        waContactName: newData.waContactName || existing.waContactName || undefined,
        messageTimestamp: newData.messageTimestamp,
        messageContent: newData.messageContent,
        userAgent: newData.userAgent,
        metadata: newData.metadata,
      };

      return await this.correlate(context, request, { enableJourneyMapping: true });
    } catch (error) {
      logger.error('correlation', 'Update correlation failed', error as Error, {
        correlationId,
      });
      throw new DatabaseError('Update correlation failed');
    }
  }

  /**
   * Get correlation by ID
   */
  async getCorrelation(
    context: TenantContext,
    correlationId: string,
  ): Promise<UserIdentityCorrelation | null> {
    const query = `
      SELECT *
      FROM whatsapp_user_identity_correlation
      WHERE correlation_id = $1
      AND team_id = $2;
    `;

    const result = await executeWithContext<UserIdentityCorrelation>(context, query, [
      correlationId,
      context.teamId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * List all correlations for team
   */
  async listCorrelations(
    context: TenantContext,
    filters?: {
      verified?: boolean;
      minConfidence?: number;
      method?: CorrelationMethod;
    },
    page: number = 1,
    pageSize: number = 50,
  ): Promise<{
    data: UserIdentityCorrelation[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    try {
      let whereClause = 'WHERE team_id = $1 AND is_active = TRUE';
      const params: any[] = [context.teamId];
      let paramIndex = 2;

      if (filters?.verified !== undefined) {
        whereClause += ` AND verified = $${paramIndex}`;
        params.push(filters.verified);
        paramIndex++;
      }

      if (filters?.minConfidence !== undefined) {
        whereClause += ` AND confidence_score >= $${paramIndex}`;
        params.push(filters.minConfidence);
        paramIndex++;
      }

      if (filters?.method) {
        whereClause += ` AND correlation_method = $${paramIndex}`;
        params.push(filters.method);
        paramIndex++;
      }

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whatsapp_user_identity_correlation
        ${whereClause};
      `;

      const countResult = await executeWithContext<{ total: string }>(context, countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // Get paginated data
      const offset = (page - 1) * pageSize;
      const dataQuery = `
        SELECT *
        FROM whatsapp_user_identity_correlation
        ${whereClause}
        ORDER BY confidence_score DESC, created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
      `;

      const dataResult = await executeWithContext<UserIdentityCorrelation>(context, dataQuery, [
        ...params,
        pageSize,
        offset,
      ]);

      return {
        data: dataResult.rows,
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('correlation', 'List correlations failed', error as Error);
      throw new DatabaseError('List correlations failed');
    }
  }

  /**
   * Delete correlation
   */
  async deleteCorrelation(context: TenantContext, correlationId: string): Promise<void> {
    const query = `
      UPDATE whatsapp_user_identity_correlation
      SET is_active = FALSE, updated_at = NOW()
      WHERE correlation_id = $1
      AND team_id = $2;
    `;

    await executeWithContext(context, query, [correlationId, context.teamId]);

    logger.info('correlation', 'Correlation deleted', { correlationId });
  }

  /**
   * Get engine statistics
   */
  async getStatistics(context: TenantContext): Promise<{
    totalCorrelations: number;
    verifiedCount: number;
    pendingCount: number;
    avgConfidence: number;
    methodDistribution: Record<CorrelationMethod, number>;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verified = TRUE) as verified,
        COUNT(*) FILTER (WHERE verified = FALSE) as pending,
        AVG(confidence_score) as avg_confidence,
        correlation_method,
        COUNT(*) as method_count
      FROM whatsapp_user_identity_correlation
      WHERE team_id = $1
      AND is_active = TRUE
      GROUP BY correlation_method;
    `;

    const result = await executeWithContext<{
      total: string;
      verified: string;
      pending: string;
      avg_confidence: number;
      correlation_method: CorrelationMethod;
      method_count: string;
    }>(context, query, [context.teamId]);

    const methodDistribution: Record<string, number> = {};
    let totalCorrelations = 0;
    let verifiedCount = 0;
    let pendingCount = 0;
    let totalConfidence = 0;
    let methodCount = 0;

    for (const row of result.rows) {
      const total = parseInt(row.total, 10);
      totalCorrelations = total;
      verifiedCount = parseInt(row.verified, 10);
      pendingCount = parseInt(row.pending, 10);
      totalConfidence += row.avg_confidence * parseInt(row.method_count, 10);
      methodCount += parseInt(row.method_count, 10);
      methodDistribution[row.correlation_method] = parseInt(row.method_count, 10);
    }

    return {
      totalCorrelations,
      verifiedCount,
      pendingCount,
      avgConfidence: methodCount > 0 ? totalConfidence / methodCount : 0,
      methodDistribution: methodDistribution as Record<CorrelationMethod, number>,
    };
  }
}

// Singleton instance
let correlationEngineInstance: WhatsAppCorrelationEngine | null = null;

/**
 * Create correlation engine instance
 */
export function createCorrelationEngine(): WhatsAppCorrelationEngine {
  return new WhatsAppCorrelationEngine();
}

/**
 * Get correlation engine singleton instance
 */
export function getCorrelationEngine(): WhatsAppCorrelationEngine {
  if (!correlationEngineInstance) {
    correlationEngineInstance = createCorrelationEngine();
  }
  return correlationEngineInstance;
}

// Export default instance
export default createCorrelationEngine();
