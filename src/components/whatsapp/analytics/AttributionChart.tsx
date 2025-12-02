'use client';

/**
 * Attribution Chart Component
 * Visualizes channel attribution using bar chart
 */

import { memo, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import type { AttributionData } from '@/types/whatsapp';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AttributionChartProps {
  data: AttributionData[];
  model: string;
  loading?: boolean;
}

export const AttributionChart = memo(function AttributionChart({
  data,
  model,
  loading = false,
}: AttributionChartProps) {
  const chartData = useMemo(() => {
    if (!data.length) return null;

    return {
      labels: data.map(d => d.channel),
      datasets: [
        {
          label: 'Touchpoints',
          data: data.map(d => d.touchpoints),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
        {
          label: 'Conversions',
          data: data.map(d => d.conversions),
          backgroundColor: 'rgba(34, 197, 94, 0.6)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
        },
      ],
    };
  }, [data]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        callbacks: {
          label: context => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
  };

  if (loading || !chartData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p>Loading attribution data...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <p>No attribution data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div style={{ height: '300px' }}>
        <Bar data={chartData} options={options} />
      </div>

      {/* Attribution Details Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Channel</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">Touchpoints</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">Conversions</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">Attribution Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map(item => (
              <tr key={item.channel} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{item.channel}</td>
                <td className="px-4 py-2 text-right">{item.touchpoints.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{item.conversions.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-semibold text-blue-600">
                  {item.attributionValue.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model Info */}
      <div className="text-xs text-gray-500 text-center pt-2 border-t">
        Using <span className="font-medium">{model.replace(/_/g, ' ')}</span> attribution model
      </div>
    </div>
  );
});
