/**
 * WhatsApp WebSocket Client
 * Handles real-time communication with WhatsApp backend via Socket.io
 * Phase 8: Real-time integration
 */

import { io, Socket } from 'socket.io-client';
import { useWhatsAppStore } from '@/store/whatsapp';
import { getLogger } from '@/lib/whatsapp-logger';
import type { WhatsAppMessage, WhatsAppSession, WhatsAppEvent } from '@/types/whatsapp';

const logger = getLogger();

// WebSocket singleton instance
let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

/**
 * WebSocket Event Handlers Interface
 */
export interface WebSocketEventHandlers {
  onMessageReceived?: (message: WhatsAppMessage) => void;
  onMessageSent?: (message: WhatsAppMessage) => void;
  onMessageRead?: (messageId: string) => void;
  onSessionStatus?: (session: WhatsAppSession) => void;
  onQRCode?: (data: { sessionId: string; qrCode: string }) => void;
  onAuthenticated?: (sessionId: string) => void;
  onDisconnected?: (sessionId: string) => void;
  onTyping?: (data: { chatId: string; isTyping: boolean }) => void;
  onError?: (error: any) => void;
}

/**
 * Connect to WhatsApp WebSocket server
 */
export function connectWhatsAppWebSocket(
  teamId: string,
  authToken: string,
  handlers: WebSocketEventHandlers = {},
): Socket {
  // Disconnect existing connection if any
  if (socket?.connected) {
    socket.disconnect();
  }

  // Determine WebSocket URL
  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : 'http://localhost:3000');

  // Create new connection
  socket = io(wsUrl, {
    auth: { token: authToken },
    query: { teamId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY,
    timeout: 10000,
  });

  // Connection Events
  socket.on('connect', () => {
    logger.info('websocket', 'WebSocket connected', { teamId });
    reconnectAttempts = 0;

    // Update global state
    useWhatsAppStore.getState().setConnected(true);
    useWhatsAppStore.getState().setRealTimeStatus({
      connected: true,
      activeSessions: 0,
      activeConversations: 0,
      messagesPerMinute: 0,
      lastUpdate: new Date().toISOString(),
    });
  });

  socket.on('disconnect', reason => {
    logger.info('websocket', 'WebSocket disconnected', { reason });
    useWhatsAppStore.getState().setConnected(false);
  });

  socket.on('connect_error', error => {
    logger.error(
      'websocket',
      'WebSocket connection error',
      error instanceof Error ? error : new Error(String(error)),
    );
    reconnectAttempts++;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('websocket', 'Max reconnection attempts reached');
      handlers.onError?.(error);
    }
  });

  socket.on('reconnect', attemptNumber => {
    logger.info('websocket', 'WebSocket reconnected', { attemptNumber });
    reconnectAttempts = 0;
  });

  // WhatsApp-specific Events

  // New message received
  socket.on('message:new', (message: WhatsAppMessage) => {
    logger.debug('websocket', 'New message received', {
      messageId: message.messageId,
      direction: message.direction,
    });

    if (message.direction === 'inbound') {
      useWhatsAppStore.getState().addRecentMessage(message);
      useWhatsAppStore.getState().incrementUnreadCount();
      handlers.onMessageReceived?.(message);
    } else {
      handlers.onMessageSent?.(message);
    }
  });

  // Message read status update
  socket.on('message:read', (data: { messageId: string; chatId: string }) => {
    logger.debug('websocket', 'Message marked as read', data);
    handlers.onMessageRead?.(data.messageId);
  });

  // Session status change
  socket.on('session:status', (session: WhatsAppSession) => {
    logger.debug('websocket', 'Session status update', {
      sessionId: session.sessionId,
      status: session.status,
    });
    useWhatsAppStore.getState().updateSession(session.sessionId, session);
    handlers.onSessionStatus?.(session);
  });

  // QR code update
  socket.on('session:qr', (data: { sessionId: string; qrCode: string }) => {
    logger.debug('websocket', 'QR code update', { sessionId: data.sessionId });
    handlers.onQRCode?.(data);
  });

  // Authentication success
  socket.on('session:authenticated', (data: { sessionId: string }) => {
    logger.info('websocket', 'Session authenticated', data);
    useWhatsAppStore.getState().updateSession(data.sessionId, { status: 'active' });
    handlers.onAuthenticated?.(data.sessionId);
  });

  // Session disconnected
  socket.on('session:disconnected', (data: { sessionId: string }) => {
    logger.info('websocket', 'Session disconnected', data);
    useWhatsAppStore.getState().updateSession(data.sessionId, { status: 'disconnected' });
    handlers.onDisconnected?.(data.sessionId);
  });

  // Typing indicator
  socket.on('chat:typing', (data: { chatId: string; isTyping: boolean; phone: string }) => {
    logger.debug('websocket', 'Typing indicator', data);
    handlers.onTyping?.(data);
  });

  // Real-time metrics update
  socket.on('metrics:update', (data: any) => {
    logger.debug('websocket', 'Metrics update', data);
    useWhatsAppStore.getState().setRealTimeStatus({
      connected: true,
      activeSessions: data.activeSessions || 0,
      activeConversations: data.activeConversations || 0,
      messagesPerMinute: data.messagesPerMinute || 0,
      lastUpdate: new Date().toISOString(),
    });
  });

  // Activity events (for real-time monitor)
  socket.on('activity:event', (event: WhatsAppEvent) => {
    logger.debug('websocket', 'Activity event', { eventType: event.type });
    // Could be handled by RealtimeMonitor component
  });

  // Error events
  socket.on('error', (error: any) => {
    logger.error(
      'websocket',
      'WebSocket error event',
      error instanceof Error ? error : new Error(String(error)),
    );
    handlers.onError?.(error);
  });

  return socket;
}

/**
 * Disconnect WebSocket
 */
export function disconnectWhatsAppWebSocket(): void {
  if (socket) {
    logger.info('websocket', 'Disconnecting WebSocket');
    socket.disconnect();
    socket = null;
    useWhatsAppStore.getState().setConnected(false);
  }
}

/**
 * Send message via WebSocket (for faster delivery)
 */
export function sendMessageViaWebSocket(
  sessionId: string,
  to: string,
  message: string,
  messageType: string = 'text',
): void {
  if (!socket?.connected) {
    throw new Error('WebSocket not connected');
  }

  socket.emit('message:send', {
    sessionId,
    to,
    message,
    messageType,
  });
}

/**
 * Mark message as read via WebSocket
 */
export function markMessageAsReadViaWebSocket(messageId: string): void {
  if (!socket?.connected) {
    throw new Error('WebSocket not connected');
  }

  socket.emit('message:mark_read', { messageId });
}

/**
 * Send typing indicator
 */
export function sendTypingIndicator(chatId: string, isTyping: boolean): void {
  if (!socket?.connected) {
    return; // Silently fail for typing indicators
  }

  socket.emit('chat:typing', { chatId, isTyping });
}

/**
 * Get WebSocket connection status
 */
export function getWebSocketStatus(): {
  connected: boolean;
  connecting: boolean;
} {
  return {
    connected: socket?.connected || false,
    connecting: socket?.connecting || false,
  };
}

/**
 * Custom React hook for WebSocket connection
 */
export function useWhatsAppWebSocket(
  teamId: string,
  authToken: string,
  handlers: WebSocketEventHandlers = {},
) {
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!teamId || !authToken) return;

    // Connect WebSocket
    const socket = connectWhatsAppWebSocket(teamId, authToken, {
      ...handlers,
      onError: err => {
        setError(err.message || 'WebSocket error');
        handlers.onError?.(err);
      },
    });

    // Update connection state
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Cleanup
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      disconnectWhatsAppWebSocket();
    };
  }, [teamId, authToken]);

  return {
    connected,
    error,
    disconnect: disconnectWhatsAppWebSocket,
  };
}

// Import React for the hook
import React from 'react';
