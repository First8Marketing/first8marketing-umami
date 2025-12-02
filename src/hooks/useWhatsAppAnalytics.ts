/**
 * WhatsApp Analytics Hook
 * Manages analytics data, metrics, and visualizations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { whatsappApi } from '@/lib/whatsapp-api';
import type {
  WhatsAppMetrics,
  FunnelData,
  TimeSeriesDataPoint,
  AttributionData,
  CohortData,
  DateRange,
} from '@/types/whatsapp';

interface UseWhatsAppAnalyticsReturn {
  metrics: WhatsAppMetrics | null;
  loading: boolean;
  error: string | null;
  dateRange: DateRange | null;
  setDateRange: (range: DateRange) => void;
  refreshMetrics: () => Promise<void>;
}

/**
 * Custom hook for fetching WhatsApp overview metrics
 */
export function useWhatsAppAnalytics(
  teamId: string,
  initialDateRange?: DateRange,
): UseWhatsAppAnalyticsReturn {
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(initialDateRange || null);

  const fetchMetrics = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.analytics.getOverviewMetrics(teamId, dateRange || undefined);

    if (response.success && response.data) {
      setMetrics(response.data);
    } else {
      setError(response.error || 'Failed to fetch metrics');
    }

    setLoading(false);
  }, [teamId, dateRange]);

  const refreshMetrics = useCallback(async () => {
    await fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    dateRange,
    setDateRange,
    refreshMetrics,
  };
}

/**
 * Custom hook for funnel data
 */
export function useFunnelData(teamId: string, dateRange?: DateRange) {
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnelData = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.analytics.getFunnelData(teamId, dateRange);

    if (response.success && response.data) {
      setFunnelData(response.data);
    } else {
      setError(response.error || 'Failed to fetch funnel data');
    }

    setLoading(false);
  }, [teamId, dateRange]);

  useEffect(() => {
    fetchFunnelData();
  }, [fetchFunnelData]);

  return {
    funnelData,
    loading,
    error,
    refreshFunnelData: fetchFunnelData,
  };
}

/**
 * Custom hook for time series data
 */
export function useTimeSeriesData(
  teamId: string,
  metric: string,
  dateRange?: DateRange,
  interval: 'hour' | 'day' | 'week' | 'month' = 'day',
) {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeSeriesData = useCallback(async () => {
    if (!teamId || !metric) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.analytics.getTimeSeriesData(
      teamId,
      metric,
      dateRange,
      interval,
    );

    if (response.success && response.data) {
      setTimeSeriesData(response.data);
    } else {
      setError(response.error || 'Failed to fetch time series data');
    }

    setLoading(false);
  }, [teamId, metric, dateRange, interval]);

  useEffect(() => {
    fetchTimeSeriesData();
  }, [fetchTimeSeriesData]);

  return {
    timeSeriesData,
    loading,
    error,
    refreshTimeSeriesData: fetchTimeSeriesData,
  };
}

/**
 * Custom hook for attribution data
 */
export function useAttributionData(
  teamId: string,
  model: string = 'last_touch',
  dateRange?: DateRange,
) {
  const [attributionData, setAttributionData] = useState<AttributionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttributionData = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.analytics.getAttributionData(teamId, model, dateRange);

    if (response.success && response.data) {
      setAttributionData(response.data);
    } else {
      setError(response.error || 'Failed to fetch attribution data');
    }

    setLoading(false);
  }, [teamId, model, dateRange]);

  useEffect(() => {
    fetchAttributionData();
  }, [fetchAttributionData]);

  return {
    attributionData,
    loading,
    error,
    refreshAttributionData: fetchAttributionData,
  };
}

/**
 * Custom hook for cohort retention data
 */
export function useCohortData(
  teamId: string,
  cohortType: 'daily' | 'weekly' | 'monthly' = 'weekly',
  dateRange?: DateRange,
) {
  const [cohortData, setCohortData] = useState<CohortData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCohortData = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.analytics.getCohortData(teamId, cohortType, dateRange);

    if (response.success && response.data) {
      setCohortData(response.data);
    } else {
      setError(response.error || 'Failed to fetch cohort data');
    }

    setLoading(false);
  }, [teamId, cohortType, dateRange]);

  useEffect(() => {
    fetchCohortData();
  }, [fetchCohortData]);

  // Transform cohort data into a matrix for table display
  const cohortMatrix = useMemo(() => {
    if (!cohortData.length) return [];

    const cohorts = cohortData.reduce(
      (acc, item) => {
        if (!acc[item.cohortDate]) {
          acc[item.cohortDate] = [];
        }
        acc[item.cohortDate].push(item);
        return acc;
      },
      {} as Record<string, CohortData[]>,
    );

    return Object.entries(cohorts).map(([date, data]) => ({
      cohortDate: date,
      periods: data.sort((a, b) => a.period - b.period),
    }));
  }, [cohortData]);

  return {
    cohortData,
    cohortMatrix,
    loading,
    error,
    refreshCohortData: fetchCohortData,
  };
}

/**
 * Hook for real-time analytics updates
 * Prepares for WebSocket integration (Phase 8)
 * State setters are prefixed with _ as they will be used when WebSocket is implemented
 */
export function useRealTimeAnalytics(teamId: string) {
  const [realtimeMetrics, _setRealtimeMetrics] = useState<Partial<WhatsAppMetrics>>({});
  const [connected, _setConnected] = useState(false);

  // Placeholder for WebSocket connection (Phase 8)
  useEffect(() => {
    // TODO: Phase 8 - Connect to WebSocket for real-time updates
    // const socket = connectToWebSocket(teamId);
    // socket.on('metrics_update', (data) => {
    //   _setRealtimeMetrics(data);
    // });
    // socket.on('connected', () => _setConnected(true));
    // socket.on('disconnected', () => _setConnected(false));
    // return () => socket.disconnect();
  }, [teamId]);

  return {
    realtimeMetrics,
    connected,
  };
}

/**
 * Combined analytics hook with all metrics
 */
export function useAnalyticsDashboard(teamId: string, dateRange?: DateRange) {
  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
  } = useWhatsAppAnalytics(teamId, dateRange);

  const {
    funnelData,
    loading: funnelLoading,
    error: funnelError,
  } = useFunnelData(teamId, dateRange);

  const {
    timeSeriesData,
    loading: timeSeriesLoading,
    error: timeSeriesError,
  } = useTimeSeriesData(teamId, 'messages', dateRange);

  const loading = metricsLoading || funnelLoading || timeSeriesLoading;
  const error = metricsError || funnelError || timeSeriesError;

  return {
    metrics,
    funnelData,
    timeSeriesData,
    loading,
    error,
  };
}
