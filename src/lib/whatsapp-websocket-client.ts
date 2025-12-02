/// <reference types="node" />
/**
 * WhatsApp Analytics Integration - WebSocket Client
 *
 * Client-side WebSocket connection manager with auto-reconnection,
 * message queuing, and typed event handling.
 *
 * Note: Uses DragonflyDB-compatible Redis infrastructure for pub/sub.
 */

import { io, Socket } from 'socket.io-client';
import { getLogger } from '@/lib/whatsapp-logger';
import { WebSocketEventType } from '@/lib/websocket-broadcaster';

const logger = getLogger();

/**
 * Connection status
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Client configuration
 */
export interface WebSocketClientConfig {
  url: string;
  teamId: string;
  authToken: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
}

/**
 * Event listener callback
 */
type EventCallback = (data: any) => void;

/**
 * Message queue item
 */
interface QueuedMessage {
  event: string;
  data: any;
  timestamp: Date;
}

/**
 * WhatsApp WebSocket Client
 * Manages client-side WebSocket connection with automatic reconnection
 */
export class WhatsAppWebSocketClient {
  private socket: Socket | null = null;
  private config: WebSocketClientConfig;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongTime: Date | null = null;

  constructor(config: WebSocketClientConfig) {
    this.config = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
      ...config,
    };

    logger.debug('ws-client', 'Client created', {
      url: this.config.url,
      teamId: this.config.teamId,
    });

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      logger.warn('ws-client', 'Already connected');
      return;
    }

    this.status = ConnectionStatus.CONNECTING;

    try {
      this.socket = io(this.config.url, {
        auth: {
          token: this.config.authToken,
        },
        query: {
          teamId: this.config.teamId,
        },
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection manually
        timeout: this.config.timeout,
      });

      this.setupEventHandlers();

      logger.info('ws-client', 'Connecting to WebSocket', {
        url: this.config.url,
        teamId: this.config.teamId,
      });
    } catch (error) {
      logger.error('ws-client', 'Failed to create socket', error as Error);
      this.status = ConnectionStatus.ERROR;
      this.handleReconnect();
    }
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection successful
    this.socket.on('connect', () => {
      this.status = ConnectionStatus.CONNECTED;
      this.reconnectAttempts = 0;

      logger.info('ws-client', 'Connected to WebSocket', {
        socketId: this.socket?.id,
        teamId: this.config.teamId,
      });

      // Process queued messages
      this.processMessageQueue();

      // Start heartbeat
      this.startHeartbeat();

      // Emit connection event
      this.emit('connection', {
        status: this.status,
        socketId: this.socket?.id,
      });
    });

    // Connection confirmed with data from server
    this.socket.on('connected', data => {
      logger.debug('ws-client', 'Connection confirmed', data);
    });

    // Disconnection
    this.socket.on('disconnect', reason => {
      this.status = ConnectionStatus.DISCONNECTED;
      this.stopHeartbeat();

      logger.warn('ws-client', 'Disconnected from WebSocket', {
        reason,
        teamId: this.config.teamId,
      });

      this.emit('disconnection', { reason });

      // Handle reconnection if not intentional disconnect
      if (reason !== 'io client disconnect') {
        this.handleReconnect();
      }
    });

    // Connection error
    this.socket.on('connect_error', error => {
      this.status = ConnectionStatus.ERROR;

      logger.error('ws-client', 'Connection error', error as Error, {
        teamId: this.config.teamId,
      });

      this.emit('error', { error: error.message });

      this.handleReconnect();
    });

    // Heartbeat response
    this.socket.on('pong', data => {
      this.lastPongTime = new Date();
      logger.debug('ws-client', 'Pong received', data);
    });

    // Listen for all WhatsApp events
    Object.values(WebSocketEventType).forEach(eventType => {
      this.socket!.on(eventType, data => {
        this.handleEvent(eventType, data);
      });
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (!this.config.reconnection) {
      return;
    }

    if (this.reconnectAttempts >= this.config.reconnectionAttempts!) {
      logger.error('ws-client', 'Max reconnection attempts reached', undefined, {
        attempts: this.reconnectAttempts,
      });
      this.status = ConnectionStatus.ERROR;
      this.emit('reconnect_failed', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.status = ConnectionStatus.RECONNECTING;
    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.reconnectionDelay! * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectionDelayMax!,
    );

    logger.info('ws-client', 'Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      logger.info('ws-client', 'Attempting reconnection', {
        attempt: this.reconnectAttempts,
      });

      this.cleanup(false);
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');

        // Check if we received pong recently
        if (this.lastPongTime) {
          const timeSinceLastPong = Date.now() - this.lastPongTime.getTime();
          if (timeSinceLastPong > 30000) {
            // 30 seconds without pong
            logger.warn('ws-client', 'No pong received, connection might be stale');
          }
        }
      }
    }, 15000); // Ping every 15 seconds
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle incoming event
   */
  private handleEvent(event: string, data: any): void {
    logger.debug('ws-client', 'Event received', {
      event,
      dataKeys: Object.keys(data),
    });

    // Emit to all registered listeners for this event
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('ws-client', 'Error in event listener', error as Error, {
            event,
          });
        }
      });
    }

    // Also emit to wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback({ event, data });
        } catch (error) {
          logger.error('ws-client', 'Error in wildcard listener', error as Error);
        }
      });
    }
  }

  /**
   * Register event listener
   */
  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    logger.debug('ws-client', 'Listener registered', {
      event,
      listenerCount: this.listeners.get(event)!.size,
    });
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: EventCallback): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, data: any): void {
    this.handleEvent(event, data);
  }

  /**
   * Send message to server
   */
  send(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      logger.debug('ws-client', 'Message sent', { event });
    } else {
      // Queue message for later
      this.queueMessage(event, data);
    }
  }

  /**
   * Queue message for sending when connected
   */
  private queueMessage(event: string, data: any): void {
    this.messageQueue.push({
      event,
      data,
      timestamp: new Date(),
    });

    logger.debug('ws-client', 'Message queued', {
      event,
      queueSize: this.messageQueue.length,
    });

    // Limit queue size
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift();
      logger.warn('ws-client', 'Message queue full, dropping oldest message');
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    logger.info('ws-client', 'Processing message queue', {
      queueSize: this.messageQueue.length,
    });

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(({ event, data }) => {
      this.send(event, data);
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.cleanup(true);
  }

  /**
   * Cleanup resources
   */
  private cleanup(permanent: boolean): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    if (permanent) {
      this.listeners.clear();
      this.messageQueue = [];
      this.status = ConnectionStatus.DISCONNECTED;
      logger.info('ws-client', 'Client disconnected permanently');
    }
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED && this.socket?.connected === true;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

/**
 * Create WebSocket client instance
 */
export function createWebSocketClient(config: WebSocketClientConfig): WhatsAppWebSocketClient {
  return new WhatsAppWebSocketClient(config);
}
