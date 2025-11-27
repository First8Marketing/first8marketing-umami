/**
 * API Rate Limiter
 * Redis-based rate limiting for WhatsApp API endpoints
 */

import { getRedisClient } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';

const logger = getLogger();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// Rate limit configurations for different endpoint types
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  session: { windowMs: 60000, maxRequests: 10 }, // 10/min
  message: { windowMs: 60000, maxRequests: 60 }, // 60/min (WhatsApp limit)
  analytics: { windowMs: 60000, maxRequests: 30 }, // 30/min
  read: { windowMs: 60000, maxRequests: 120 }, // 120/min
  write: { windowMs: 60000, maxRequests: 30 }, // 30/min
  default: { windowMs: 60000, maxRequests: 60 }, // 60/min
};

/**
 * Check rate limit for a given key
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count current requests
    const currentCount = await redis.zcard(key);

    if (currentCount >= config.maxRequests) {
      // Get the oldest request timestamp
      const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetAt =
        oldestRequest.length > 0
          ? new Date(parseInt(oldestRequest[1]) + config.windowMs)
          : new Date(now + config.windowMs);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(config.windowMs / 1000));

    return {
      allowed: true,
      remaining: config.maxRequests - currentCount - 1,
      resetAt: new Date(now + config.windowMs),
    };
  } catch (error) {
    // If Redis is down, allow the request (fail open)
    logger.error(
      'rate-limiter',
      'Rate limit check failed',
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now + config.windowMs),
    };
  }
}

/**
 * Create a rate limit key for a team and endpoint
 */
export function createRateLimitKey(teamId: string, endpoint: string): string {
  return `ratelimit:${teamId}:${endpoint}`;
}

/**
 * Apply rate limiting to an API handler
 */
export async function applyRateLimit(
  teamId: string,
  endpoint: string,
  limitType: keyof typeof RATE_LIMITS = 'default',
): Promise<RateLimitResult> {
  const key = createRateLimitKey(teamId, endpoint);
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.default;

  return checkRateLimit(key, config);
}

/**
 * Get rate limit headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.remaining.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
  };
}
