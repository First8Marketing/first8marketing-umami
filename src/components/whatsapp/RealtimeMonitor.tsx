'use client';

/**
 * Real-Time Monitor Component
 * Displays live activity, metrics, and alerts (Foundation for Phase 8 WebSocket integration)
 */

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useRealTimeConnection } from '@/store/whatsapp';
import type { WhatsAppEvent } from '@/types/whatsapp';

interface RealtimeMonitorProps {
  teamId: string;
}

export function RealtimeMonitor({ teamId }: RealtimeMonitorProps) {
  const { connected, status } = useRealTimeConnection();
  const [recentEvents, _setRecentEvents] = useState<WhatsAppEvent[]>([]);
  const [alerts, _setAlerts] = useState<any[]>([]);

  // Phase 8: WebSocket connection will populate these states
  useEffect(() => {
    // TODO: Phase 8 - Connect to WebSocket
    // const socket = connectWebSocket(teamId);
    // socket.on('activity_event', (event) => {
    //   setRecentEvents(prev => [event, ...prev].slice(0, 20));
    // });
    // socket.on('alert', (alert) => {
    //   setAlerts(prev => [alert, ...prev]);
    // });
  }, [teamId]);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div
        className={`rounded-lg p-4 border-l-4 ${connected ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-4 w-4 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
            />
            <span className="font-semibold">
              {connected ? 'Real-Time Connected' : 'Real-Time Disconnected'}
            </span>
          </div>
          <span className="text-sm text-gray-600">
            Last update: {new Date(status.lastUpdate).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <LiveMetricCard title="Active Sessions" value={status.activeSessions} icon="📱" />
        <LiveMetricCard title="Active Conversations" value={status.activeConversations} icon="💬" />
        <LiveMetricCard
          title="Messages/Minute"
          value={status.messagesPerMinute.toFixed(1)}
          icon="📊"
        />
        <LiveMetricCard
          title="Connection"
          value={connected ? 'Online' : 'Offline'}
          icon={connected ? '✅' : '❌'}
        />
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <div className="bg-yellow-50 rounded-lg p-4 border-l-4 border-yellow-500">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Active Alerts</h3>
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div key={index} className="text-sm text-yellow-700">
                • {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>

        {recentEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📡</div>
            <p>Waiting for real-time events...</p>
            <p className="text-sm mt-1">WebSocket integration available in Phase 8</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentEvents.map(event => (
              <ActivityItem key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Agent Status (Placeholder for Phase 8) */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Team Status</h3>
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">👥</div>
          <p>Agent status tracking available in Phase 8</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Live Metric Card
 */
function LiveMetricCard({ title, value, icon }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      </div>
      <div className="text-sm text-gray-600">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

/**
 * Activity Feed Item
 */
function ActivityItem({ event }: { event: WhatsAppEvent }) {
  const eventIcons = {
    message_sent: '📤',
    message_received: '📥',
    message_read: '✓✓',
    message_delivered: '✓',
    reaction_added: '❤️',
    session_status: '📱',
    qr_code: '📲',
    authenticated: '✅',
    disconnected: '❌',
  };

  const icon = eventIcons[event.eventType as keyof typeof eventIcons] || '•';

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium capitalize">{event.eventType.replace(/_/g, ' ')}</div>
        <div className="text-xs text-gray-500 mt-1">
          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}
