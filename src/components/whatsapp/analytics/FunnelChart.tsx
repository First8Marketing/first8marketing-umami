'use client';

/**
 * Funnel Chart Component
 * Visual funnel diagram showing conversation stage progression
 */

import { memo, useMemo } from 'react';
import type { FunnelData } from '@/types/whatsapp';

interface FunnelChartProps {
  data: FunnelData[];
  title?: string;
  onStageClick?: (stage: string) => void;
}

export const FunnelChart = memo(function FunnelChart({
  data,
  title = 'Conversation Funnel',
  onStageClick,
}: FunnelChartProps) {
  // Calculate max count for width scaling
  const maxCount = useMemo(() => {
    return Math.max(...data.map(d => d.count), 1);
  }, [data]);

  const stageColors = {
    initial_contact: '#3b82f6',
    qualification: '#8b5cf6',
    proposal: '#eab308',
    negotiation: '#f97316',
    closed_won: '#22c55e',
    closed_lost: '#ef4444',
  };

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <p>No funnel data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>

      <div className="space-y-3">
        {data.map((stage, index) => {
          const widthPercentage = (stage.count / maxCount) * 100;
          const color = stageColors[stage.stage as keyof typeof stageColors] || '#6b7280';
          const conversionFromPrevious =
            index > 0 ? ((stage.count / data[index - 1].count) * 100).toFixed(1) : null;

          return (
            <div key={stage.stage} className="relative">
              {/* Stage Bar */}
              <div
                className={`relative rounded-lg p-4 transition-all ${onStageClick ? 'cursor-pointer hover:shadow-md' : ''}`}
                style={{
                  width: `${widthPercentage}%`,
                  minWidth: '40%',
                  backgroundColor: color,
                }}
                onClick={() => onStageClick?.(stage.stage)}
              >
                <div className="flex items-center justify-between text-white">
                  <div>
                    <div className="font-semibold capitalize">{stage.stage.replace(/_/g, ' ')}</div>
                    <div className="text-sm opacity-90">
                      {stage.count.toLocaleString()} conversations
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">{stage.percentage.toFixed(1)}%</div>
                    {conversionFromPrevious && (
                      <div className="text-xs opacity-90">
                        {conversionFromPrevious}% from previous
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector Arrow */}
              {index < data.length - 1 && (
                <div className="flex justify-center my-1">
                  <div className="text-gray-400 text-xl">↓</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {data[0]?.count.toLocaleString() || 0}
          </div>
          <div className="text-sm text-gray-600">Total Entries</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">
            {data.find(d => d.stage === 'closed_won')?.count.toLocaleString() || 0}
          </div>
          <div className="text-sm text-gray-600">Conversions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {data[0] && data.find(d => d.stage === 'closed_won')
              ? ((data.find(d => d.stage === 'closed_won')!.count / data[0].count) * 100).toFixed(1)
              : 0}
            %
          </div>
          <div className="text-sm text-gray-600">Overall Rate</div>
        </div>
      </div>
    </div>
  );
});
