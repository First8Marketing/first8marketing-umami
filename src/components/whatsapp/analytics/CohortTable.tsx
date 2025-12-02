'use client';

/**
 * Cohort Retention Table Component
 * Displays cohort retention data with heatmap visualization
 */

import { memo, useMemo } from 'react';
import { format } from 'date-fns';
import type { CohortData } from '@/types/whatsapp';

interface CohortMatrix {
  cohortDate: string;
  periods: CohortData[];
}

interface CohortTableProps {
  cohortMatrix: CohortMatrix[];
  loading?: boolean;
}

export const CohortTable = memo(function CohortTable({
  cohortMatrix,
  loading = false,
}: CohortTableProps) {
  // Calculate max periods for table columns
  const maxPeriods = useMemo(() => {
    return Math.max(...cohortMatrix.map(c => c.periods.length), 0);
  }, [cohortMatrix]);

  // Get heatmap color based on retention rate
  const getHeatmapColor = (retentionRate: number): string => {
    if (retentionRate >= 80) return 'bg-green-500 text-white';
    if (retentionRate >= 60) return 'bg-green-400 text-white';
    if (retentionRate >= 40) return 'bg-yellow-400 text-gray-900';
    if (retentionRate >= 20) return 'bg-orange-400 text-white';
    return 'bg-red-400 text-white';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (cohortMatrix.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Cohort Retention Analysis</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <p>No cohort data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Cohort Retention Analysis</h3>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Retention:</span>
          <div className="flex gap-1">
            <div className="px-2 py-1 bg-green-500 text-white rounded">80%+</div>
            <div className="px-2 py-1 bg-yellow-400 text-gray-900 rounded">40-60%</div>
            <div className="px-2 py-1 bg-red-400 text-white rounded">&lt;20%</div>
          </div>
        </div>
      </div>

      {/* Scrollable Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700 border-b-2">Cohort</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700 border-b-2">Size</th>
              {Array.from({ length: maxPeriods }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-center font-medium text-gray-700 border-b-2">
                  Week {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cohortMatrix.map(cohort => (
              <tr key={cohort.cohortDate} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {format(new Date(cohort.cohortDate), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 text-center font-semibold">
                  {cohort.periods[0]?.users.toLocaleString() || 0}
                </td>
                {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                  const periodData = cohort.periods.find(p => p.period === periodIndex);

                  if (!periodData) {
                    return (
                      <td key={periodIndex} className="px-4 py-3 text-center bg-gray-50">
                        <span className="text-gray-400">-</span>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={periodIndex}
                      className={`px-4 py-3 text-center transition-colors ${getHeatmapColor(periodData.retentionRate)}`}
                      title={`${periodData.retained} of ${periodData.users} users retained (${periodData.retentionRate.toFixed(1)}%)`}
                    >
                      <div className="font-semibold">{periodData.retentionRate.toFixed(1)}%</div>
                      <div className="text-xs opacity-75">
                        {periodData.retained}/{periodData.users}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{cohortMatrix.length}</div>
          <div className="text-sm text-gray-600">Total Cohorts</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {cohortMatrix.reduce((sum, c) => sum + (c.periods[0]?.users || 0), 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Total Users</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {calculateAverageRetention(cohortMatrix).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600">Avg Retention</div>
        </div>
      </div>

      {/* Export Button */}
      <div className="mt-4 text-center">
        <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors">
          Export Cohort Data
        </button>
      </div>
    </div>
  );
});

/**
 * Calculate average retention across all cohorts
 */
function calculateAverageRetention(cohortMatrix: CohortMatrix[]): number {
  if (cohortMatrix.length === 0) return 0;

  const allRetentionRates = cohortMatrix.flatMap(cohort =>
    cohort.periods.map(p => p.retentionRate),
  );

  return allRetentionRates.reduce((sum, rate) => sum + rate, 0) / allRetentionRates.length;
}
