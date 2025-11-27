'use client';

/**
 * WhatsApp Analytics Dashboard Page
 * Main overview page showing key metrics, real-time status, and quick actions
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/app';
import { useWhatsAppAnalytics } from '@/hooks/useWhatsAppAnalytics';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';
import { useWhatsAppStore } from '@/store/whatsapp';

export default function WhatsAppDashboard() {
  const router = useRouter();
  const { user } = useApp();

  // Get team ID from user context
  const teamId = user?.teamId || '';

  // Fetch sessions and metrics
  const { sessions, loading: sessionsLoading, error: sessionsError } = useWhatsAppSession(teamId);
  const { metrics, loading: metricsLoading, error: metricsError } = useWhatsAppAnalytics(teamId);
  const { connected, unreadCount } = useWhatsAppStore();

  useEffect(() => {
    // Redirect if no team
    if (!teamId && !sessionsLoading) {
      router.push('/settings/teams');
    }
  }, [teamId, sessionsLoading, router]);

  if (sessionsLoading || metricsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading WhatsApp dashboard...</p>
        </div>
      </div>
    );
  }

  if (sessionsError || metricsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error Loading Dashboard</div>
          <p className="text-gray-600">{sessionsError || metricsError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter(s => s.status === 'active');

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Analytics</h1>
          <p className="text-gray-600 mt-1">Monitor and analyze your WhatsApp communications</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/whatsapp/sessions')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage Sessions
          </button>
          <button
            onClick={() => router.push('/whatsapp/conversations')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            View Conversations
          </button>
        </div>
      </div>

      {/* Real-Time Status Bar */}
      <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="font-medium">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="text-gray-600">
              {activeSessions.length} Active Session{activeSessions.length !== 1 ? 's' : ''}
            </div>
            {unreadCount > 0 && (
              <div className="bg-red-500 text-white px-2 py-1 rounded-full text-sm">
                {unreadCount} Unread
              </div>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Messages"
          value={metrics?.totalMessages || 0}
          trend={metrics?.trend?.messages}
          icon="💬"
        />
        <MetricCard
          title="Active Conversations"
          value={metrics?.activeConversations || 0}
          subtitle={`of ${metrics?.totalConversations || 0} total`}
          icon="👥"
        />
        <MetricCard
          title="Avg Response Time"
          value={formatTime(metrics?.averageResponseTime || 0)}
          trend={metrics?.trend?.responseTime}
          icon="⏱️"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${(metrics?.conversionRate || 0).toFixed(1)}%`}
          icon="📈"
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Today" value={metrics?.messageVolumeToday || 0} label="messages" />
        <StatCard title="This Week" value={metrics?.messageVolumeThisWeek || 0} label="messages" />
        <StatCard
          title="This Month"
          value={metrics?.messageVolumeThisMonth || 0}
          label="messages"
        />
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">Real-time activity feed will appear here</p>
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">📊</div>
              <p>Activity monitoring available in Phase 8</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <QuickActionButton
              icon="➕"
              title="Create New Session"
              onClick={() => router.push('/whatsapp/sessions?action=create')}
            />
            <QuickActionButton
              icon="💬"
              title="View All Conversations"
              onClick={() => router.push('/whatsapp/conversations')}
            />
            <QuickActionButton
              icon="📊"
              title="Analytics & Reports"
              onClick={() => router.push('/whatsapp/analytics')}
            />
            <QuickActionButton
              icon="📥"
              title="Generate Report"
              onClick={() => router.push('/whatsapp/reports')}
            />
          </div>
        </div>
      </div>

      {/* Sessions Overview */}
      {sessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Active Sessions</h2>
          <div className="space-y-3">
            {activeSessions.length === 0 ? (
              <p className="text-gray-600 text-sm">
                No active sessions. Create a session to get started.
              </p>
            ) : (
              activeSessions.map(session => (
                <div
                  key={session.sessionId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push('/whatsapp/sessions')}
                >
                  <div>
                    <div className="font-medium">{session.sessionName}</div>
                    <div className="text-sm text-gray-600">{session.phoneNumber}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-green-500 rounded-full" />
                    <span className="text-sm text-gray-600">Active</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Metric Card Component
 */
function MetricCard({ title, value, trend, subtitle, icon }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <h3 className="text-gray-600 text-sm mb-1">{title}</h3>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({ title, value, label }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-6 text-center">
      <h3 className="text-gray-600 text-sm mb-2">{title}</h3>
      <div className="text-3xl font-bold mb-1">{value.toLocaleString()}</div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

/**
 * Quick Action Button Component
 */
function QuickActionButton({ icon, title, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors text-left"
    >
      <span className="text-2xl">{icon}</span>
      <span className="font-medium">{title}</span>
    </button>
  );
}

/**
 * Format time in seconds to human-readable format
 */
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
