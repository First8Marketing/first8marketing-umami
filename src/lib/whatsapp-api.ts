/**
 * WhatsApp Analytics API Client
 * Provides type-safe API calls to WhatsApp backend endpoints
 */

import {
  WhatsAppSession,
  WhatsAppMessage,
  WhatsAppConversation,
  WhatsAppContact,
  WhatsAppMetrics,
  FunnelData,
  TimeSeriesDataPoint,
  AttributionData,
  CohortData,
  ApiResponse,
  ConversationFilters,
  QRCodeData,
  ReportConfig,
  UserIdentityCorrelation,
  DateRange,
} from '@/types/whatsapp';

/**
 * Base API configuration
 */
const API_BASE = '/api/v1/whatsapp';

/**
 * Fetch options type - uses the global RequestInit from DOM lib
 * This type represents the options object for the fetch API
 */
type FetchOptions = globalThis.RequestInit;

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || 'An error occurred',
      };
    }

    return {
      success: true,
      data,
      pagination: data.pagination,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Session Management APIs
 */
export const sessionApi = {
  /**
   * Get all sessions for a team
   */
  getSessions: async (teamId: string): Promise<ApiResponse<WhatsAppSession[]>> => {
    return apiFetch<WhatsAppSession[]>(`/sessions?teamId=${teamId}`);
  },

  /**
   * Get a specific session
   */
  getSession: async (sessionId: string): Promise<ApiResponse<WhatsAppSession>> => {
    return apiFetch<WhatsAppSession>(`/sessions/${sessionId}`);
  },

  /**
   * Create a new WhatsApp session
   */
  createSession: async (
    teamId: string,
    phoneNumber: string,
    sessionName: string,
  ): Promise<ApiResponse<WhatsAppSession>> => {
    return apiFetch<WhatsAppSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ teamId, phoneNumber, sessionName }),
    });
  },

  /**
   * Delete a session
   */
  deleteSession: async (sessionId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Request a new QR code for authentication
   */
  requestQRCode: async (sessionId: string): Promise<ApiResponse<QRCodeData>> => {
    return apiFetch<QRCodeData>(`/sessions/${sessionId}/qr`, {
      method: 'POST',
    });
  },

  /**
   * Get session status
   */
  getSessionStatus: async (sessionId: string): Promise<ApiResponse<{ status: string }>> => {
    return apiFetch<{ status: string }>(`/sessions/${sessionId}/status`);
  },

  /**
   * Logout session
   */
  logoutSession: async (sessionId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/sessions/${sessionId}/logout`, {
      method: 'POST',
    });
  },
};

/**
 * Message Management APIs
 */
export const messageApi = {
  /**
   * Get messages with pagination and filters
   */
  getMessages: async (
    teamId: string,
    page: number = 1,
    pageSize: number = 50,
    filters?: { chatId?: string; sessionId?: string },
  ): Promise<ApiResponse<WhatsAppMessage[]>> => {
    const params = new URLSearchParams({
      teamId,
      page: page.toString(),
      pageSize: pageSize.toString(),
      ...filters,
    });
    return apiFetch<WhatsAppMessage[]>(`/messages?${params}`);
  },

  /**
   * Get a specific message
   */
  getMessage: async (messageId: string): Promise<ApiResponse<WhatsAppMessage>> => {
    return apiFetch<WhatsAppMessage>(`/messages/${messageId}`);
  },

  /**
   * Send a message
   */
  sendMessage: async (
    sessionId: string,
    to: string,
    message: string,
    messageType: string = 'text',
  ): Promise<ApiResponse<WhatsAppMessage>> => {
    return apiFetch<WhatsAppMessage>('/messages', {
      method: 'POST',
      body: JSON.stringify({ sessionId, to, message, messageType }),
    });
  },

  /**
   * Delete a message
   */
  deleteMessage: async (messageId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Mark message as read
   */
  markAsRead: async (messageId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/messages/${messageId}/read`, {
      method: 'PUT',
    });
  },
};

/**
 * Conversation Management APIs
 */
export const conversationApi = {
  /**
   * Get all conversations with filters
   */
  getConversations: async (
    teamId: string,
    page: number = 1,
    pageSize: number = 20,
    filters?: ConversationFilters,
  ): Promise<ApiResponse<WhatsAppConversation[]>> => {
    const params = new URLSearchParams({
      teamId,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    if (filters?.status) {
      params.append('status', filters.status.join(','));
    }
    if (filters?.stage) {
      params.append('stage', filters.stage.join(','));
    }
    if (filters?.searchQuery) {
      params.append('q', filters.searchQuery);
    }

    return apiFetch<WhatsAppConversation[]>(`/conversations?${params}`);
  },

  /**
   * Get a specific conversation with messages
   */
  getConversation: async (
    conversationId: string,
  ): Promise<ApiResponse<WhatsAppConversation & { messages: WhatsAppMessage[] }>> => {
    return apiFetch<WhatsAppConversation & { messages: WhatsAppMessage[] }>(
      `/conversations/${conversationId}`,
    );
  },

  /**
   * Update conversation status or stage
   */
  updateConversation: async (
    conversationId: string,
    updates: Partial<Pick<WhatsAppConversation, 'status' | 'stage' | 'metadata'>>,
  ): Promise<ApiResponse<WhatsAppConversation>> => {
    return apiFetch<WhatsAppConversation>(`/conversations/${conversationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Close a conversation
   */
  closeConversation: async (conversationId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/conversations/${conversationId}/close`, {
      method: 'POST',
    });
  },

  /**
   * Archive a conversation
   */
  archiveConversation: async (conversationId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/conversations/${conversationId}/archive`, {
      method: 'POST',
    });
  },
};

/**
 * Analytics APIs
 */
export const analyticsApi = {
  /**
   * Get overview metrics
   */
  getOverviewMetrics: async (
    teamId: string,
    dateRange?: DateRange,
  ): Promise<ApiResponse<WhatsAppMetrics>> => {
    const params = new URLSearchParams({ teamId });
    if (dateRange) {
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
    }
    return apiFetch<WhatsAppMetrics>(`/analytics/overview?${params}`);
  },

  /**
   * Get specific metrics
   */
  getMetrics: async (
    teamId: string,
    metrics: string[],
    dateRange?: DateRange,
  ): Promise<ApiResponse<Record<string, number>>> => {
    return apiFetch<Record<string, number>>('/analytics/metrics', {
      method: 'POST',
      body: JSON.stringify({ teamId, metrics, dateRange }),
    });
  },

  /**
   * Get funnel data
   */
  getFunnelData: async (
    teamId: string,
    dateRange?: DateRange,
  ): Promise<ApiResponse<FunnelData[]>> => {
    const params = new URLSearchParams({ teamId });
    if (dateRange) {
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
    }
    return apiFetch<FunnelData[]>(`/analytics/funnel?${params}`);
  },

  /**
   * Get time series data
   */
  getTimeSeriesData: async (
    teamId: string,
    metric: string,
    dateRange?: DateRange,
    interval: 'hour' | 'day' | 'week' | 'month' = 'day',
  ): Promise<ApiResponse<TimeSeriesDataPoint[]>> => {
    const params = new URLSearchParams({
      teamId,
      metric,
      interval,
    });
    if (dateRange) {
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
    }
    return apiFetch<TimeSeriesDataPoint[]>(`/analytics/timeseries?${params}`);
  },

  /**
   * Get attribution data
   */
  getAttributionData: async (
    teamId: string,
    model: string,
    dateRange?: DateRange,
  ): Promise<ApiResponse<AttributionData[]>> => {
    const params = new URLSearchParams({ teamId, model });
    if (dateRange) {
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
    }
    return apiFetch<AttributionData[]>(`/analytics/attribution?${params}`);
  },

  /**
   * Get cohort retention data
   */
  getCohortData: async (
    teamId: string,
    cohortType: 'daily' | 'weekly' | 'monthly',
    dateRange?: DateRange,
  ): Promise<ApiResponse<CohortData[]>> => {
    const params = new URLSearchParams({ teamId, cohortType });
    if (dateRange) {
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
    }
    return apiFetch<CohortData[]>(`/analytics/cohorts?${params}`);
  },
};

/**
 * Contact APIs
 */
export const contactApi = {
  /**
   * Get all contacts
   */
  getContacts: async (
    teamId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<ApiResponse<WhatsAppContact[]>> => {
    const params = new URLSearchParams({
      teamId,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    return apiFetch<WhatsAppContact[]>(`/contacts?${params}`);
  },

  /**
   * Get a specific contact
   */
  getContact: async (phone: string): Promise<ApiResponse<WhatsAppContact>> => {
    return apiFetch<WhatsAppContact>(`/contacts/${encodeURIComponent(phone)}`);
  },

  /**
   * Update contact information
   */
  updateContact: async (
    phone: string,
    updates: Partial<WhatsAppContact>,
  ): Promise<ApiResponse<WhatsAppContact>> => {
    return apiFetch<WhatsAppContact>(`/contacts/${encodeURIComponent(phone)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
};

/**
 * Report APIs
 */
export const reportApi = {
  /**
   * Generate a report
   */
  generateReport: async (config: ReportConfig): Promise<ApiResponse<{ reportId: string }>> => {
    return apiFetch<{ reportId: string }>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  /**
   * Download a generated report
   */
  downloadReport: async (reportId: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/reports/${reportId}/download`);
    return response.blob();
  },

  /**
   * Get report history
   */
  getReportHistory: async (
    teamId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<ApiResponse<any[]>> => {
    const params = new URLSearchParams({
      teamId,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    return apiFetch<any[]>(`/reports/history?${params}`);
  },
};

/**
 * Correlation APIs
 */
export const correlationApi = {
  /**
   * Get user identity correlations
   */
  getCorrelations: async (
    teamId: string,
    filters?: { verified?: boolean; minConfidence?: number },
  ): Promise<ApiResponse<UserIdentityCorrelation[]>> => {
    const params = new URLSearchParams({ teamId });
    if (filters?.verified !== undefined) {
      params.append('verified', filters.verified.toString());
    }
    if (filters?.minConfidence) {
      params.append('minConfidence', filters.minConfidence.toString());
    }
    return apiFetch<UserIdentityCorrelation[]>(`/correlations?${params}`);
  },

  /**
   * Verify a correlation manually
   */
  verifyCorrelation: async (
    correlationId: string,
    verified: boolean,
  ): Promise<ApiResponse<UserIdentityCorrelation>> => {
    return apiFetch<UserIdentityCorrelation>(`/correlations/${correlationId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verified }),
    });
  },

  /**
   * Create manual correlation
   */
  createCorrelation: async (
    teamId: string,
    waPhone: string,
    umamiUserId: string,
  ): Promise<ApiResponse<UserIdentityCorrelation>> => {
    return apiFetch<UserIdentityCorrelation>('/correlations', {
      method: 'POST',
      body: JSON.stringify({ teamId, waPhone, umamiUserId, correlationMethod: 'manual' }),
    });
  },
};

/**
 * Notification APIs
 */
export const notificationApi = {
  /**
   * List notifications for user/team
   */
  list: async (params: {
    teamId: string;
    userId?: string;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    priority?: string;
  }): Promise<ApiResponse<any[]>> => {
    const searchParams = new URLSearchParams({
      teamId: params.teamId,
      ...(params.limit && { limit: params.limit.toString() }),
      ...(params.offset && { offset: params.offset.toString() }),
      ...(params.userId && { userId: params.userId }),
      ...(params.unreadOnly && { unreadOnly: params.unreadOnly.toString() }),
      ...(params.priority && { priority: params.priority }),
    });
    return apiFetch<any[]>(`/notifications?${searchParams}`);
  },

  /**
   * Get unread count
   */
  getUnreadCount: async (params: {
    teamId: string;
    userId?: string;
  }): Promise<ApiResponse<{ count: number }>> => {
    const searchParams = new URLSearchParams({
      teamId: params.teamId,
      ...(params.userId && { userId: params.userId }),
    });
    return apiFetch<{ count: number }>(`/notifications/unread?${searchParams}`);
  },

  /**
   * Mark notification as read
   */
  markAsRead: async (notificationId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async (params: { teamId: string; userId: string }): Promise<ApiResponse<void>> => {
    return apiFetch<void>('/notifications/read-all', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  },

  /**
   * Dismiss notification
   */
  dismiss: async (notificationId: string): Promise<ApiResponse<void>> => {
    return apiFetch<void>(`/notifications/${notificationId}/dismiss`, {
      method: 'PUT',
    });
  },

  /**
   * Get notification preferences
   */
  getPreferences: async (params: { userId: string; teamId: string }): Promise<ApiResponse<any>> => {
    const searchParams = new URLSearchParams(params);
    return apiFetch<any>(`/notifications/preferences?${searchParams}`);
  },

  /**
   * Update notification preferences
   */
  updatePreferences: async (preferences: any): Promise<ApiResponse<void>> => {
    return apiFetch<void>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },
};

/**
 * Combined API object for easy imports
 */
export const whatsappApi = {
  session: sessionApi,
  message: messageApi,
  conversation: conversationApi,
  analytics: analyticsApi,
  contact: contactApi,
  report: reportApi,
  correlation: correlationApi,
  notifications: notificationApi,
};

export default whatsappApi;
