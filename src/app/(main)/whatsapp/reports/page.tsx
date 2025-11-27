'use client';

/**
 * WhatsApp Reports Page
 * Generate, configure, and download reports
 */

import { useState } from 'react';
import { useApp } from '@/store/app';
import { ReportsPanel } from '@/components/whatsapp/ReportsPanel';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { ReportConfig } from '@/types/whatsapp';

export default function ReportsPage() {
  useApp(); // Hook called for side effects

  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate report handler
  const handleGenerateReport = async (config: ReportConfig) => {
    setLoading(true);
    setError(null);

    try {
      const response = await whatsappApi.report.generateReport(config);

      if (response.success && response.data) {
        // Add to history
        setReportHistory(prev => [
          {
            reportId: response.data!.reportId,
            type: config.type,
            format: config.format,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);

        // Auto-download if requested
        if (config.format !== 'pdf') {
          await handleDownloadReport(response.data.reportId);
        }
      } else {
        setError(response.error || 'Failed to generate report');
      }
    } catch (_err) {
      setError('An error occurred while generating the report');
    } finally {
      setLoading(false);
    }
  };

  // Download report handler
  const handleDownloadReport = async (reportId: string) => {
    try {
      const blob = await whatsappApi.report.downloadReport(reportId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-report-${reportId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (_err) {
      setError('Failed to download report');
    }
  };

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports & Export</h1>
        <p className="text-gray-600 mt-1">Generate and download WhatsApp analytics reports</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Reports Panel */}
      <ReportsPanel onGenerateReport={handleGenerateReport} loading={loading} />

      {/* Report History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Report History</h2>

        {reportHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <p>No reports generated yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reportHistory.map(report => (
              <div
                key={report.reportId}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">
                    {report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report
                  </div>
                  <div className="text-sm text-gray-600">
                    Generated {new Date(report.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {report.format.toUpperCase()}
                  </span>
                  <button
                    onClick={() => handleDownloadReport(report.reportId)}
                    className="px-4 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
