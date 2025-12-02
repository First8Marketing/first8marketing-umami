'use client';

/**
 * WhatsApp Analytics Page
 * Detailed analytics and visualizations
 */

import { useState } from 'react';
import { useApp } from '@/store/app';
import {
  useAnalyticsDashboard,
  useAttributionData,
  useCohortData,
} from '@/hooks/useWhatsAppAnalytics';
import { MetricCard } from '@/components/whatsapp/analytics/MetricCard';
import { TimeSeriesChart } from '@/components/whatsapp/analytics/TimeSeriesChart';
import { FunnelChart } from '@/components/whatsapp/analytics/FunnelChart';
import { AttributionChart } from '@/components/whatsapp/analytics/AttributionChart';
import { CohortTable } from '@/components/whatsapp/analytics/CohortTable';
import type { DateRange } from '@/types/whatsapp';

export default function AnalyticsPage() {
  const { user } = useApp();
  const teamId = user?.teamId || '';

  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
    endDate: new Date().toISOString(),
  });

  // Attribution model state
  const [attributionModel, setAttributionModel] = useState('last_touch');

  // Fetch analytics data
  const { metrics, funnelData, timeSeriesData, loading, error } = useAnalyticsDashboard(
    teamId,
    dateRange,
  );
  const { attributionData, loading: attributionLoading } = useAttributionData(
    teamId,
    attributionModel,
    dateRange,
  );
  const { cohortMatrix, loading: cohortLoading } = useCohortData(teamId, 'weekly', dateRange);

  const handleDateRangeChange = (preset: string) => {
    const now = new Date();
    let startDate: Date;

    switch (preset) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    setDateRange({
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Analytics</h1>
          <p className="text-gray-600 mt-1">Comprehensive metrics and insights</p>
        </div>

        <div className="flex gap-2">
          {['7d', '30d', '90d'].map(period => (
            <button
              key={period}
              onClick={() => handleDateRangeChange(period)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Last {period}
            </button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Messages"
          value={metrics?.totalMessages || 0}
          trend={metrics?.trend?.messages}
          icon="💬"
          loading={loading}
        />
        <MetricCard
          title="Active Conversations"
          value={metrics?.activeConversations || 0}
          icon="👥"
          loading={loading}
        />
        <MetricCard
          title="Avg Response Time"
          value={formatResponseTime(metrics?.averageResponseTime || 0)}
          trend={metrics?.trend?.responseTime}
          icon="⏱️"
          loading={loading}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${(metrics?.conversionRate || 0).toFixed(1)}%`}
          icon="📈"
          loading={loading}
        />
      </div>

      {/* Time Series Chart */}
      <TimeSeriesChart
        data={timeSeriesData || []}
        title="Message Volume Over Time"
        color="#3b82f6"
      />

      {/* Funnel Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunnelChart data={funnelData || []} title="Conversation Funnel" />

        {/* Attribution Analysis */}
        <div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Channel Attribution</h3>
              <select
                value={attributionModel}
                onChange={e => setAttributionModel(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
              >
                <option value="last_touch">Last Touch</option>
                <option value="first_touch">First Touch</option>
                <option value="linear">Linear</option>
                <option value="time_decay">Time Decay</option>
                <option value="position_based">Position Based</option>
              </select>
            </div>
            <AttributionChart
              data={attributionData || []}
              model={attributionModel}
              loading={attributionLoading}
            />
          </div>
        </div>
      </div>

      {/* Cohort Retention Table */}
      <CohortTable cohortMatrix={cohortMatrix || []} loading={cohortLoading} />

      {/* Additional Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 mb-1">Today</h3>
          <div className="text-3xl font-bold">{metrics?.messageVolumeToday || 0}</div>
          <p className="text-sm text-gray-500 mt-1">messages</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 mb-1">This Week</h3>
          <div className="text-3xl font-bold">{metrics?.messageVolumeThisWeek || 0}</div>
          <p className="text-sm text-gray-500 mt-1">messages</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 mb-1">This Month</h3>
          <div className="text-3xl font-bold">{metrics?.messageVolumeThisMonth || 0}</div>
          <p className="text-sm text-gray-500 mt-1">messages</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format response time in seconds to human-readable format
 */
function formatResponseTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
