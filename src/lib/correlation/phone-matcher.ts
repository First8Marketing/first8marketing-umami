/**
 * WhatsApp Analytics Integration - Phone Number Matcher
 *
 * Matches WhatsApp phone numbers with umami analytics users by normalizing
 * phone numbers and searching across multiple data sources.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';
import type { CorrelationEvidence } from './confidence-scorer';

const logger = getLogger();

/**
 * Phone number match result
 */
export interface PhoneMatchResult {
  matched: boolean;
  normalizedPhone: string;
  umamiUserId?: string;
  umamiSessionId?: string;
  matchSource: 'session_data' | 'event_data' | 'user_profile' | 'custom_property';
  quality: number; // 0.0-1.0
  metadata?: Record<string, any>;
}

/**
 * Phone normalization options
 */
export interface PhoneNormalizationOptions {
  defaultCountryCode?: string; // e.g., 'US', 'MY'
  stripFormatting?: boolean;
  validateFormat?: boolean;
}

/**
 * Phone number patterns for extraction
 */
const PHONE_PATTERNS = [
  // International format: +1234567890
  /\+\d{1,3}\d{7,14}/g,
  // With country code: (012) 345-6789
  /\(?\d{2,3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g,
  // Simple format: 0123456789
  /\b\d{10,15}\b/g,
];

/**
 * Phone Matcher class
 */
export class PhoneMatcher {
  private cacheKeyPrefix = 'phone_match';
  private cacheTtl = 3600; // 1 hour

  /**
   * Normalize phone number to E.164 format
   */
  normalize(phone: string, options: PhoneNormalizationOptions = {}): string | null {
    if (!phone) return null;

    let normalized = phone.trim();

    // Remove common formatting characters
    if (options.stripFormatting !== false) {
      normalized = normalized.replace(/[\s()+.-]/g, '');
    }

    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      // Add default country code if provided
      if (options.defaultCountryCode) {
        const countryCode = this.getCountryCode(options.defaultCountryCode);
        normalized = `+${countryCode}${normalized}`;
      } else if (normalized.startsWith('0')) {
        // Remove leading 0 (common in many countries)
        normalized = `+${normalized.substring(1)}`;
      } else {
        normalized = `+${normalized}`;
      }
    }

    // Validate format
    if (options.validateFormat !== false) {
      if (!/^\+\d{8,15}$/.test(normalized)) {
        logger.warn('correlation', 'Invalid phone number format', { phone: normalized });
        return null;
      }
    }

    return normalized;
  }

  /**
   * Get country calling code
   */
  private getCountryCode(countryCode: string): string {
    const codes: Record<string, string> = {
      US: '1',
      CA: '1',
      GB: '44',
      MY: '60',
      SG: '65',
      ID: '62',
      PH: '63',
      TH: '66',
      VN: '84',
      IN: '91',
      CN: '86',
      JP: '81',
      KR: '82',
      AU: '61',
      NZ: '64',
      // Add more as needed
    };

    return codes[countryCode.toUpperCase()] || '1';
  }

  /**
   * Extract phone numbers from text
   */
  extractPhones(text: string): string[] {
    if (!text) return [];

    const phones = new Set<string>();

    for (const pattern of PHONE_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = this.normalize(match);
          if (normalized) {
            phones.add(normalized);
          }
        });
      }
    }

    return Array.from(phones);
  }

  /**
   * Generate phone variations for fuzzy matching
   */
  private generateVariations(normalizedPhone: string): string[] {
    const variations = [normalizedPhone];

    // Remove + prefix
    if (normalizedPhone.startsWith('+')) {
      variations.push(normalizedPhone.substring(1));
    }

    // Add + prefix if missing
    if (!normalizedPhone.startsWith('+')) {
      variations.push(`+${normalizedPhone}`);
    }

    // Try with leading 0 (common in some countries)
    const withoutPlus = normalizedPhone.replace('+', '');
    if (withoutPlus.length > 0) {
      variations.push(`0${withoutPlus.substring(1)}`);
    }

    return [...new Set(variations)];
  }

  /**
   * Search umami database for phone number matches
   */
  async findMatches(
    context: TenantContext,
    phone: string,
    options: PhoneNormalizationOptions = {},
  ): Promise<PhoneMatchResult[]> {
    const normalizedPhone = this.normalize(phone, options);
    if (!normalizedPhone) {
      return [];
    }

    // Check cache first
    const cacheKey = `${this.cacheKeyPrefix}:${context.teamId}:${normalizedPhone}`;
    const cached = await cache.get<PhoneMatchResult[]>(cacheKey);
    if (cached) {
      logger.debug('correlation', 'Phone match cache hit', { phone: normalizedPhone });
      return cached;
    }

    const results: PhoneMatchResult[] = [];
    const variations = this.generateVariations(normalizedPhone);

    try {
      // Search in session metadata
      const sessionMatches = await this.searchSessionData(context, variations);
      results.push(...sessionMatches);

      // Search in event custom properties
      const eventMatches = await this.searchEventData(context, variations);
      results.push(...eventMatches);

      // Cache results
      await cache.set(cacheKey, results, this.cacheTtl);

      logger.info('correlation', 'Phone matches found', {
        phone: normalizedPhone,
        matchCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('correlation', 'Phone matching failed', error as Error, {
        phone: normalizedPhone,
      });
      throw new DatabaseError('Phone matching failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Search session data for phone numbers
   */
  private async searchSessionData(
    context: TenantContext,
    phoneVariations: string[],
  ): Promise<PhoneMatchResult[]> {
    const results: PhoneMatchResult[] = [];

    // Search in session metadata (stored as JSONB)
    const query = `
      SELECT DISTINCT
        s.session_id,
        s.user_id,
        s.data AS session_data,
        s.created_at
      FROM session s
      WHERE s.website_id IN (
        SELECT website_id 
        FROM website 
        WHERE team_id = $1
      )
      AND (
        s.data::text ILIKE ANY($2)
        OR s.user_id IN (
          SELECT DISTINCT user_id
          FROM session
          WHERE data::text ILIKE ANY($2)
        )
      )
      AND s.created_at > NOW() - INTERVAL '90 days'
      ORDER BY s.created_at DESC
      LIMIT 100;
    `;

    const searchPatterns = phoneVariations.map(v => `%${v}%`);

    const result = await executeWithContext<{
      session_id: string;
      user_id: string;
      session_data: any;
      created_at: Date;
    }>(context, query, [context.teamId, searchPatterns]);

    for (const row of result.rows) {
      results.push({
        matched: true,
        normalizedPhone: phoneVariations[0],
        umamiUserId: row.user_id,
        umamiSessionId: row.session_id,
        matchSource: 'session_data',
        quality: 0.95, // High quality for direct session data match
        metadata: {
          sessionData: row.session_data,
          timestamp: row.created_at,
        },
      });
    }

    return results;
  }

  /**
   * Search event data for phone numbers
   */
  private async searchEventData(
    context: TenantContext,
    phoneVariations: string[],
  ): Promise<PhoneMatchResult[]> {
    const results: PhoneMatchResult[] = [];

    // Search in event data (custom properties)
    const query = `
      SELECT DISTINCT
        e.event_id,
        e.session_id,
        e.url_path,
        e.event_name,
        ed.data_key,
        ed.string_value,
        ed.data_type,
        s.user_id,
        e.created_at
      FROM website_event e
      INNER JOIN event_data ed ON ed.event_id = e.event_id
      LEFT JOIN session s ON s.session_id = e.session_id
      WHERE e.website_id IN (
        SELECT website_id 
        FROM website 
        WHERE team_id = $1
      )
      AND (
        ed.string_value IN (
          SELECT unnest($2::text[])
        )
        OR ed.string_value ILIKE ANY($3)
      )
      AND e.created_at > NOW() - INTERVAL '90 days'
      ORDER BY e.created_at DESC
      LIMIT 100;
    `;

    const searchPatterns = phoneVariations.map(v => `%${v}%`);

    const result = await executeWithContext<{
      event_id: string;
      session_id: string;
      url_path: string;
      event_name: string;
      data_key: string;
      string_value: string;
      data_type: string;
      user_id: string;
      created_at: Date;
    }>(context, query, [context.teamId, phoneVariations, searchPatterns]);

    for (const row of result.rows) {
      // Calculate quality based on data key
      const quality = this.calculateEventMatchQuality(row.data_key, row.event_name);

      results.push({
        matched: true,
        normalizedPhone: phoneVariations[0],
        umamiUserId: row.user_id,
        umamiSessionId: row.session_id,
        matchSource: row.data_key.includes('phone') ? 'custom_property' : 'event_data',
        quality,
        metadata: {
          eventName: row.event_name,
          dataKey: row.data_key,
          urlPath: row.url_path,
          timestamp: row.created_at,
        },
      });
    }

    return results;
  }

  /**
   * Calculate match quality based on context
   */
  private calculateEventMatchQuality(dataKey: string, eventName: string): number {
    const lowerKey = dataKey.toLowerCase();
    const lowerEvent = eventName.toLowerCase();

    // High quality: explicit phone fields
    if (
      lowerKey.includes('phone') ||
      lowerKey.includes('mobile') ||
      lowerKey.includes('tel') ||
      lowerKey.includes('contact')
    ) {
      return 0.95;
    }

    // Medium-high quality: contact/form events
    if (
      lowerEvent.includes('contact') ||
      lowerEvent.includes('form') ||
      lowerEvent.includes('submit') ||
      lowerEvent.includes('signup') ||
      lowerEvent.includes('register')
    ) {
      return 0.85;
    }

    // Medium quality: checkout/payment events
    if (
      lowerEvent.includes('checkout') ||
      lowerEvent.includes('payment') ||
      lowerEvent.includes('order')
    ) {
      return 0.8;
    }

    // Lower quality: generic fields
    return 0.7;
  }

  /**
   * Create correlation evidence from matches
   */
  createEvidence(matches: PhoneMatchResult[]): CorrelationEvidence {
    if (matches.length === 0) {
      return {
        method: 'phone',
        matched: false,
        weight: 0.9,
      };
    }

    // Get highest quality match
    const bestMatch = matches.reduce((best, current) =>
      current.quality > best.quality ? current : best,
    );

    return {
      method: 'phone',
      matched: true,
      weight: 0.9,
      quality: bestMatch.quality,
      data: {
        matchCount: matches.length,
        bestMatch: bestMatch,
        allMatches: matches,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Batch process multiple phone numbers
   */
  async batchMatch(
    context: TenantContext,
    phones: string[],
    options: PhoneNormalizationOptions = {},
  ): Promise<Map<string, PhoneMatchResult[]>> {
    const results = new Map<string, PhoneMatchResult[]>();

    // Process in parallel with limit
    const batchSize = 10;
    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      const promises = batch.map(phone =>
        this.findMatches(context, phone, options)
          .then(matches => ({ phone, matches }))
          .catch(error => {
            logger.error('correlation', 'Batch phone match failed', error as Error, { phone });
            return { phone, matches: [] };
          }),
      );

      const batchResults = await Promise.all(promises);
      for (const { phone, matches } of batchResults) {
        results.set(phone, matches);
      }
    }

    logger.info('correlation', 'Batch phone matching complete', {
      totalPhones: phones.length,
      matchedPhones: Array.from(results.values()).filter(m => m.length > 0).length,
    });

    return results;
  }

  /**
   * Clear phone match cache for team
   */
  async clearCache(context: TenantContext): Promise<void> {
    const pattern = `${this.cacheKeyPrefix}:${context.teamId}:*`;
    await cache.deletePattern(pattern);

    logger.info('correlation', 'Phone match cache cleared', {
      teamId: context.teamId,
    });
  }
}

/**
 * Create phone matcher instance
 */
export function createPhoneMatcher(): PhoneMatcher {
  return new PhoneMatcher();
}

// Export default instance
export default createPhoneMatcher();
