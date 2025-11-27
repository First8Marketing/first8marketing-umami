/**
 * WhatsApp Analytics Integration - Confidence Scorer
 *
 * Calculates confidence scores for user identity correlations by combining
 * evidence from multiple matching methods with weighted algorithms.
 */

import { getLogger } from '@/lib/whatsapp-logger';
import type { CorrelationMethod } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Evidence item for a single correlation method
 */
export interface CorrelationEvidence {
  method: CorrelationMethod;
  matched: boolean;
  weight: number;
  data?: Record<string, any>;
  quality?: number; // 0.0-1.0, adjusts the weight
}

/**
 * Confidence calculation result
 */
export interface ConfidenceResult {
  score: number; // Final 0.0-1.0 confidence score
  method: CorrelationMethod; // Primary method used
  evidence: CorrelationEvidence[];
  breakdown: Record<string, number>;
  reasoning: string[];
}

/**
 * Confidence scoring configuration
 */
export interface ConfidenceConfig {
  weights: Record<CorrelationMethod, number>;
  thresholds: {
    high: number; // >= 0.85
    medium: number; // >= 0.60
    low: number; // >= 0.40
    veryLow: number; // < 0.40
  };
  bonuses: {
    multipleMatches: number; // Bonus for multiple evidence sources
    highQuality: number; // Bonus for high-quality matches
    recentActivity: number; // Bonus for recent correlations
  };
}

/**
 * Default confidence weights based on architecture spec
 */
const DEFAULT_WEIGHTS: Record<CorrelationMethod, number> = {
  phone: 0.9,
  email: 0.85,
  session: 0.7,
  user_agent: 0.5,
  manual: 1.0,
  ml_model: 0.6, // Variable, adjusted by model quality
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConfidenceConfig = {
  weights: DEFAULT_WEIGHTS,
  thresholds: {
    high: 0.85,
    medium: 0.6,
    low: 0.4,
    veryLow: 0.4,
  },
  bonuses: {
    multipleMatches: 0.1,
    highQuality: 0.05,
    recentActivity: 0.03,
  },
};

/**
 * Confidence Scorer class
 */
export class ConfidenceScorer {
  private config: ConfidenceConfig;

  constructor(config?: Partial<ConfidenceConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_CONFIG.weights,
        ...config?.weights,
      },
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config?.thresholds,
      },
      bonuses: {
        ...DEFAULT_CONFIG.bonuses,
        ...config?.bonuses,
      },
    };
  }

  /**
   * Calculate confidence score from evidence
   */
  calculate(evidence: CorrelationEvidence[]): ConfidenceResult {
    if (evidence.length === 0) {
      return {
        score: 0,
        method: 'manual',
        evidence: [],
        breakdown: {},
        reasoning: ['No evidence provided'],
      };
    }

    const reasoning: string[] = [];
    const breakdown: Record<string, number> = {};

    // Calculate base score from weighted evidence
    let totalWeight = 0;
    let weightedSum = 0;

    for (const item of evidence) {
      if (item.matched) {
        const quality = item.quality ?? 1.0;
        const effectiveWeight = item.weight * quality;

        weightedSum += effectiveWeight;
        totalWeight += item.weight;

        breakdown[item.method] = effectiveWeight;
        reasoning.push(
          `${item.method}: ${(effectiveWeight * 100).toFixed(0)}% (quality: ${(quality * 100).toFixed(0)}%)`,
        );
      }
    }

    // Base score is weighted average
    const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Apply bonuses
    let bonusScore = 0;

    // Multiple matches bonus
    const matchCount = evidence.filter(e => e.matched).length;
    if (matchCount > 1) {
      bonusScore += this.config.bonuses.multipleMatches;
      reasoning.push(
        `Multiple evidence sources (+${(this.config.bonuses.multipleMatches * 100).toFixed(0)}%)`,
      );
    }

    // High quality bonus
    const avgQuality =
      evidence.filter(e => e.matched).reduce((sum, e) => sum + (e.quality ?? 1.0), 0) / matchCount;

    if (avgQuality > 0.9) {
      bonusScore += this.config.bonuses.highQuality;
      reasoning.push(
        `High quality matches (+${(this.config.bonuses.highQuality * 100).toFixed(0)}%)`,
      );
    }

    // Recent activity bonus (if timestamp in evidence)
    const hasRecentActivity = evidence.some(e => {
      const timestamp = e.data?.timestamp;
      if (!timestamp) return false;

      const age = Date.now() - new Date(timestamp).getTime();
      return age < 24 * 60 * 60 * 1000; // Within 24 hours
    });

    if (hasRecentActivity) {
      bonusScore += this.config.bonuses.recentActivity;
      reasoning.push(
        `Recent activity (+${(this.config.bonuses.recentActivity * 100).toFixed(0)}%)`,
      );
    }

    // Final score (capped at 1.0)
    const finalScore = Math.min(1.0, baseScore + bonusScore);

    // Determine primary method (highest weight match)
    const primaryMethod =
      evidence.filter(e => e.matched).sort((a, b) => b.weight - a.weight)[0]?.method || 'manual';

    logger.debug('correlation', 'Confidence calculated', {
      baseScore,
      bonusScore,
      finalScore,
      method: primaryMethod,
      evidenceCount: matchCount,
    });

    return {
      score: finalScore,
      method: primaryMethod,
      evidence,
      breakdown,
      reasoning,
    };
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= this.config.thresholds.high) return 'high';
    if (score >= this.config.thresholds.medium) return 'medium';
    if (score >= this.config.thresholds.low) return 'low';
    return 'very_low';
  }

  /**
   * Check if score meets threshold for automatic correlation
   */
  meetsThreshold(score: number, threshold: number = 0.7): boolean {
    return score >= threshold;
  }

  /**
   * Check if correlation needs manual verification
   */
  needsManualVerification(score: number): boolean {
    return score >= 0.4 && score < 0.85;
  }

  /**
   * Create evidence item from method result
   */
  static createEvidence(
    method: CorrelationMethod,
    matched: boolean,
    weight?: number,
    quality?: number,
    data?: Record<string, any>,
  ): CorrelationEvidence {
    return {
      method,
      matched,
      weight: weight ?? DEFAULT_WEIGHTS[method],
      quality,
      data,
    };
  }

  /**
   * Combine multiple confidence results (for updating correlations)
   */
  combine(results: ConfidenceResult[]): ConfidenceResult {
    if (results.length === 0) {
      return this.calculate([]);
    }

    if (results.length === 1) {
      return results[0];
    }

    // Collect all unique evidence
    const allEvidence: CorrelationEvidence[] = [];
    const seenMethods = new Set<string>();

    for (const result of results) {
      for (const evidence of result.evidence) {
        const key = `${evidence.method}_${evidence.matched}`;
        if (!seenMethods.has(key)) {
          allEvidence.push(evidence);
          seenMethods.add(key);
        }
      }
    }

    // Recalculate with combined evidence
    return this.calculate(allEvidence);
  }

  /**
   * Adjust confidence based on manual feedback
   */
  adjustForFeedback(
    result: ConfidenceResult,
    wasCorrect: boolean,
    learningRate: number = 0.1,
  ): ConfidenceResult {
    const adjustment = wasCorrect ? learningRate : -learningRate;
    const adjustedScore = Math.max(0, Math.min(1.0, result.score + adjustment));

    return {
      ...result,
      score: adjustedScore,
      reasoning: [
        ...result.reasoning,
        `Adjusted by manual feedback: ${wasCorrect ? 'correct' : 'incorrect'} (+${(adjustment * 100).toFixed(0)}%)`,
      ],
    };
  }

  /**
   * Export configuration
   */
  getConfig(): ConfidenceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConfidenceConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      weights: {
        ...this.config.weights,
        ...updates.weights,
      },
      thresholds: {
        ...this.config.thresholds,
        ...updates.thresholds,
      },
      bonuses: {
        ...this.config.bonuses,
        ...updates.bonuses,
      },
    };

    logger.info('correlation', 'Confidence scorer config updated', {
      config: this.config,
    });
  }
}

/**
 * Create default confidence scorer instance
 */
export function createConfidenceScorer(config?: Partial<ConfidenceConfig>): ConfidenceScorer {
  return new ConfidenceScorer(config);
}

/**
 * Quick confidence calculation helper
 */
export function calculateConfidence(evidence: CorrelationEvidence[]): ConfidenceResult {
  const scorer = createConfidenceScorer();
  return scorer.calculate(evidence);
}

// Export default instance
export default createConfidenceScorer();
