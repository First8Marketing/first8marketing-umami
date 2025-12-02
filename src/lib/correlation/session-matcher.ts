/**
 * WhatsApp Analytics Integration - Session Matcher
 *
 * Matches WhatsApp users with umami analytics sessions through temporal
 * correlation, user agent matching, and behavioral pattern analysis.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';
import type { CorrelationEvidence } from './confidence-scorer';

const logger = getLogger();

/**
 * Session match result
 */
export interface SessionMatchResult {
  matched: boolean;
  umamiSessionId: string;
  umamiUserId?: string;
  matchType: 'temporal' | 'user_agent' | 'ip_proximity' | 'combined';
  overlapScore: number; // 0.0-1.0
  quality: number; // 0.0-1.0
  metadata?: Record<string, any>;
}

/**
 * Temporal correlation window configuration
 */
export interface TemporalWindow {
  beforeMinutes: number; // Look before WhatsApp message
  afterMinutes: number; // Look after WhatsApp message
  maxDuration: number; // Maximum session duration to consider
}

/**
 * Session matching options
 */
export interface SessionMatchOptions {
  temporalWindow?: TemporalWindow;
  requireUserAgent?: boolean;
  requireIPProximity?: boolean;
  minOverlapScore?: number;
}

/**
 * Default temporal window (30 minutes before, 60 minutes after)
 */
const DEFAULT_TEMPORAL_WINDOW: TemporalWindow = {
  beforeMinutes: 30,
  afterMinutes: 60,
  maxDuration: 240, // 4 hours
};

/**
 * Session Matcher class
 */
export class SessionMatcher {
  private cacheKeyPrefix = 'session_match';
  private cacheTtl = 1800; // 30 minutes

  /**
   * Find sessions that overlap with WhatsApp message timestamp
   */
  async findTemporalMatches(
    context: TenantContext,
    timestamp: Date,
    options: SessionMatchOptions = {},
  ): Promise<SessionMatchResult[]> {
    const window = options.temporalWindow || DEFAULT_TEMPORAL_WINDOW;

    // Calculate time window
    const startTime = new Date(timestamp.getTime() - window.beforeMinutes * 60000);
    const endTime = new Date(timestamp.getTime() + window.afterMinutes * 60000);

    // Check cache
    const cacheKey = `${this.cacheKeyPrefix}:temporal:${context.teamId}:${timestamp.getTime()}`;
    const cached = await cache.get<SessionMatchResult[]>(cacheKey);
    if (cached) {
      logger.debug('correlation', 'Session match cache hit', { timestamp });
      return cached;
    }

    try {
      const query = `
        SELECT DISTINCT
          s.session_id,
          s.user_id,
          s.hostname,
          s.browser,
          s.os,
          s.device,
          s.country,
          s.created_at,
          s.data,
          -- Calculate session duration
          EXTRACT(EPOCH FROM (
            COALESCE(
              (SELECT MAX(created_at) FROM website_event WHERE session_id = s.session_id),
              s.created_at
            ) - s.created_at
          )) / 60 AS duration_minutes,
          -- Count events in session
          (SELECT COUNT(*) FROM website_event WHERE session_id = s.session_id) AS event_count
        FROM session s
        WHERE s.website_id IN (
          SELECT website_id 
          FROM website 
          WHERE team_id = $1
        )
        AND s.created_at >= $2
        AND s.created_at <= $3
        AND EXTRACT(EPOCH FROM (
          COALESCE(
            (SELECT MAX(created_at) FROM website_event WHERE session_id = s.session_id),
            s.created_at
          ) - s.created_at
        )) / 60 <= $4
        ORDER BY s.created_at DESC
        LIMIT 100;
      `;

      const result = await executeWithContext<{
        session_id: string;
        user_id: string;
        hostname: string;
        browser: string;
        os: string;
        device: string;
        country: string;
        created_at: Date;
        data: any;
        duration_minutes: number;
        event_count: number;
      }>(context, query, [context.teamId, startTime, endTime, window.maxDuration]);

      const matches: SessionMatchResult[] = [];

      for (const row of result.rows) {
        const overlapScore = this.calculateTemporalOverlap(
          timestamp,
          row.created_at,
          row.duration_minutes,
          window,
        );

        if (overlapScore >= (options.minOverlapScore || 0.3)) {
          matches.push({
            matched: true,
            umamiSessionId: row.session_id,
            umamiUserId: row.user_id,
            matchType: 'temporal',
            overlapScore,
            quality: this.calculateTemporalQuality(overlapScore, row.event_count),
            metadata: {
              sessionStart: row.created_at,
              duration: row.duration_minutes,
              eventCount: row.event_count,
              browser: row.browser,
              os: row.os,
              device: row.device,
              country: row.country,
              hostname: row.hostname,
            },
          });
        }
      }

      // Cache results
      await cache.set(cacheKey, matches, this.cacheTtl);

      logger.info('correlation', 'Temporal session matches found', {
        timestamp,
        matchCount: matches.length,
      });

      return matches;
    } catch (error) {
      logger.error('correlation', 'Temporal session matching failed', error as Error, {
        timestamp,
      });
      throw new DatabaseError('Temporal session matching failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculate temporal overlap score
   */
  private calculateTemporalOverlap(
    waTimestamp: Date,
    sessionStart: Date,
    durationMinutes: number,
    window: TemporalWindow,
  ): number {
    const waTime = waTimestamp.getTime();
    const sessionStartTime = sessionStart.getTime();
    const sessionEndTime = sessionStartTime + durationMinutes * 60000;

    // Calculate overlap
    const overlapStart = Math.max(waTime - window.beforeMinutes * 60000, sessionStartTime);
    const overlapEnd = Math.min(waTime + window.afterMinutes * 60000, sessionEndTime);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);

    // Total possible overlap window
    const totalWindow = (window.beforeMinutes + window.afterMinutes) * 60000;

    // Overlap score (0.0-1.0)
    let score = overlapDuration / totalWindow;

    // Bonus for exact or near-exact timing (within 5 minutes)
    const timeDiff = Math.abs(waTime - sessionStartTime);
    if (timeDiff < 5 * 60000) {
      score = Math.min(1.0, score * 1.2);
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate quality based on temporal overlap and session activity
   */
  private calculateTemporalQuality(overlapScore: number, eventCount: number): number {
    // Base quality from overlap
    let quality = overlapScore * 0.7;

    // Bonus for active sessions (more events = more confidence)
    if (eventCount >= 10) {
      quality += 0.2;
    } else if (eventCount >= 5) {
      quality += 0.15;
    } else if (eventCount >= 2) {
      quality += 0.1;
    }

    // Penalty for single-event sessions
    if (eventCount === 1) {
      quality *= 0.8;
    }

    return Math.min(1.0, quality);
  }

  /**
   * Match by user agent string
   */
  async findUserAgentMatches(
    context: TenantContext,
    userAgent: string,
    timestamp: Date,
    window: TemporalWindow = DEFAULT_TEMPORAL_WINDOW,
  ): Promise<SessionMatchResult[]> {
    if (!userAgent) return [];

    try {
      // Normalize user agent for matching
      const normalizedUA = this.normalizeUserAgent(userAgent);

      const startTime = new Date(timestamp.getTime() - window.beforeMinutes * 60000);
      const endTime = new Date(timestamp.getTime() + window.afterMinutes * 60000);

      const query = `
        SELECT DISTINCT
          s.session_id,
          s.user_id,
          s.browser,
          s.os,
          s.device,
          s.created_at,
          (SELECT COUNT(*) FROM website_event WHERE session_id = s.session_id) AS event_count
        FROM session s
        WHERE s.website_id IN (
          SELECT website_id 
          FROM website 
          WHERE team_id = $1
        )
        AND s.created_at >= $2
        AND s.created_at <= $3
        AND (
          s.browser ILIKE $4
          OR s.os ILIKE $5
          OR s.device ILIKE $6
        )
        ORDER BY s.created_at DESC
        LIMIT 50;
      `;

      const browserPattern = `%${normalizedUA.browser}%`;
      const osPattern = `%${normalizedUA.os}%`;
      const devicePattern = `%${normalizedUA.device}%`;

      const result = await executeWithContext<{
        session_id: string;
        user_id: string;
        browser: string;
        os: string;
        device: string;
        created_at: Date;
        event_count: number;
      }>(context, query, [
        context.teamId,
        startTime,
        endTime,
        browserPattern,
        osPattern,
        devicePattern,
      ]);

      const matches: SessionMatchResult[] = [];

      for (const row of result.rows) {
        const similarity = this.calculateUserAgentSimilarity(normalizedUA, {
          browser: row.browser,
          os: row.os,
          device: row.device,
        });

        if (similarity > 0.5) {
          matches.push({
            matched: true,
            umamiSessionId: row.session_id,
            umamiUserId: row.user_id,
            matchType: 'user_agent',
            overlapScore: similarity,
            quality: similarity * 0.8, // User agent matching has medium-low confidence
            metadata: {
              browser: row.browser,
              os: row.os,
              device: row.device,
              eventCount: row.event_count,
              sessionStart: row.created_at,
            },
          });
        }
      }

      logger.info('correlation', 'User agent matches found', {
        matchCount: matches.length,
      });

      return matches;
    } catch (error) {
      logger.error('correlation', 'User agent matching failed', error as Error);
      return [];
    }
  }

  /**
   * Normalize user agent for comparison
   */
  private normalizeUserAgent(userAgent: string): {
    browser: string;
    os: string;
    device: string;
  } {
    const ua = userAgent.toLowerCase();

    // Extract browser
    let browser = 'unknown';
    if (ua.includes('chrome')) browser = 'chrome';
    else if (ua.includes('firefox')) browser = 'firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'safari';
    else if (ua.includes('edge')) browser = 'edge';
    else if (ua.includes('opera')) browser = 'opera';

    // Extract OS
    let os = 'unknown';
    if (ua.includes('windows')) os = 'windows';
    else if (ua.includes('mac os')) os = 'macos';
    else if (ua.includes('linux')) os = 'linux';
    else if (ua.includes('android')) os = 'android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'ios';

    // Extract device
    let device = 'desktop';
    if (ua.includes('mobile') || ua.includes('android')) device = 'mobile';
    else if (ua.includes('tablet') || ua.includes('ipad')) device = 'tablet';

    return { browser, os, device };
  }

  /**
   * Calculate user agent similarity
   */
  private calculateUserAgentSimilarity(
    ua1: { browser: string; os: string; device: string },
    ua2: { browser: string; os: string; device: string },
  ): number {
    let score = 0;
    let weights = 0;

    // Browser match (weight: 0.4)
    if (ua1.browser === ua2.browser && ua1.browser !== 'unknown') {
      score += 0.4;
    }
    weights += 0.4;

    // OS match (weight: 0.4)
    if (ua1.os === ua2.os && ua1.os !== 'unknown') {
      score += 0.4;
    }
    weights += 0.4;

    // Device match (weight: 0.2)
    if (ua1.device === ua2.device) {
      score += 0.2;
    }
    weights += 0.2;

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Find combined matches (temporal + user agent + IP)
   */
  async findCombinedMatches(
    context: TenantContext,
    timestamp: Date,
    userAgent?: string,
    options: SessionMatchOptions = {},
  ): Promise<SessionMatchResult[]> {
    // Get temporal matches first
    const temporalMatches = await this.findTemporalMatches(context, timestamp, options);

    if (!userAgent || temporalMatches.length === 0) {
      return temporalMatches;
    }

    // Enhance temporal matches with user agent similarity
    const normalizedUA = this.normalizeUserAgent(userAgent);
    const enhancedMatches: SessionMatchResult[] = [];

    for (const match of temporalMatches) {
      if (!match.metadata) continue;

      const sessionUA = {
        browser: match.metadata.browser || '',
        os: match.metadata.os || '',
        device: match.metadata.device || '',
      };

      const uaSimilarity = this.calculateUserAgentSimilarity(normalizedUA, sessionUA);

      // Combined score: weighted average
      const combinedScore = match.overlapScore * 0.7 + uaSimilarity * 0.3;
      const combinedQuality = match.quality * 0.7 + uaSimilarity * 0.3;

      enhancedMatches.push({
        ...match,
        matchType: uaSimilarity > 0.5 ? 'combined' : match.matchType,
        overlapScore: combinedScore,
        quality: Math.min(1.0, combinedQuality),
        metadata: {
          ...match.metadata,
          userAgentSimilarity: uaSimilarity,
        },
      });
    }

    // Sort by quality (highest first)
    enhancedMatches.sort((a, b) => b.quality - a.quality);

    logger.info('correlation', 'Combined session matches found', {
      matchCount: enhancedMatches.length,
      avgQuality: enhancedMatches.reduce((sum, m) => sum + m.quality, 0) / enhancedMatches.length,
    });

    return enhancedMatches;
  }

  /**
   * Create correlation evidence from matches
   */
  createEvidence(matches: SessionMatchResult[]): CorrelationEvidence {
    if (matches.length === 0) {
      return {
        method: 'session',
        matched: false,
        weight: 0.7,
      };
    }

    // Get best match
    const bestMatch = matches.reduce((best, current) =>
      current.quality > best.quality ? current : best,
    );

    return {
      method: 'session',
      matched: true,
      weight: 0.7,
      quality: bestMatch.quality,
      data: {
        matchCount: matches.length,
        bestMatch: bestMatch,
        allMatches: matches.slice(0, 10), // Top 10 only
        avgOverlap: matches.reduce((sum, m) => sum + m.overlapScore, 0) / matches.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Batch process multiple timestamps
   */
  async batchMatch(
    context: TenantContext,
    timestamps: Date[],
    options: SessionMatchOptions = {},
  ): Promise<Map<string, SessionMatchResult[]>> {
    const results = new Map<string, SessionMatchResult[]>();

    // Process in parallel with limit
    const batchSize = 5;
    for (let i = 0; i < timestamps.length; i += batchSize) {
      const batch = timestamps.slice(i, i + batchSize);
      const promises = batch.map(ts =>
        this.findTemporalMatches(context, ts, options)
          .then(matches => ({ timestamp: ts.toISOString(), matches }))
          .catch(error => {
            logger.error('correlation', 'Batch session match failed', error as Error, {
              timestamp: ts,
            });
            return { timestamp: ts.toISOString(), matches: [] };
          }),
      );

      const batchResults = await Promise.all(promises);
      for (const { timestamp, matches } of batchResults) {
        results.set(timestamp, matches);
      }
    }

    logger.info('correlation', 'Batch session matching complete', {
      totalTimestamps: timestamps.length,
      matchedTimestamps: Array.from(results.values()).filter(m => m.length > 0).length,
    });

    return results;
  }

  /**
   * Clear session match cache for team
   */
  async clearCache(context: TenantContext): Promise<void> {
    const pattern = `${this.cacheKeyPrefix}:*:${context.teamId}:*`;
    await cache.deletePattern(pattern);

    logger.info('correlation', 'Session match cache cleared', {
      teamId: context.teamId,
    });
  }
}

/**
 * Create session matcher instance
 */
export function createSessionMatcher(): SessionMatcher {
  return new SessionMatcher();
}

// Export default instance
export default createSessionMatcher();
