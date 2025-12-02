/**
 * WhatsApp Analytics Integration - Logging Utilities
 *
 * Structured logging for WhatsApp operations with tenant context.
 * Supports multiple log levels and formats.
 */

/* eslint-disable no-console */
// Console statements are intentional here - this is the logger implementation
// that outputs to the actual console. Other files should import and use this logger.

import debug from 'debug';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import type { TenantContext } from '@/types/whatsapp';

/**
 * Log level enum
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  context?: TenantContext;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * WhatsApp logger class
 */
class WhatsAppLogger {
  private debugLog = debug('umami:whatsapp');
  private logLevel: LogLevel;
  private structured: boolean;
  private tenantContext?: TenantContext;

  constructor() {
    const config = getWhatsAppConfig();
    this.logLevel = this.parseLogLevel(config.logLevel);
    this.structured = config.logStructured;
  }

  /**
   * Parse log level string to enum
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Set tenant context for subsequent logs
   */
  setContext(context: TenantContext): void {
    this.tenantContext = context;
  }

  /**
   * Clear tenant context
   */
  clearContext(): void {
    this.tenantContext = undefined;
  }

  /**
   * Create log entry object
   */
  private createLogEntry(
    level: string,
    module: string,
    message: string,
    metadata?: Record<string, any>,
    error?: Error,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
    };

    if (this.tenantContext) {
      entry.context = this.tenantContext;
    }

    if (metadata) {
      entry.metadata = metadata;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * Format log message
   */
  private formatMessage(entry: LogEntry): string {
    if (this.structured) {
      return JSON.stringify(entry);
    }

    const parts = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`, `[${entry.module}]`];

    if (entry.context?.teamId) {
      parts.push(`[Team:${entry.context.teamId.substring(0, 8)}]`);
    }

    parts.push(entry.message);

    if (entry.metadata) {
      parts.push(JSON.stringify(entry.metadata));
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\nStack: ${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Write log to output
   */
  private write(entry: LogEntry): void {
    const message = this.formatMessage(entry);

    // Use debug module for all logs
    this.debugLog(message);

    // Also write to console for important levels
    if (entry.level === 'ERROR') {
      console.error(message);
    } else if (entry.level === 'WARN') {
      console.warn(message);
    } else if (entry.level === 'INFO' && !this.structured) {
      console.log(message);
    }
  }

  /**
   * Check if log level should be written
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  /**
   * Debug level logging
   */
  debug(module: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry('DEBUG', module, message, metadata);
    this.write(entry);
  }

  /**
   * Info level logging
   */
  info(module: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry = this.createLogEntry('INFO', module, message, metadata);
    this.write(entry);
  }

  /**
   * Warning level logging
   */
  warn(module: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry = this.createLogEntry('WARN', module, message, metadata);
    this.write(entry);
  }

  /**
   * Error level logging
   */
  error(module: string, message: string, error?: Error, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry = this.createLogEntry('ERROR', module, message, metadata, error);
    this.write(entry);
  }

  /**
   * Log session events
   */
  logSession(event: string, sessionId: string, metadata?: Record<string, any>): void {
    this.info('session', `Session ${event}`, {
      sessionId,
      ...metadata,
    });
  }

  /**
   * Log message events
   */
  logMessage(event: string, messageId: string, metadata?: Record<string, any>): void {
    this.info('message', `Message ${event}`, {
      messageId,
      ...metadata,
    });
  }

  /**
   * Log authentication events
   */
  logAuth(event: string, userId?: string, metadata?: Record<string, any>): void {
    this.info('auth', `Auth ${event}`, {
      userId,
      ...metadata,
    });
  }

  /**
   * Log database operations
   */
  logDatabase(operation: string, table: string, metadata?: Record<string, any>): void {
    this.debug('database', `DB ${operation} on ${table}`, metadata);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.debug('performance', `${operation} took ${duration}ms`, metadata);
  }

  /**
   * Log audit trail
   */
  logAudit(
    action: string,
    resource: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): void {
    this.info('audit', `${action} on ${resource}`, {
      userId,
      ...metadata,
    });
  }

  /**
   * Create a child logger with tenant context
   */
  withContext(context: TenantContext): WhatsAppLogger {
    const logger = new WhatsAppLogger();
    logger.setContext(context);
    return logger;
  }
}

/**
 * Singleton logger instance
 */
let loggerInstance: WhatsAppLogger | null = null;

/**
 * Get logger instance
 */
export function getLogger(): WhatsAppLogger {
  if (!loggerInstance) {
    loggerInstance = new WhatsAppLogger();
  }
  return loggerInstance;
}

/**
 * Create logger with tenant context
 */
export function createLogger(context: TenantContext): WhatsAppLogger {
  return getLogger().withContext(context);
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: WhatsAppLogger;
  private operation: string;

  constructor(logger: WhatsAppLogger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();
  }

  /**
   * End timer and log duration
   */
  end(metadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    this.logger.logPerformance(this.operation, duration, metadata);
    return duration;
  }
}

/**
 * Create performance timer
 */
export function createTimer(operation: string, logger?: WhatsAppLogger): PerformanceTimer {
  return new PerformanceTimer(logger || getLogger(), operation);
}

/**
 * Utility function to measure async operation
 */
export async function measureAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  logger?: WhatsAppLogger,
): Promise<T> {
  const timer = createTimer(operation, logger);
  try {
    const result = await fn();
    timer.end({ success: true });
    return result;
  } catch (error) {
    timer.end({ success: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// Export singleton logger
export default getLogger;
