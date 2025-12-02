/**
 * WhatsApp Analytics Integration - Behavioral Matcher
 *
 * Matches users based on behavioral patterns: activity timing, interaction
 * frequency, conversation topics vs page visits, and conversion alignment.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';
import type { CorrelationEvidence } from './confidence-scorer';

const logger = getLogger();

/**
 * Behavioral match result
 */
export interface BehavioralMatchResult {
  matched: boolean;
  umamiUserId?: string;
  umamiSessionId?: string;
  patternType: 'time_of_day' | 'frequency' | 'topic' | 'conversion' | 'combined';
  similarityScore: number; // 0.0-1.0
  quality: number; // 0.0-1.0
  metadata?: Record<string, any>;
}

/**
 * Activity pattern data
 */
export interface ActivityPattern {
  hourOfDay: Record<number, number>; // Hour -> count
  dayOfWeek: Record<number, number>; // Day -> count
  totalInteractions: number;
  avgInteractionsPerDay: number;
  peakHours: number[];
  peakDays: number[];
}

/**
 * Topic analysis result
 */
export interface TopicMatch {
  topic: string;
  waMessages: number;
  webPageVisits: number;
  matchScore: number;
}

/**
 * Behavioral Matcher class
 */
export class BehavioralMatcher {
  private cacheKeyPrefix = 'behavioral_match';
  private cacheTtl = 3600; // 1 hour

  /**
   * Extract WhatsApp user activity pattern
   */
  async extractWAPattern(
    context: TenantContext,
    waPhone: string,
    dayRange: number = 30,
  ): Promise<ActivityPattern> {
    const cacheKey = `${this.cacheKeyPrefix}:wa_pattern:${context.teamId}:${waPhone}`;
    const cached = await cache.get<ActivityPattern>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const query = `
        SELECT 
          EXTRACT(HOUR FROM timestamp) AS hour,
          EXTRACT(DOW FROM timestamp) AS day_of_week,
          COUNT(*) as interaction_count
        FROM whatsapp_message
        WHERE team_id = $1
        AND (from_phone = $2 OR to_phone = $2)
        AND timestamp > NOW() - INTERVAL '${dayRange} days'
        GROUP BY EXTRACT(HOUR FROM timestamp), EXTRACT(DOW FROM timestamp)
        ORDER BY interaction_count DESC;
      `;

      const result = await executeWithContext<{
        hour: number;
        day_of_week: number;
        interaction_count: number;
      }>(context, query, [context.teamId, waPhone]);

      const hourOfDay: Record<number, number> = {};
      const dayOfWeek: Record<number, number> = {};
      let totalInteractions = 0;

      for (const row of result.rows) {
        const hour = Math.floor(row.hour);
        const day = Math.floor(row.day_of_week);
        const count = parseInt(String(row.interaction_count), 10);

        hourOfDay[hour] = (hourOfDay[hour] || 0) + count;
        dayOfWeek[day] = (dayOfWeek[day] || 0) + count;
        totalInteractions += count;
      }

      // Calculate peak hours (top 3)
      const peakHours = Object.entries(hourOfDay)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));

      // Calculate peak days (top 2)
      const peakDays = Object.entries(dayOfWeek)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([day]) => parseInt(day));

      const pattern: ActivityPattern = {
        hourOfDay,
        dayOfWeek,
        totalInteractions,
        avgInteractionsPerDay: totalInteractions / dayRange,
        peakHours,
        peakDays,
      };

      await cache.set(cacheKey, pattern, this.cacheTtl);
      return pattern;
    } catch (error) {
      logger.error('correlation', 'Failed to extract WA pattern', error as Error);
      throw new DatabaseError('Failed to extract WA pattern');
    }
  }

  /**
   * Extract umami user activity pattern
   */
  async extractUmamiPattern(
    context: TenantContext,
    umamiUserId: string,
    dayRange: number = 30,
  ): Promise<ActivityPattern> {
    const cacheKey = `${this.cacheKeyPrefix}:umami_pattern:${context.teamId}:${umamiUserId}`;
    const cached = await cache.get<ActivityPattern>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const query = `
        SELECT 
          EXTRACT(HOUR FROM e.created_at) AS hour,
          EXTRACT(DOW FROM e.created_at) AS day_of_week,
          COUNT(*) as interaction_count
        FROM website_event e
        INNER JOIN session s ON s.session_id = e.session_id
        WHERE e.website_id IN (
          SELECT website_id 
          FROM website 
          WHERE team_id = $1
        )
        AND s.user_id = $2
        AND e.created_at > NOW() - INTERVAL '${dayRange} days'
        GROUP BY EXTRACT(HOUR FROM e.created_at), EXTRACT(DOW FROM e.created_at)
        ORDER BY interaction_count DESC;
      `;

      const result = await executeWithContext<{
        hour: number;
        day_of_week: number;
        interaction_count: number;
      }>(context, query, [context.teamId, umamiUserId]);

      const hourOfDay: Record<number, number> = {};
      const dayOfWeek: Record<number, number> = {};
      let totalInteractions = 0;

      for (const row of result.rows) {
        const hour = Math.floor(row.hour);
        const day = Math.floor(row.day_of_week);
        const count = parseInt(String(row.interaction_count), 10);

        hourOfDay[hour] = (hourOfDay[hour] || 0) + count;
        dayOfWeek[day] = (dayOfWeek[day] || 0) + count;
        totalInteractions += count;
      }

      const peakHours = Object.entries(hourOfDay)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));

      const peakDays = Object.entries(dayOfWeek)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([day]) => parseInt(day));

      const pattern: ActivityPattern = {
        hourOfDay,
        dayOfWeek,
        totalInteractions,
        avgInteractionsPerDay: totalInteractions / dayRange,
        peakHours,
        peakDays,
      };

      await cache.set(cacheKey, pattern, this.cacheTtl);
      return pattern;
    } catch (error) {
      logger.error('correlation', 'Failed to extract umami pattern', error as Error);
      throw new DatabaseError('Failed to extract umami pattern');
    }
  }

  /**
   * Compare two activity patterns
   */
  comparePatterns(pattern1: ActivityPattern, pattern2: ActivityPattern): number {
    let similarity = 0;
    let weights = 0;

    // Peak hours similarity (weight: 0.4)
    const hourOverlap = pattern1.peakHours.filter(h => pattern2.peakHours.includes(h)).length;
    similarity += (hourOverlap / 3) * 0.4;
    weights += 0.4;

    // Peak days similarity (weight: 0.3)
    const dayOverlap = pattern1.peakDays.filter(d => pattern2.peakDays.includes(d)).length;
    similarity += (dayOverlap / 2) * 0.3;
    weights += 0.3;

    // Frequency similarity (weight: 0.3)
    const avgFreq1 = pattern1.avgInteractionsPerDay;
    const avgFreq2 = pattern2.avgInteractionsPerDay;
    const freqRatio = Math.min(avgFreq1, avgFreq2) / Math.max(avgFreq1, avgFreq2);
    similarity += freqRatio * 0.3;
    weights += 0.3;

    return weights > 0 ? similarity / weights : 0;
  }

  /**
   * Find behavioral matches based on activity patterns
   */
  async findPatternMatches(
    context: TenantContext,
    waPhone: string,
  ): Promise<BehavioralMatchResult[]> {
    try {
      // Get WhatsApp pattern
      const waPattern = await this.extractWAPattern(context, waPhone);

      if (waPattern.totalInteractions < 3) {
        // Not enough data
        return [];
      }

      // Get candidate umami users (from recent activity)
      const candidatesQuery = `
        SELECT DISTINCT
          s.user_id,
          COUNT(DISTINCT e.event_id) as event_count
        FROM session s
        INNER JOIN website_event e ON e.session_id = s.session_id
        WHERE s.website_id IN (
          SELECT website_id 
          FROM website 
          WHERE team_id = $1
        )
        AND s.user_id IS NOT NULL
        AND e.created_at > NOW() - INTERVAL '30 days'
        GROUP BY s.user_id
        HAVING COUNT(DISTINCT e.event_id) >= 3
        ORDER BY event_count DESC
        LIMIT 50;
      `;

      const candidates = await executeWithContext<{
        user_id: string;
        event_count: number;
      }>(context, candidatesQuery, [context.teamId]);

      const matches: BehavioralMatchResult[] = [];

      // Compare patterns
      for (const candidate of candidates.rows) {
        const umamiPattern = await this.extractUmamiPattern(context, candidate.user_id);
        const similarity = this.comparePatterns(waPattern, umamiPattern);

        if (similarity > 0.3) {
          matches.push({
            matched: true,
            umamiUserId: candidate.user_id,
            patternType: 'time_of_day',
            similarityScore: similarity,
            quality: similarity * 0.6, // Behavioral has lower base confidence
            metadata: {
              waPattern,
              umamiPattern,
              eventCount: candidate.event_count,
            },
          });
        }
      }

      // Sort by quality
      matches.sort((a, b) => b.quality - a.quality);

      logger.info('correlation', 'Behavioral pattern matches found', {
        waPhone,
        matchCount: matches.length,
      });

      return matches;
    } catch (error) {
      logger.error('correlation', 'Pattern matching failed', error as Error);
      return [];
    }
  }

  /**
   * Analyze topic correlation between WhatsApp messages and web pages
   */
  async analyzeTopicCorrelation(
    context: TenantContext,
    waPhone: string,
    umamiUserId: string,
  ): Promise<TopicMatch[]> {
    try {
      // Extract keywords from WhatsApp messages
      const waKeywordsQuery = `
        SELECT 
          message_body,
          COUNT(*) as message_count
        FROM whatsapp_message
        WHERE team_id = $1
        AND (from_phone = $2 OR to_phone = $2)
        AND message_type = 'text'
        AND message_body IS NOT NULL
        AND LENGTH(message_body) > 10
        AND timestamp > NOW() - INTERVAL '30 days'
        LIMIT 100;
      `;

      const waMessages = await executeWithContext<{
        message_body: string;
        message_count: number;
      }>(context, waKeywordsQuery, [context.teamId, waPhone]);

      // Extract keywords from web page visits
      const webPagesQuery = `
        SELECT 
          e.url_path,
          e.url_query,
          e.referrer_domain,
          COUNT(*) as visit_count
        FROM website_event e
        INNER JOIN session s ON s.session_id = e.session_id
        WHERE e.website_id IN (
          SELECT website_id 
          FROM website 
          WHERE team_id = $1
        )
        AND s.user_id = $2
        AND e.created_at > NOW() - INTERVAL '30 days'
        GROUP BY e.url_path, e.url_query, e.referrer_domain
        ORDER BY visit_count DESC
        LIMIT 100;
      `;

      const webPages = await executeWithContext<{
        url_path: string;
        url_query: string;
        referrer_domain: string;
        visit_count: number;
      }>(context, webPagesQuery, [context.teamId, umamiUserId]);

      // Extract common terms (simple keyword extraction)
      const waTopics = this.extractTopics(waMessages.rows.map(r => r.message_body).join(' '));
      const webTopics = this.extractTopics(
        webPages.rows.map(r => r.url_path + ' ' + (r.url_query || '')).join(' '),
      );

      // Find overlapping topics
      const topicMatches: TopicMatch[] = [];
      for (const [topic, waCount] of Object.entries(waTopics)) {
        const webCount = webTopics[topic] || 0;
        if (webCount > 0) {
          const matchScore = Math.min(waCount, webCount) / Math.max(waCount, webCount);
          topicMatches.push({
            topic,
            waMessages: waCount,
            webPageVisits: webCount,
            matchScore,
          });
        }
      }

      // Sort by match score
      topicMatches.sort((a, b) => b.matchScore - a.matchScore);

      return topicMatches.slice(0, 10);
    } catch (error) {
      logger.error('correlation', 'Topic correlation analysis failed', error as Error);
      return [];
    }
  }

  /**
   * Simple topic extraction from text
   */
  private extractTopics(text: string): Record<string, number> {
    if (!text) return {};

    // Convert to lowercase and split into words
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3); // Only words > 3 chars

    // Common stop words to filter
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'are',
      'but',
      'not',
      'you',
      'all',
      'can',
      'has',
      'had',
      'his',
      'her',
      'was',
      'one',
      'our',
      'out',
      'day',
      'get',
      'use',
      'your',
      'this',
      'that',
      'with',
      'have',
      'from',
      'they',
      'know',
      'will',
    ]);

    // Count word frequency
    const topics: Record<string, number> = {};
    for (const word of words) {
      if (!stopWords.has(word)) {
        topics[word] = (topics[word] || 0) + 1;
      }
    }

    // Return top 20 topics
    return Object.fromEntries(
      Object.entries(topics)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20),
    );
  }

  /**
   * Analyze conversion event alignment
   */
  async analyzeConversionAlignment(
    context: TenantContext,
    waPhone: string,
    umamiUserId: string,
  ): Promise<BehavioralMatchResult | null> {
    try {
      // Check for conversion events in both channels
      const conversionQuery = `
        WITH wa_conversions AS (
          SELECT 
            timestamp,
            'whatsapp' as channel
          FROM whatsapp_conversation
          WHERE team_id = $1
          AND contact_phone = $2
          AND status = 'closed'
          AND stage = 'close'
        ),
        web_conversions AS (
          SELECT 
            e.created_at as timestamp,
            'web' as channel
          FROM website_event e
          INNER JOIN session s ON s.session_id = e.session_id
          WHERE e.website_id IN (
            SELECT website_id 
            FROM website 
            WHERE team_id = $1
          )
          AND s.user_id = $3
          AND (
            e.event_name IN ('purchase', 'conversion', 'checkout_complete')
            OR e.url_path LIKE '%/thank%'
            OR e.url_path LIKE '%/success%'
          )
        )
        SELECT 
          wa.timestamp as wa_time,
          web.timestamp as web_time,
          EXTRACT(EPOCH FROM (web.timestamp - wa.timestamp)) / 3600 as hours_diff
        FROM wa_conversions wa
        CROSS JOIN web_conversions web
        WHERE ABS(EXTRACT(EPOCH FROM (web.timestamp - wa.timestamp))) < 86400 * 7
        ORDER BY ABS(EXTRACT(EPOCH FROM (web.timestamp - wa.timestamp)))
        LIMIT 10;
      `;

      const result = await executeWithContext<{
        wa_time: Date;
        web_time: Date;
        hours_diff: number;
      }>(context, conversionQuery, [context.teamId, waPhone, umamiUserId]);

      if (result.rows.length === 0) {
        return null;
      }

      // Calculate alignment score based on timing proximity
      const avgHoursDiff =
        result.rows.reduce((sum, r) => sum + Math.abs(r.hours_diff), 0) / result.rows.length;

      // Closer timing = higher score
      const similarityScore = Math.max(0, 1 - avgHoursDiff / 168); // 168 hours = 1 week

      return {
        matched: true,
        umamiUserId,
        patternType: 'conversion',
        similarityScore,
        quality: similarityScore * 0.7, // Good indicator if conversions align
        metadata: {
          conversionCount: result.rows.length,
          avgHoursDiff,
          conversions: result.rows,
        },
      };
    } catch (error) {
      logger.error('correlation', 'Conversion alignment analysis failed', error as Error);
      return null;
    }
  }

  /**
   * Create correlation evidence from behavioral matches
   */
  createEvidence(matches: BehavioralMatchResult[]): CorrelationEvidence {
    if (matches.length === 0) {
      return {
        method: 'ml_model',
        matched: false,
        weight: 0.6,
      };
    }

    const bestMatch = matches.reduce((best, current) =>
      current.quality > best.quality ? current : best,
    );

    return {
      method: 'ml_model',
      matched: true,
      weight: 0.6,
      quality: bestMatch.quality,
      data: {
        matchCount: matches.length,
        bestMatch,
        patternTypes: [...new Set(matches.map(m => m.patternType))],
        avgSimilarity: matches.reduce((sum, m) => sum + m.similarityScore, 0) / matches.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Clear behavioral cache for team
   */
  async clearCache(context: TenantContext): Promise<void> {
    const pattern = `${this.cacheKeyPrefix}:*:${context.teamId}:*`;
    await cache.deletePattern(pattern);

    logger.info('correlation', 'Behavioral match cache cleared', {
      teamId: context.teamId,
    });
  }
}

/**
 * Create behavioral matcher instance
 */
export function createBehavioralMatcher(): BehavioralMatcher {
  return new BehavioralMatcher();
}

// Export default instance
export default createBehavioralMatcher();
