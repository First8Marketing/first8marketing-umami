/**
 * WhatsApp Analytics Integration - useNotifications Hook
 *
 * React hook for managing notifications with real-time updates,
 * read/unread tracking, and user preferences.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WebSocketEventType } from '@/lib/websocket-broadcaster';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { UseWebSocketReturn } from './useWebSocket';

/**
 * Notification interface (client-side)
 */
export interface Notification {
  id: string;
  teamId: string;
  userId?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  read: boolean;
  dismissed: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Hook configuration
 */
interface UseNotificationsConfig {
  teamId: string;
  userId?: string;
  wsClient?: UseWebSocketReturn;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

/**
 * Hook return type
 */
interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * useNotifications Hook
 *
 * Manages notifications with real-time updates via WebSocket
 */
export function useNotifications(config: UseNotificationsConfig): UseNotificationsReturn {
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch notifications from API
  const {
    data: fetchedNotifications,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['whatsapp-notifications', config.teamId, config.userId],
    queryFn: async () => {
      const response = await whatsappApi.notifications.list({
        teamId: config.teamId,
        userId: config.userId,
        unreadOnly: false,
      });
      return response.data || [];
    },
    refetchInterval: config.autoRefresh ? config.refreshInterval || 30000 : false,
    enabled: !!config.teamId,
  });

  // Fetch unread count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['whatsapp-notifications-unread', config.teamId, config.userId],
    queryFn: async () => {
      const response = await whatsappApi.notifications.getUnreadCount({
        teamId: config.teamId,
        userId: config.userId,
      });
      return response.data?.count || 0;
    },
    refetchInterval: config.autoRefresh ? config.refreshInterval || 30000 : false,
    enabled: !!config.teamId,
  });

  // Update local state when data fetched
  useEffect(() => {
    if (fetchedNotifications) {
      setNotifications(fetchedNotifications);
    }
  }, [fetchedNotifications]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await whatsappApi.notifications.markAsRead(notificationId);
    },
    onSuccess: (_, notificationId) => {
      // Update local state
      setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)));

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications', config.teamId, config.userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications-unread', config.teamId, config.userId],
      });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await whatsappApi.notifications.markAllAsRead({
        teamId: config.teamId,
        userId: config.userId!,
      });
    },
    onSuccess: () => {
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications', config.teamId, config.userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications-unread', config.teamId, config.userId],
      });
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await whatsappApi.notifications.dismiss(notificationId);
    },
    onSuccess: (_, notificationId) => {
      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications', config.teamId, config.userId],
      });
    },
  });

  // Listen for real-time notification events via WebSocket
  useEffect(() => {
    if (!config.wsClient?.isConnected) return;

    const handleNotification = (data: Notification) => {
      // Add new notification to state
      setNotifications(prev => [data, ...prev]);

      // Invalidate unread count
      queryClient.invalidateQueries({
        queryKey: ['whatsapp-notifications-unread', config.teamId, config.userId],
      });
    };

    // Subscribe to notification events
    config.wsClient.on(WebSocketEventType.NOTIFICATION, handleNotification);
    config.wsClient.on(WebSocketEventType.ALERT, handleNotification);

    // Cleanup
    return () => {
      config.wsClient?.off(WebSocketEventType.NOTIFICATION, handleNotification);
      config.wsClient?.off(WebSocketEventType.ALERT, handleNotification);
    };
  }, [config.wsClient?.isConnected, config.teamId, config.userId, queryClient]);

  // Callback functions
  const markAsRead = useCallback(
    async (notificationId: string) => {
      await markAsReadMutation.mutateAsync(notificationId);
    },
    [markAsReadMutation],
  );

  const markAllAsRead = useCallback(async () => {
    if (!config.userId) return;
    await markAllAsReadMutation.mutateAsync();
  }, [config.userId, markAllAsReadMutation]);

  const dismiss = useCallback(
    async (notificationId: string) => {
      await dismissMutation.mutateAsync(notificationId);
    },
    [dismissMutation],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    dismiss,
    refresh,
  };
}

/**
 * useNotificationToast Hook
 *
 * Displays real-time notifications as toast messages
 */
export function useNotificationToast(wsClient?: UseWebSocketReturn) {
  const [toasts, setToasts] = useState<Notification[]>([]);

  useEffect(() => {
    if (!wsClient?.isConnected) return;

    const handleNotification = (notification: Notification) => {
      // Add to toast queue
      setToasts(prev => [...prev, notification]);

      // Auto-dismiss after 5 seconds for non-critical
      if (notification.priority !== 'critical') {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== notification.id));
        }, 5000);
      }
    };

    wsClient.on(WebSocketEventType.NOTIFICATION, handleNotification);
    wsClient.on(WebSocketEventType.ALERT, handleNotification);

    return () => {
      wsClient.off(WebSocketEventType.NOTIFICATION, handleNotification);
      wsClient.off(WebSocketEventType.ALERT, handleNotification);
    };
  }, [wsClient?.isConnected]);

  const dismissToast = useCallback((notificationId: string) => {
    setToasts(prev => prev.filter(t => t.id !== notificationId));
  }, []);

  return {
    toasts,
    dismissToast,
  };
}
