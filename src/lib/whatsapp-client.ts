/// <reference types="node" />
/**
 * WhatsApp Analytics Integration - Client Manager
 *
 * Core wrapper around whatsapp-web.js Client with RemoteAuth and Redis storage.
 * Handles client lifecycle, authentication, and connection management.
 */

import { Client, RemoteAuth, type ClientOptions } from 'whatsapp-web.js';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import { sessionStorage } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import {
  SessionNotFoundError,
  SessionDisconnectedError,
  InternalError,
} from '@/lib/whatsapp-errors';
import type { WhatsAppSessionStatus } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Redis-based RemoteAuth store implementation
 */
class RedisStore {
  async sessionExists(options: { session: string }): Promise<boolean> {
    try {
      return await sessionStorage.exists(options.session);
    } catch (error) {
      logger.error('redis-store', 'Failed to check session existence', error as Error);
      return false;
    }
  }

  async save(options: { session: string }): Promise<void> {
    try {
      // Session data is already saved in Redis by RemoteAuth
      logger.debug('redis-store', 'Session save requested', { session: options.session });
    } catch (error) {
      logger.error('redis-store', 'Failed to save session', error as Error);
      throw error;
    }
  }

  async extract(options: { session: string; path: string }): Promise<void> {
    try {
      // RemoteAuth handles extraction internally
      logger.debug('redis-store', 'Session extract requested', { session: options.session });
    } catch (error) {
      logger.error('redis-store', 'Failed to extract session', error as Error);
      throw error;
    }
  }

  async delete(options: { session: string }): Promise<void> {
    try {
      await sessionStorage.delete(options.session);
      logger.info('redis-store', 'Session deleted', { session: options.session });
    } catch (error) {
      logger.error('redis-store', 'Failed to delete session', error as Error);
      throw error;
    }
  }
}

/**
 * Client state interface
 */
interface ClientState {
  status: WhatsAppSessionStatus;
  lastSeen: Date;
  reconnectAttempts: number;
  isInitialized: boolean;
}

/**
 * WhatsApp client wrapper with lifecycle management
 */
export class WhatsAppClientManager {
  private client: Client | null = null;
  private state: ClientState;
  private sessionId: string;
  private teamId: string;
  private phoneNumber?: string;
  private config = getWhatsAppConfig();
  private reconnectTimer?: NodeJS.Timeout;
  /** Event handlers map with typed callback functions */
  private eventHandlers: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  constructor(sessionId: string, teamId: string, phoneNumber?: string) {
    this.sessionId = sessionId;
    this.teamId = teamId;
    this.phoneNumber = phoneNumber;
    this.state = {
      status: 'authenticating',
      lastSeen: new Date(),
      reconnectAttempts: 0,
      isInitialized: false,
    };
  }

  /**
   * Get current client status
   */
  getStatus(): WhatsAppSessionStatus {
    return this.state.status;
  }

  /**
   * Get client state
   */
  getState(): ClientState {
    return { ...this.state };
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.state.status === 'active' && this.client !== null;
  }

  /**
   * Get underlying WhatsApp client
   */
  getClient(): Client {
    if (!this.client) {
      throw new SessionNotFoundError(this.sessionId);
    }
    return this.client;
  }

  /**
   * Initialize WhatsApp client with RemoteAuth
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      logger.warn('client', 'Client already initialized', { sessionId: this.sessionId });
      return;
    }

    try {
      logger.info('client', 'Initializing WhatsApp client', {
        sessionId: this.sessionId,
        teamId: this.teamId,
      });

      // Create RemoteAuth strategy with Redis store
      const store = new RedisStore();
      const authStrategy = new RemoteAuth({
        clientId: this.sessionId,
        dataPath: this.config.sessionPath,
        store,
        backupSyncIntervalMs: this.config.backupInterval,
      });

      // Configure Puppeteer options
      const puppeteerOptions: ClientOptions['puppeteer'] = {
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      };

      // Create WhatsApp client
      this.client = new Client({
        authStrategy,
        puppeteer: puppeteerOptions,
        webVersionCache: {
          type: 'remote',
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
      });

      // Attach event handlers
      this.attachEventHandlers();

      // Initialize client
      await this.client.initialize();

      this.state.isInitialized = true;
      logger.info('client', 'WhatsApp client initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('client', 'Failed to initialize client', error as Error);
      this.state.status = 'failed';
      throw new InternalError('Failed to initialize WhatsApp client', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Attach event handlers to WhatsApp client
   */
  private attachEventHandlers(): void {
    if (!this.client) return;

    // QR code event
    this.client.on('qr', (qr: string) => {
      logger.info('client', 'QR code received', { sessionId: this.sessionId });
      this.state.status = 'authenticating';
      this.emit('qr', qr);
    });

    // Ready event
    this.client.on('ready', () => {
      logger.info('client', 'Client is ready', { sessionId: this.sessionId });
      this.state.status = 'active';
      this.state.lastSeen = new Date();
      this.state.reconnectAttempts = 0;
      this.emit('ready');
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      logger.info('client', 'Client authenticated', { sessionId: this.sessionId });
      this.emit('authenticated');
    });

    // Authentication failure event
    this.client.on('auth_failure', (msg: string) => {
      logger.error('client', 'Authentication failed', new Error(msg), {
        sessionId: this.sessionId,
      });
      this.state.status = 'failed';
      this.emit('auth_failure', msg);
    });

    // Disconnected event
    this.client.on('disconnected', (reason: string) => {
      logger.warn('client', 'Client disconnected', { sessionId: this.sessionId, reason });
      this.state.status = 'disconnected';
      this.emit('disconnected', reason);
      this.handleDisconnection();
    });

    // Message event
    this.client.on('message', (message: any) => {
      this.state.lastSeen = new Date();
      this.emit('message', message);
    });

    // Message create event (sent messages)
    this.client.on('message_create', (message: any) => {
      this.state.lastSeen = new Date();
      this.emit('message_create', message);
    });

    // Message acknowledgment event
    this.client.on('message_ack', (message: any, ack: number) => {
      this.emit('message_ack', message, ack);
    });

    // Message revoked event
    this.client.on('message_revoke_everyone', (after: any, before: any) => {
      this.emit('message_revoke_everyone', after, before);
    });

    // Connection state change
    this.client.on('change_state', (state: string) => {
      logger.debug('client', 'Connection state changed', { sessionId: this.sessionId, state });
      this.emit('change_state', state);
    });

    // Group events
    if (this.config.enableGroups) {
      this.client.on('group_join', (notification: any) => {
        this.emit('group_join', notification);
      });

      this.client.on('group_leave', (notification: any) => {
        this.emit('group_leave', notification);
      });

      this.client.on('group_update', (notification: any) => {
        this.emit('group_update', notification);
      });
    }

    // Call events
    if (this.config.enableCalls) {
      this.client.on('call', (call: any) => {
        this.emit('call', call);
      });
    }
  }

  /**
   * Handle client disconnection with auto-reconnect
   */
  private handleDisconnection(): void {
    if (!this.config.enableAutoReconnect) {
      return;
    }

    if (this.state.reconnectAttempts >= this.config.maxRetries) {
      logger.error('client', 'Max reconnection attempts exceeded', undefined, {
        sessionId: this.sessionId,
        attempts: this.state.reconnectAttempts,
      });
      this.state.status = 'failed';
      return;
    }

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts), 60000);
    this.state.reconnectAttempts++;

    logger.info('client', 'Scheduling reconnection', {
      sessionId: this.sessionId,
      attempt: this.state.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Reconnect to WhatsApp
   */
  private async reconnect(): Promise<void> {
    try {
      logger.info('client', 'Attempting to reconnect', { sessionId: this.sessionId });
      this.state.status = 'reconnecting';

      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }

      this.state.isInitialized = false;
      await this.initialize();
    } catch (error) {
      logger.error('client', 'Reconnection failed', error as Error);
      this.handleDisconnection();
    }
  }

  /**
   * Register event handler
   * @param event - The event name to listen for
   * @param handler - Callback function to execute when event fires
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Remove event handler
   * @param event - The event name to stop listening for
   * @param handler - The specific handler function to remove
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to registered handlers
   */
  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          logger.error('client', 'Event handler error', error as Error, { event });
        }
      });
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, message: string): Promise<any> {
    if (!this.isReady()) {
      throw new SessionDisconnectedError(this.sessionId);
    }

    try {
      const client = this.getClient();
      const result = await client.sendMessage(to, message);
      logger.info('client', 'Message sent', { sessionId: this.sessionId, to });
      return result;
    } catch (error) {
      logger.error('client', 'Failed to send message', error as Error);
      throw new InternalError('Failed to send message', {
        sessionId: this.sessionId,
        to,
      });
    }
  }

  /**
   * Get WhatsApp client info
   */
  async getInfo(): Promise<any> {
    if (!this.isReady()) {
      throw new SessionDisconnectedError(this.sessionId);
    }

    try {
      const client = this.getClient();
      const info = await client.info;
      return info;
    } catch (error) {
      logger.error('client', 'Failed to get client info', error as Error);
      throw new InternalError('Failed to get client info');
    }
  }

  /**
   * Logout and destroy session
   */
  async logout(): Promise<void> {
    try {
      logger.info('client', 'Logging out', { sessionId: this.sessionId });

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      if (this.client) {
        await this.client.logout();
        await this.client.destroy();
        this.client = null;
      }

      // Delete session from Redis
      await sessionStorage.delete(this.sessionId);

      this.state.status = 'disconnected';
      this.state.isInitialized = false;

      logger.info('client', 'Logged out successfully', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('client', 'Failed to logout', error as Error);
      throw new InternalError('Failed to logout', {
        sessionId: this.sessionId,
      });
    }
  }

  /**
   * Destroy client without logging out
   */
  async destroy(): Promise<void> {
    try {
      logger.info('client', 'Destroying client', { sessionId: this.sessionId });

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }

      this.state.status = 'disconnected';
      this.state.isInitialized = false;
      this.eventHandlers.clear();

      logger.info('client', 'Client destroyed', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('client', 'Failed to destroy client', error as Error);
      throw new InternalError('Failed to destroy client');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isReady()) {
        return false;
      }

      const client = this.getClient();
      const state = await client.getState();
      return state === 'CONNECTED';
    } catch (error) {
      logger.error('client', 'Health check failed', error as Error);
      return false;
    }
  }
}

/**
 * Create WhatsApp client manager
 */
export function createWhatsAppClient(
  sessionId: string,
  teamId: string,
  phoneNumber?: string,
): WhatsAppClientManager {
  return new WhatsAppClientManager(sessionId, teamId, phoneNumber);
}

export default WhatsAppClientManager;
