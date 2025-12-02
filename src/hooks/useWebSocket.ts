/**
 * WhatsApp Analytics Integration - useWebSocket Hook
 *
 * React hook for managing WebSocket connections with automatic reconnection,
 * authentication, and event handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  WhatsAppWebSocketClient,
  ConnectionStatus,
  type WebSocketClientConfig,
} from '@/lib/whatsapp-websocket-client';
import { WebSocketEventType } from '@/lib/websocket-broadcaster';

/**
 * WebSocket hook configuration
 */
interface UseWebSocketConfig {
  teamId: string;
  authToken: string;
  url?: string;
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: string) => void;
}

/**
 * WebSocket hook return type
 */
interface UseWebSocketReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  socketId?: string;
  client: WhatsAppWebSocketClient | null;
  connect: () => void;
  disconnect: () => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback: (data: any) => void) => void;
  send: (event: string, data: any) => void;
}

/**
 * useWebSocket Hook
 *
 * Manages WebSocket connection lifecycle and provides event subscription
 */
export function useWebSocket(config: UseWebSocketConfig): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [socketId, setSocketId] = useState<string>();
  const clientRef = useRef<WhatsAppWebSocketClient | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  // Get WebSocket URL from environment or config
  const wsUrl = config.url || process.env.NEXT_PUBLIC_WS_URL || window.location.origin;

  /**
   * Initialize WebSocket client
   */
  useEffect(() => {
    if (!config.teamId || !config.authToken) {
      return;
    }

    const clientConfig: WebSocketClientConfig = {
      url: wsUrl,
      teamId: config.teamId,
      authToken: config.authToken,
      autoConnect: config.autoConnect ?? true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    };

    const client = new WhatsAppWebSocketClient(clientConfig);
    clientRef.current = client;

    // Setup internal event listeners
    client.on('connection', data => {
      setStatus(ConnectionStatus.CONNECTED);
      setSocketId(data.socketId);
      config.onConnect?.();
    });

    client.on('disconnection', data => {
      setStatus(ConnectionStatus.DISCONNECTED);
      setSocketId(undefined);
      config.onDisconnect?.(data.reason);
    });

    client.on('reconnecting', () => {
      setStatus(ConnectionStatus.RECONNECTING);
    });

    client.on('error', data => {
      setStatus(ConnectionStatus.ERROR);
      config.onError?.(data.error);
    });

    // Cleanup on unmount
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [config.teamId, config.authToken, wsUrl]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  /**
   * Subscribe to event
   */
  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (!clientRef.current) return;

    // Track listener for cleanup
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    // Register with client
    clientRef.current.on(event, callback);
  }, []);

  /**
   * Unsubscribe from event
   */
  const off = useCallback((event: string, callback: (data: any) => void) => {
    if (!clientRef.current) return;

    // Remove from tracking
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        listenersRef.current.delete(event);
      }
    }

    // Unregister from client
    clientRef.current.off(event, callback);
  }, []);

  /**
   * Send event to server
   */
  const send = useCallback((event: string, data: any) => {
    clientRef.current?.send(event, data);
  }, []);

  /**
   * Update status from client
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (clientRef.current) {
        const clientStatus = clientRef.current.getStatus();
        setStatus(clientStatus);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    status,
    isConnected: status === ConnectionStatus.CONNECTED,
    socketId,
    client: clientRef.current,
    connect,
    disconnect,
    on,
    off,
    send,
  };
}

/**
 * useWhatsAppEvents Hook
 *
 * Simplified hook for subscribing to specific WhatsApp events
 */
export function useWhatsAppEvents(
  wsClient: UseWebSocketReturn,
  handlers: Partial<Record<WebSocketEventType, (data: any) => void>>,
) {
  useEffect(() => {
    if (!wsClient.isConnected) return;

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      if (handler) {
        wsClient.on(event, handler);
      }
    });

    // Cleanup
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        if (handler) {
          wsClient.off(event, handler);
        }
      });
    };
  }, [wsClient.isConnected, handlers]);
}
