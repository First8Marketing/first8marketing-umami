'use client';

/**
 * Metric Card Component
 * Displays a single metric with value, trend, and icon
 */

import { memo } from 'react';

interface MetricCardProps {
  title: string;
  value: number | string;
  trend?: number;
  subtitle?: string;
  icon?: string;
  loading?: boolean;
  color?: string;
}

export const MetricCard = memo(function MetricCard({
  title,
  value,
  trend,
  subtitle,
  icon,
  loading = false,
  color = 'blue',
}: MetricCardProps) {
  if (loading) {
    return <MetricCardSkeleton />;
  }

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      {/* Header with Icon and Trend */}
      <div className="flex items-center justify-between mb-3">
        {icon && (
          <div
            className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}
          >
            <span className="text-2xl">{icon}</span>
          </div>
        )}

        {trend !== undefined && <TrendIndicator value={trend} />}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>

      {/* Value */}
      <div className="text-3xl font-bold text-gray-900 mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {/* Subtitle */}
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
});

/**
 * Trend Indicator Component
 */
function TrendIndicator({ value }: { value: number }) {
  const isPositive = value >= 0;
  const color = isPositive ? 'text-green-600' : 'text-red-600';
  const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50';
  const arrow = isPositive ? '↑' : '↓';

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${bgColor} ${color}`}>
      <span className="text-sm font-medium">{arrow}</span>
      <span className="text-sm font-medium">{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-12 w-12 bg-gray-200 rounded-lg" />
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/3" />
    </div>
  );
}
