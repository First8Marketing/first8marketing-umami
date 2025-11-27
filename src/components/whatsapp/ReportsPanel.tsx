'use client';

/**
 * Reports Panel Component
 * Configure and generate WhatsApp analytics reports
 */

import { useState } from 'react';
import type { ReportConfig, DateRange } from '@/types/whatsapp';

interface ReportsPanelProps {
  onGenerateReport: (config: ReportConfig) => Promise<void>;
  loading?: boolean;
}

export function ReportsPanel({ onGenerateReport, loading = false }: ReportsPanelProps) {
  const [reportType, setReportType] = useState<'summary' | 'performance' | 'funnel' | 'custom'>(
    'summary',
  );
  const [format, setFormat] = useState<'csv' | 'json' | 'pdf'>('csv');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'total_messages',
    'active_conversations',
    'response_time',
  ]);

  const handleGenerate = async () => {
    const config: ReportConfig = {
      type: reportType,
      dateRange,
      metrics: selectedMetrics,
      format,
    };

    await onGenerateReport(config);
  };

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric],
    );
  };

  const availableMetrics = [
    { id: 'total_messages', label: 'Total Messages' },
    { id: 'active_conversations', label: 'Active Conversations' },
    { id: 'response_time', label: 'Average Response Time' },
    { id: 'conversion_rate', label: 'Conversion Rate' },
    { id: 'message_volume', label: 'Message Volume' },
    { id: 'funnel_stages', label: 'Funnel Progression' },
    { id: 'customer_satisfaction', label: 'Customer Satisfaction' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      <h2 className="text-xl font-semibold">Generate Report</h2>

      {/* Report Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['summary', 'performance', 'funnel', 'custom'].map(type => (
            <button
              key={type}
              onClick={() => setReportType(type as any)}
              className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                reportType === type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium capitalize">{type}</div>
              <div className="text-xs text-gray-500 mt-1">
                {type === 'summary' && 'Overview metrics'}
                {type === 'performance' && 'Performance analysis'}
                {type === 'funnel' && 'Conversion funnel'}
                {type === 'custom' && 'Custom metrics'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.startDate.split('T')[0]}
              onChange={e =>
                setDateRange(prev => ({
                  ...prev,
                  startDate: new Date(e.target.value).toISOString(),
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.endDate.split('T')[0]}
              onChange={e =>
                setDateRange(prev => ({
                  ...prev,
                  endDate: new Date(e.target.value).toISOString(),
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Quick Range Buttons */}
        <div className="flex gap-2 mt-3">
          {[
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 90 days', days: 90 },
          ].map(({ label, days }) => (
            <button
              key={days}
              onClick={() =>
                setDateRange({
                  startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
                  endDate: new Date().toISOString(),
                })
              }
              className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Selection (for custom reports) */}
      {reportType === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Metrics</label>
          <div className="grid grid-cols-2 gap-2">
            {availableMetrics.map(metric => (
              <label
                key={metric.id}
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(metric.id)}
                  onChange={() => handleMetricToggle(metric.id)}
                  className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm">{metric.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Export Format */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
        <div className="flex gap-3">
          {['csv', 'json', 'pdf'].map(fmt => (
            <button
              key={fmt}
              onClick={() => setFormat(fmt as any)}
              className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                format === fmt
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Panel (Placeholder) */}
      <div className="bg-gray-50 rounded-lg p-6 min-h-48">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Report Preview</h3>
        <div className="text-center text-gray-400 py-8">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-sm">Preview will appear here</p>
          <p className="text-xs mt-1">Click Generate to create report</p>
        </div>
      </div>

      {/* Generate Button */}
      <div className="pt-4 border-t">
        <button
          onClick={handleGenerate}
          disabled={loading || (reportType === 'custom' && selectedMetrics.length === 0)}
          className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Generating Report...
            </span>
          ) : (
            `Generate ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`
          )}
        </button>
      </div>
    </div>
  );
}
