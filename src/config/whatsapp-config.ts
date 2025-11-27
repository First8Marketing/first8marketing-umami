/**
 * WhatsApp Analytics Integration - Configuration Management
 *
 * Centralized configuration loading and validation for WhatsApp integration.
 * All environment variables are loaded from .env.whatsapp
 */

import type { WhatsAppConfig } from '@/types/whatsapp';

/**
 * Parse boolean environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse array environment variable (comma-separated)
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

/**
 * Load and validate WhatsApp configuration from environment variables
 */
export function loadWhatsAppConfig(): WhatsAppConfig {
  // Session configuration
  const sessionPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
  const backupInterval = parseInteger(process.env.WHATSAPP_BACKUP_INTERVAL, 300000);
  const maxRetries = parseInteger(process.env.WHATSAPP_MAX_RETRIES, 5);
  const sessionTimeout = parseInteger(process.env.WHATSAPP_SESSION_TIMEOUT, 3600000);
  const headless = parseBoolean(process.env.WHATSAPP_HEADLESS, true);

  // Redis configuration
  const redisUrl =
    process.env.WHATSAPP_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';
  const redisPrefix = process.env.WHATSAPP_REDIS_PREFIX || 'whatsapp:';
  const redisTtl = parseInteger(process.env.WHATSAPP_REDIS_TTL, 86400);
  const redisPersistence = parseBoolean(process.env.WHATSAPP_REDIS_PERSISTENCE, true);

  // WebSocket configuration
  const wsPort = parseInteger(process.env.WHATSAPP_WS_PORT, 3002);
  const wsPath = process.env.WHATSAPP_WS_PATH || '/whatsapp';
  const wsCors = parseArray(process.env.WHATSAPP_WS_CORS, [
    'http://localhost:3001',
    'http://localhost:3000',
  ]);
  const wsPingInterval = parseInteger(process.env.WHATSAPP_WS_PING_INTERVAL, 25000);
  const wsPingTimeout = parseInteger(process.env.WHATSAPP_WS_PING_TIMEOUT, 60000);

  // Rate limiting configuration
  const rateLimitSession = parseInteger(process.env.WHATSAPP_RATE_LIMIT_SESSION, 10);
  const rateLimitMessage = parseInteger(process.env.WHATSAPP_RATE_LIMIT_MESSAGE, 60);
  const rateLimitAnalytics = parseInteger(process.env.WHATSAPP_RATE_LIMIT_ANALYTICS, 100);
  const rateLimitWebhook = parseInteger(process.env.WHATSAPP_RATE_LIMIT_WEBHOOK, 1000);

  // Database configuration
  const dbPoolMin = parseInteger(process.env.WHATSAPP_DB_POOL_MIN, 5);
  const dbPoolMax = parseInteger(process.env.WHATSAPP_DB_POOL_MAX, 50);
  const dbIdleTimeout = parseInteger(process.env.WHATSAPP_DB_IDLE_TIMEOUT, 10000);
  const dbConnectionTimeout = parseInteger(process.env.WHATSAPP_DB_CONNECTION_TIMEOUT, 5000);
  const dbLogQueries = parseBoolean(process.env.WHATSAPP_DB_LOG_QUERIES, false);

  // Security configuration
  const encryptionKey = process.env.WHATSAPP_ENCRYPTION_KEY;
  const jwtSecret = process.env.WHATSAPP_JWT_SECRET || process.env.APP_SECRET;
  const encryptMessages = parseBoolean(process.env.WHATSAPP_ENCRYPT_MESSAGES, false);
  const encryptionAlgo = process.env.WHATSAPP_ENCRYPTION_ALGO || 'aes-256-gcm';

  // Logging configuration
  const logLevel = (process.env.WHATSAPP_LOG_LEVEL || 'info') as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error';
  const logStructured = parseBoolean(process.env.WHATSAPP_LOG_STRUCTURED, false);
  const logFile = process.env.WHATSAPP_LOG_FILE;
  const logMaxSize = parseInteger(process.env.WHATSAPP_LOG_MAX_SIZE, 100);
  const logMaxFiles = parseInteger(process.env.WHATSAPP_LOG_MAX_FILES, 10);

  // Feature flags
  const enableQrAuth = parseBoolean(process.env.WHATSAPP_ENABLE_QR_AUTH, true);
  const enableReactions = parseBoolean(process.env.WHATSAPP_ENABLE_REACTIONS, true);
  const enableStatus = parseBoolean(process.env.WHATSAPP_ENABLE_STATUS, true);
  const enableGroups = parseBoolean(process.env.WHATSAPP_ENABLE_GROUPS, true);
  const enableCalls = parseBoolean(process.env.WHATSAPP_ENABLE_CALLS, true);
  const enableAutoReconnect = parseBoolean(process.env.WHATSAPP_ENABLE_AUTO_RECONNECT, true);

  // Performance configuration
  const maxSessions = parseInteger(process.env.WHATSAPP_MAX_SESSIONS, 50);
  const eventBatchSize = parseInteger(process.env.WHATSAPP_EVENT_BATCH_SIZE, 100);
  const eventProcessInterval = parseInteger(process.env.WHATSAPP_EVENT_PROCESS_INTERVAL, 1000);
  const archiveDays = parseInteger(process.env.WHATSAPP_ARCHIVE_DAYS, 180);

  // Development configuration
  const debug = parseBoolean(process.env.WHATSAPP_DEBUG, false);
  const devMode = parseBoolean(process.env.WHATSAPP_DEV_MODE, false);
  const devtools = parseBoolean(process.env.WHATSAPP_DEVTOOLS, false);

  // Integration configuration
  const databaseUrl = process.env.WHATSAPP_DATABASE_URL || process.env.DATABASE_URL;
  const enforceTeamIsolation = parseBoolean(process.env.WHATSAPP_ENFORCE_TEAM_ISOLATION, true);
  const correlationThreshold = parseFloat(process.env.WHATSAPP_CORRELATION_THRESHOLD || '0.70');
  const enableManualVerification = parseBoolean(
    process.env.WHATSAPP_ENABLE_MANUAL_VERIFICATION,
    true,
  );

  return {
    // Session
    sessionPath,
    backupInterval,
    maxRetries,
    sessionTimeout,
    headless,

    // Redis
    redisUrl,
    redisPrefix,
    redisTtl,
    redisPersistence,

    // WebSocket
    wsPort,
    wsPath,
    wsCors,
    wsPingInterval,
    wsPingTimeout,

    // Rate Limiting
    rateLimitSession,
    rateLimitMessage,
    rateLimitAnalytics,
    rateLimitWebhook,

    // Database
    dbPoolMin,
    dbPoolMax,
    dbIdleTimeout,
    dbConnectionTimeout,
    dbLogQueries,

    // Security
    encryptionKey,
    jwtSecret,
    encryptMessages,
    encryptionAlgo,

    // Logging
    logLevel,
    logStructured,
    logFile,
    logMaxSize,
    logMaxFiles,

    // Features
    enableQrAuth,
    enableReactions,
    enableStatus,
    enableGroups,
    enableCalls,
    enableAutoReconnect,

    // Performance
    maxSessions,
    eventBatchSize,
    eventProcessInterval,
    archiveDays,

    // Development
    debug,
    devMode,
    devtools,

    // Integration
    databaseUrl,
    enforceTeamIsolation,
    correlationThreshold,
    enableManualVerification,
  };
}

/**
 * Validate configuration
 * Throws error if required configuration is missing or invalid
 */
export function validateWhatsAppConfig(config: WhatsAppConfig): void {
  const errors: string[] = [];

  // Validate Redis URL
  if (!config.redisUrl) {
    errors.push('WHATSAPP_REDIS_URL or REDIS_URL is required');
  }

  // Validate backup interval
  if (config.backupInterval < 60000) {
    errors.push('WHATSAPP_BACKUP_INTERVAL must be at least 60000ms (1 minute)');
  }

  // Validate pool sizes
  if (config.dbPoolMin < 1) {
    errors.push('WHATSAPP_DB_POOL_MIN must be at least 1');
  }
  if (config.dbPoolMax < config.dbPoolMin) {
    errors.push('WHATSAPP_DB_POOL_MAX must be greater than or equal to WHATSAPP_DB_POOL_MIN');
  }

  // Validate correlation threshold
  if (config.correlationThreshold < 0 || config.correlationThreshold > 1) {
    errors.push('WHATSAPP_CORRELATION_THRESHOLD must be between 0.0 and 1.0');
  }

  // Validate max sessions
  if (config.maxSessions < 1 || config.maxSessions > 100) {
    errors.push('WHATSAPP_MAX_SESSIONS must be between 1 and 100');
  }

  // Validate encryption if enabled
  if (config.encryptMessages && !config.encryptionKey) {
    errors.push('WHATSAPP_ENCRYPTION_KEY is required when WHATSAPP_ENCRYPT_MESSAGES is true');
  }

  // Validate JWT secret
  if (!config.jwtSecret) {
    errors.push('WHATSAPP_JWT_SECRET or APP_SECRET is required');
  }

  if (errors.length > 0) {
    throw new Error(`WhatsApp configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Singleton configuration instance
 */
let configInstance: WhatsAppConfig | null = null;

/**
 * Get WhatsApp configuration (singleton)
 * Loads and validates configuration on first call
 */
export function getWhatsAppConfig(): WhatsAppConfig {
  if (!configInstance) {
    configInstance = loadWhatsAppConfig();
    validateWhatsAppConfig(configInstance);
  }
  return configInstance;
}

/**
 * Reset configuration (for testing purposes)
 */
export function resetWhatsAppConfig(): void {
  configInstance = null;
}

/**
 * Check if WhatsApp integration is enabled
 */
export function isWhatsAppEnabled(): boolean {
  try {
    const config = getWhatsAppConfig();
    return !!config.redisUrl;
  } catch {
    return false;
  }
}

/**
 * Get database connection URL
 */
export function getDatabaseUrl(): string {
  const config = getWhatsAppConfig();
  return config.databaseUrl || process.env.DATABASE_URL || '';
}

/**
 * Get Redis connection URL
 */
export function getRedisUrl(): string {
  const config = getWhatsAppConfig();
  return config.redisUrl;
}

/**
 * Get WebSocket configuration
 */
export function getWebSocketConfig() {
  const config = getWhatsAppConfig();
  return {
    port: config.wsPort,
    path: config.wsPath,
    cors: {
      origin: config.wsCors,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: config.wsPingInterval,
    pingTimeout: config.wsPingTimeout,
  };
}

/**
 * Get rate limit for specific endpoint type
 */
export function getRateLimit(type: 'session' | 'message' | 'analytics' | 'webhook'): number {
  const config = getWhatsAppConfig();
  switch (type) {
    case 'session':
      return config.rateLimitSession;
    case 'message':
      return config.rateLimitMessage;
    case 'analytics':
      return config.rateLimitAnalytics;
    case 'webhook':
      return config.rateLimitWebhook;
    default:
      return 100;
  }
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(
  feature: 'qrAuth' | 'reactions' | 'status' | 'groups' | 'calls' | 'autoReconnect',
): boolean {
  const config = getWhatsAppConfig();
  switch (feature) {
    case 'qrAuth':
      return config.enableQrAuth;
    case 'reactions':
      return config.enableReactions;
    case 'status':
      return config.enableStatus;
    case 'groups':
      return config.enableGroups;
    case 'calls':
      return config.enableCalls;
    case 'autoReconnect':
      return config.enableAutoReconnect;
    default:
      return false;
  }
}

// Export config instance
export default getWhatsAppConfig;
