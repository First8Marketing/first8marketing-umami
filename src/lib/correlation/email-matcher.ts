/**
 * WhatsApp Analytics Integration - Email Matcher
 *
 * Matches WhatsApp users with umami analytics users by extracting and
 * matching email addresses, with domain-based similarity scoring.
 */

import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';
import type { CorrelationEvidence } from './confidence-scorer';

const logger = getLogger();

/**
 * Email match result
 */
export interface EmailMatchResult {
  matched: boolean;
  normalizedEmail: string;
  umamiUserId?: string;
  umamiSessionId?: string;
  matchSource: 'session_data' | 'event_data' | 'user_profile' | 'custom_property';
  quality: number; // 0.0-1.0
  domainSimilarity?: number;
  metadata?: Record<string, any>;
}

/**
 * Email validation options
 */
export interface EmailValidationOptions {
  allowSubdomains?: boolean;
  strictValidation?: boolean;
  extractFromText?: boolean;
}

/**
 * Email domain info
 */
interface DomainInfo {
  domain: string;
  subdomain?: string;
  tld: string;
  isCommon: boolean;
  isCorporate: boolean;
}

/**
 * Common free email providers
 */
const COMMON_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
]);

/**
 * Email regex pattern
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Email Matcher class
 */
export class EmailMatcher {
  private cacheKeyPrefix = 'email_match';
  private cacheTtl = 3600; // 1 hour

  /**
   * Validate email format
   */
  isValid(email: string, strict: boolean = true): boolean {
    if (!email) return false;

    // Basic format check
    const basicPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicPattern.test(email)) return false;

    if (strict) {
      // RFC 5322 compliant (simplified)
      const strictPattern =
        /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
      return strictPattern.test(email);
    }

    return true;
  }

  /**
   * Normalize email address
   */
  normalize(email: string): string | null {
    if (!email) return null;

    // Trim and lowercase
    let normalized = email.trim().toLowerCase();

    // Remove plus addressing (email+tag@domain.com -> email@domain.com)
    normalized = normalized.replace(/\+[^@]*@/, '@');

    // Remove dots from gmail addresses (gmail ignores dots)
    if (normalized.endsWith('@gmail.com')) {
      const [localPart, domain] = normalized.split('@');
      normalized = `${localPart.replace(/\./g, '')}@${domain}`;
    }

    // Validate
    if (!this.isValid(normalized, false)) {
      logger.warn('correlation', 'Invalid email format', { email: normalized });
      return null;
    }

    return normalized;
  }

  /**
   * Extract email addresses from text
   */
  extractEmails(text: string): string[] {
    if (!text) return [];

    const matches = text.match(EMAIL_PATTERN);
    if (!matches) return [];

    const emails = new Set<string>();
    for (const match of matches) {
      const normalized = this.normalize(match);
      if (normalized) {
        emails.add(normalized);
      }
    }

    return Array.from(emails);
  }

  /**
   * Parse domain information
   */
  private parseDomain(email: string): DomainInfo | null {
    const normalized = this.normalize(email);
    if (!normalized) return null;

    const [, domainPart] = normalized.split('@');
    if (!domainPart) return null;

    const parts = domainPart.split('.');
    if (parts.length < 2) return null;

    const tld = parts[parts.length - 1];
    const domain = parts.slice(-2).join('.');
    const subdomain = parts.length > 2 ? parts.slice(0, -2).join('.') : undefined;

    const isCommon = COMMON_PROVIDERS.has(domain);
    const isCorporate = !isCommon && parts.length <= 2;

    return {
      domain,
      subdomain,
      tld,
      isCommon,
      isCorporate,
    };
  }

  /**
   * Calculate domain similarity score
   */
  calculateDomainSimilarity(email1: string, email2: string): number {
    const domain1 = this.parseDomain(email1);
    const domain2 = this.parseDomain(email2);

    if (!domain1 || !domain2) return 0;

    // Exact domain match
    if (domain1.domain === domain2.domain) {
      // Same subdomain too
      if (domain1.subdomain === domain2.subdomain) {
        return 1.0;
      }
      // Same domain, different subdomain
      return 0.85;
    }

    // Same TLD
    if (domain1.tld === domain2.tld) {
      return 0.3;
    }

    return 0;
  }

  /**
   * Search umami database for email matches
   */
  async findMatches(
    context: TenantContext,
    email: string,
    _options: EmailValidationOptions = {},
  ): Promise<EmailMatchResult[]> {
    const normalizedEmail = this.normalize(email);
    if (!normalizedEmail) {
      return [];
    }

    // Check cache first
    const cacheKey = `${this.cacheKeyPrefix}:${context.teamId}:${normalizedEmail}`;
    const cached = await cache.get<EmailMatchResult[]>(cacheKey);
    if (cached) {
      logger.debug('correlation', 'Email match cache hit', { email: normalizedEmail });
      return cached;
    }

    const results: EmailMatchResult[] = [];

    try {
      // Search in session data
      const sessionMatches = await this.searchSessionData(context, normalizedEmail);
      results.push(...sessionMatches);

      // Search in event data
      const eventMatches = await this.searchEventData(context, normalizedEmail);
      results.push(...eventMatches);

      // Remove duplicates (same session_id)
      const uniqueResults = this.deduplicateResults(results);

      // Cache results
      await cache.set(cacheKey, uniqueResults, this.cacheTtl);

      logger.info('correlation', 'Email matches found', {
        email: normalizedEmail,
        matchCount: uniqueResults.length,
      });

      return uniqueResults;
    } catch (error) {
      logger.error('correlation', 'Email matching failed', error as Error, {
        email: normalizedEmail,
      });
      throw new DatabaseError('Email matching failed', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Search session data for email addresses
   */
  private async searchSessionData(
    context: TenantContext,
    email: string,
  ): Promise<EmailMatchResult[]> {
    const results: EmailMatchResult[] = [];

    // Case-insensitive email search in session data
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
        LOWER(s.data::text) LIKE LOWER($2)
        OR s.user_id IN (
          SELECT DISTINCT user_id
          FROM session
          WHERE LOWER(data::text) LIKE LOWER($2)
        )
      )
      AND s.created_at > NOW() - INTERVAL '90 days'
      ORDER BY s.created_at DESC
      LIMIT 100;
    `;

    const result = await executeWithContext<{
      session_id: string;
      user_id: string;
      session_data: any;
      created_at: Date;
    }>(context, query, [context.teamId, `%${email}%`]);

    for (const row of result.rows) {
      results.push({
        matched: true,
        normalizedEmail: email,
        umamiUserId: row.user_id,
        umamiSessionId: row.session_id,
        matchSource: 'session_data',
        quality: 0.95, // High quality for session data match
        metadata: {
          sessionData: row.session_data,
          timestamp: row.created_at,
        },
      });
    }

    return results;
  }

  /**
   * Search event data for email addresses
   */
  private async searchEventData(
    context: TenantContext,
    email: string,
  ): Promise<EmailMatchResult[]> {
    const results: EmailMatchResult[] = [];

    // Search in event custom properties
    const query = `
      SELECT DISTINCT
        e.event_id,
        e.session_id,
        e.url_path,
        e.event_name,
        ed.data_key,
        ed.string_value,
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
      AND ed.data_type = 'string'
      AND LOWER(ed.string_value) = LOWER($2)
      AND e.created_at > NOW() - INTERVAL '90 days'
      ORDER BY e.created_at DESC
      LIMIT 100;
    `;

    const result = await executeWithContext<{
      event_id: string;
      session_id: string;
      url_path: string;
      event_name: string;
      data_key: string;
      string_value: string;
      user_id: string;
      created_at: Date;
    }>(context, query, [context.teamId, email]);

    for (const row of result.rows) {
      // Calculate quality based on context
      const quality = this.calculateEventMatchQuality(row.data_key, row.event_name);

      results.push({
        matched: true,
        normalizedEmail: email,
        umamiUserId: row.user_id,
        umamiSessionId: row.session_id,
        matchSource: row.data_key.includes('email') ? 'custom_property' : 'event_data',
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
   * Calculate match quality based on event context
   */
  private calculateEventMatchQuality(dataKey: string, eventName: string): number {
    const lowerKey = dataKey.toLowerCase();
    const lowerEvent = eventName.toLowerCase();

    // High quality: explicit email fields
    if (
      lowerKey === 'email' ||
      lowerKey === 'user_email' ||
      lowerKey === 'customer_email' ||
      lowerKey === 'contact_email'
    ) {
      return 0.95;
    }

    // Medium-high quality: email-related fields
    if (lowerKey.includes('email') || lowerKey.includes('mail')) {
      return 0.9;
    }

    // Medium quality: authentication/signup events
    if (
      lowerEvent.includes('signup') ||
      lowerEvent.includes('register') ||
      lowerEvent.includes('login') ||
      lowerEvent.includes('auth')
    ) {
      return 0.85;
    }

    // Medium quality: form/contact events
    if (
      lowerEvent.includes('contact') ||
      lowerEvent.includes('form') ||
      lowerEvent.includes('submit')
    ) {
      return 0.8;
    }

    // Lower quality: checkout/order events
    if (
      lowerEvent.includes('checkout') ||
      lowerEvent.includes('order') ||
      lowerEvent.includes('purchase')
    ) {
      return 0.75;
    }

    // Generic field
    return 0.7;
  }

  /**
   * Remove duplicate results (same session_id)
   */
  private deduplicateResults(results: EmailMatchResult[]): EmailMatchResult[] {
    const seen = new Map<string, EmailMatchResult>();

    for (const result of results) {
      const key = result.umamiSessionId || result.umamiUserId || '';
      if (!key) continue;

      const existing = seen.get(key);
      if (!existing || result.quality > existing.quality) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Find similar emails by domain
   */
  async findSimilarByDomain(context: TenantContext, email: string): Promise<EmailMatchResult[]> {
    const domainInfo = this.parseDomain(email);
    if (!domainInfo || domainInfo.isCommon) {
      // Don't search for similar emails from common providers
      return [];
    }

    const results: EmailMatchResult[] = [];

    try {
      // Search for other emails with same domain
      const query = `
        SELECT DISTINCT
          ed.string_value AS email,
          s.session_id,
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
        AND ed.data_type = 'string'
        AND ed.string_value LIKE $2
        AND e.created_at > NOW() - INTERVAL '90 days'
        LIMIT 50;
      `;

      const result = await executeWithContext<{
        email: string;
        session_id: string;
        user_id: string;
        created_at: Date;
      }>(context, query, [context.teamId, `%@${domainInfo.domain}`]);

      for (const row of result.rows) {
        const similarity = this.calculateDomainSimilarity(email, row.email);
        if (similarity > 0.5) {
          results.push({
            matched: true,
            normalizedEmail: this.normalize(row.email) || row.email,
            umamiUserId: row.user_id,
            umamiSessionId: row.session_id,
            matchSource: 'custom_property',
            quality: 0.7,
            domainSimilarity: similarity,
            metadata: {
              sourceEmail: email,
              timestamp: row.created_at,
            },
          });
        }
      }

      logger.info('correlation', 'Domain-similar emails found', {
        email,
        domain: domainInfo.domain,
        matchCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('correlation', 'Domain similarity search failed', error as Error);
      return [];
    }
  }

  /**
   * Create correlation evidence from matches
   */
  createEvidence(matches: EmailMatchResult[]): CorrelationEvidence {
    if (matches.length === 0) {
      return {
        method: 'email',
        matched: false,
        weight: 0.85,
      };
    }

    // Get highest quality match
    const bestMatch = matches.reduce((best, current) =>
      current.quality > best.quality ? current : best,
    );

    return {
      method: 'email',
      matched: true,
      weight: 0.85,
      quality: bestMatch.quality,
      data: {
        matchCount: matches.length,
        bestMatch: bestMatch,
        allMatches: matches,
        domainInfo: this.parseDomain(bestMatch.normalizedEmail),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Batch process multiple emails
   */
  async batchMatch(
    context: TenantContext,
    emails: string[],
    options: EmailValidationOptions = {},
  ): Promise<Map<string, EmailMatchResult[]>> {
    const results = new Map<string, EmailMatchResult[]>();

    // Process in parallel with limit
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const promises = batch.map(email =>
        this.findMatches(context, email, options)
          .then(matches => ({ email, matches }))
          .catch(error => {
            logger.error('correlation', 'Batch email match failed', error as Error, { email });
            return { email, matches: [] };
          }),
      );

      const batchResults = await Promise.all(promises);
      for (const { email, matches } of batchResults) {
        results.set(email, matches);
      }
    }

    logger.info('correlation', 'Batch email matching complete', {
      totalEmails: emails.length,
      matchedEmails: Array.from(results.values()).filter(m => m.length > 0).length,
    });

    return results;
  }

  /**
   * Clear email match cache for team
   */
  async clearCache(context: TenantContext): Promise<void> {
    const pattern = `${this.cacheKeyPrefix}:${context.teamId}:*`;
    await cache.deletePattern(pattern);

    logger.info('correlation', 'Email match cache cleared', {
      teamId: context.teamId,
    });
  }
}

/**
 * Create email matcher instance
 */
export function createEmailMatcher(): EmailMatcher {
  return new EmailMatcher();
}

// Export default instance
export default createEmailMatcher();
