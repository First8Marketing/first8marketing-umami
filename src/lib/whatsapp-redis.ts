/**
 * WhatsApp Analytics Integration - Redis Connection Manager
 *
 * Redis client for session storage, caching, and pub/sub messaging.
 * Provides connection retry logic and utility functions.
 */

import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';

const logger = getLogger();
const REDIS_CLIENT = 'whatsapp_redis';

/**
 * Redis client instances
 */
let client: RedisClient | null = null;
let subscriber: RedisClient | null = null;
let publisher: RedisClient | null = null;

/**
 * Get Redis connection options
 */
function getRedisOptions(): RedisOptions {
  const config = getWhatsAppConfig();

  return {
    maxRetriesPerRequest: config.maxRetries,
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 1000, 60000);
      logger.debug('redis', `Retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      logger.error('redis', 'Redis connection error', err);
      // Reconnect on READONLY errors
      if (err.message.includes('READONLY')) {
        return true;
      }
      return false;
    },
  };
}

/**
 * Initialize Redis client
 */
function initializeClient(): RedisClient {
  if (client) {
    return client;
  }

  const config = getWhatsAppConfig();
  const options = getRedisOptions();

  client = new Redis(config.redisUrl, options);

  // Event handlers
  client.on('connect', () => {
    logger.info('redis', 'Redis client connected');
  });

  client.on('ready', () => {
    logger.info('redis', 'Redis client ready');
  });

  client.on('error', err => {
    logger.error('redis', 'Redis client error', err);
  });

  client.on('close', () => {
    logger.warn('redis', 'Redis client connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('redis', 'Redis client reconnecting');
  });

  // Store in global for dev mode
  if (process.env.NODE_ENV !== 'production') {
    globalThis[REDIS_CLIENT] = client;
  }

  logger.info('redis', 'Redis client initialized', {
    url: config.redisUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials
  });

  return client;
}

/**
 * Initialize subscriber client for pub/sub
 */
function initializeSubscriber(): RedisClient {
  if (subscriber) {
    return subscriber;
  }

  const config = getWhatsAppConfig();
  const options = getRedisOptions();

  subscriber = new Redis(config.redisUrl, options);

  subscriber.on('connect', () => {
    logger.info('redis', 'Redis subscriber connected');
  });

  subscriber.on('error', err => {
    logger.error('redis', 'Redis subscriber error', err);
  });

  return subscriber;
}

/**
 * Initialize publisher client for pub/sub
 */
function initializePublisher(): RedisClient {
  if (publisher) {
    return publisher;
  }

  const config = getWhatsAppConfig();
  const options = getRedisOptions();

  publisher = new Redis(config.redisUrl, options);

  publisher.on('connect', () => {
    logger.info('redis', 'Redis publisher connected');
  });

  publisher.on('error', err => {
    logger.error('redis', 'Redis publisher error', err);
  });

  return publisher;
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): RedisClient {
  if (!client) {
    return initializeClient();
  }
  return client;
}

/**
 * Get Redis subscriber instance
 */
export function getSubscriber(): RedisClient {
  if (!subscriber) {
    return initializeSubscriber();
  }
  return subscriber;
}

/**
 * Get Redis publisher instance
 */
export function getPublisher(): RedisClient {
  if (!publisher) {
    return initializePublisher();
  }
  return publisher;
}

/**
 * Build Redis key with prefix
 */
export function buildKey(...parts: string[]): string {
  const config = getWhatsAppConfig();
  return `${config.redisPrefix}${parts.join(':')}`;
}

/**
 * Session storage helpers
 */
export const sessionStorage = {
  /**
   * Save session data
   */
  async save(sessionId: string, data: any, ttl?: number): Promise<void> {
    const client = getRedisClient();
    const config = getWhatsAppConfig();
    const key = buildKey('session', sessionId);
    const value = JSON.stringify(data);

    if (ttl || config.redisTtl) {
      await client.setex(key, ttl || config.redisTtl, value);
    } else {
      await client.set(key, value);
    }

    logger.debug('redis', 'Session saved', { sessionId });
  },

  /**
   * Get session data
   */
  async get(sessionId: string): Promise<any | null> {
    const client = getRedisClient();
    const key = buildKey('session', sessionId);
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  },

  /**
   * Delete session data
   */
  async delete(sessionId: string): Promise<void> {
    const client = getRedisClient();
    const key = buildKey('session', sessionId);
    await client.del(key);

    logger.debug('redis', 'Session deleted', { sessionId });
  },

  /**
   * Check if session exists
   */
  async exists(sessionId: string): Promise<boolean> {
    const client = getRedisClient();
    const key = buildKey('session', sessionId);
    const result = await client.exists(key);
    return result === 1;
  },

  /**
   * Update session TTL
   */
  async refreshTtl(sessionId: string, ttl?: number): Promise<void> {
    const client = getRedisClient();
    const config = getWhatsAppConfig();
    const key = buildKey('session', sessionId);
    await client.expire(key, ttl || config.redisTtl);
  },
};

/**
 * Cache helpers
 */
export const cache = {
  /**
   * Get cached value
   */
  async get<T = any>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const fullKey = buildKey('cache', key);
    const data = await client.get(fullKey);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as T;
  },

  /**
   * Set cached value
   */
  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    const client = getRedisClient();
    const fullKey = buildKey('cache', key);
    const data = JSON.stringify(value);
    await client.setex(fullKey, ttl, data);
  },

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    const client = getRedisClient();
    const fullKey = buildKey('cache', key);
    await client.del(fullKey);
  },

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const client = getRedisClient();
    const fullPattern = buildKey('cache', pattern);
    const keys = await client.keys(fullPattern);

    if (keys.length === 0) {
      return 0;
    }

    return await client.del(...keys);
  },

  /**
   * Cache with automatic expiry
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl: number = 300): Promise<T> {
    const cached = await cache.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await cache.set(key, value, ttl);
    return value;
  },
};

/**
 * Rate limiting helpers
 */
export const rateLimit = {
  /**
   * Check and increment rate limit counter
   */
  async check(
    identifier: string,
    limit: number,
    windowSeconds: number = 60,
  ): Promise<{ allowed: boolean; remaining: number; reset: Date }> {
    const client = getRedisClient();
    const key = buildKey('ratelimit', identifier);
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // Use sorted set for sliding window
    await client.zremrangebyscore(key, 0, windowStart);
    const count = await client.zcard(key);

    if (count >= limit) {
      const oldestTimestamp = await client.zrange(key, 0, 0, 'WITHSCORES');
      const reset = new Date(parseInt(oldestTimestamp[1]) + windowSeconds * 1000);

      return {
        allowed: false,
        remaining: 0,
        reset,
      };
    }

    // Add current request
    await client.zadd(key, now, `${now}-${Math.random()}`);
    await client.expire(key, windowSeconds);

    return {
      allowed: true,
      remaining: limit - (count + 1),
      reset: new Date(now + windowSeconds * 1000),
    };
  },

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string): Promise<void> {
    const client = getRedisClient();
    const key = buildKey('ratelimit', identifier);
    await client.del(key);
  },
};

/**
 * Pub/Sub messaging helpers
 */
export const pubsub = {
  /**
   * Publish message to channel
   */
  async publish(channel: string, message: any): Promise<void> {
    const publisher = getPublisher();
    const fullChannel = buildKey('channel', channel);
    const data = JSON.stringify(message);

    await publisher.publish(fullChannel, data);

    logger.debug('redis', 'Message published', { channel, messageSize: data.length });
  },

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    const subscriber = getSubscriber();
    const fullChannel = buildKey('channel', channel);

    subscriber.subscribe(fullChannel, err => {
      if (err) {
        logger.error('redis', 'Subscription failed', err, { channel });
        throw new InternalError('Redis subscription failed');
      }
      logger.info('redis', 'Subscribed to channel', { channel });
    });

    subscriber.on('message', (ch, msg) => {
      if (ch === fullChannel) {
        try {
          const data = JSON.parse(msg);
          callback(data);
        } catch (error) {
          logger.error('redis', 'Failed to parse pub/sub message', error as Error);
        }
      }
    });
  },

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string): Promise<void> {
    const subscriber = getSubscriber();
    const fullChannel = buildKey('channel', channel);

    await subscriber.unsubscribe(fullChannel);
    logger.info('redis', 'Unsubscribed from channel', { channel });
  },
};

/**
 * Queue helpers for message processing
 */
export const queue = {
  /**
   * Push message to queue
   */
  async push(queueName: string, message: any): Promise<void> {
    const client = getRedisClient();
    const key = buildKey('queue', queueName);
    const data = JSON.stringify(message);

    await client.rpush(key, data);
  },

  /**
   * Pop message from queue (blocking)
   */
  async pop(queueName: string, timeout: number = 0): Promise<any | null> {
    const client = getRedisClient();
    const key = buildKey('queue', queueName);

    const result = await client.blpop(key, timeout);

    if (!result) {
      return null;
    }

    const [, data] = result;
    return JSON.parse(data);
  },

  /**
   * Get queue length
   */
  async length(queueName: string): Promise<number> {
    const client = getRedisClient();
    const key = buildKey('queue', queueName);
    return await client.llen(key);
  },

  /**
   * Clear queue
   */
  async clear(queueName: string): Promise<void> {
    const client = getRedisClient();
    const key = buildKey('queue', queueName);
    await client.del(key);
  },
};

/**
 * Check Redis connection health
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('redis', 'Connection health check failed', error as Error);
    return false;
  }
}

/**
 * Get Redis info
 */
export async function getInfo(): Promise<Record<string, string>> {
  try {
    const client = getRedisClient();
    const info = await client.info();

    // Parse info string into object
    const lines = info.split('\r\n');
    const result: Record<string, string> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    }

    return result;
  } catch (error) {
    logger.error('redis', 'Failed to get Redis info', error as Error);
    return {};
  }
}

/**
 * Close all Redis connections
 */
export async function closeConnections(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (client) {
    promises.push(
      client.quit().then(() => {
        client = null;
        logger.info('redis', 'Main client closed');
      }),
    );
  }

  if (subscriber) {
    promises.push(
      subscriber.quit().then(() => {
        subscriber = null;
        logger.info('redis', 'Subscriber client closed');
      }),
    );
  }

  if (publisher) {
    promises.push(
      publisher.quit().then(() => {
        publisher = null;
        logger.info('redis', 'Publisher client closed');
      }),
    );
  }

  await Promise.all(promises);
}

/**
 * Flush all WhatsApp keys (use with caution)
 */
export async function flushWhatsAppKeys(): Promise<number> {
  const client = getRedisClient();
  const config = getWhatsAppConfig();
  const pattern = `${config.redisPrefix}*`;

  const keys = await client.keys(pattern);

  if (keys.length === 0) {
    return 0;
  }

  return await client.del(...keys);
}

// Default export with all utilities
export default {
  getClient: getRedisClient,
  getSubscriber,
  getPublisher,
  buildKey,
  sessionStorage,
  cache,
  rateLimit,
  pubsub,
  queue,
  checkConnection,
  getInfo,
  closeConnections,
  flushWhatsAppKeys,
};
