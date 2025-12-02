// WhatsApp Integration TypeScript Types
// Phase 7: Frontend UI Types

/**
 * WhatsApp Error Codes
 */
export enum WhatsAppErrorCode {
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_AUTH_FAILED = 'SESSION_AUTH_FAILED',
  SESSION_DISCONNECTED = 'SESSION_DISCONNECTED',
  SESSION_LIMIT_EXCEEDED = 'SESSION_LIMIT_EXCEEDED',

  // Message errors
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  INVALID_MESSAGE_TYPE = 'INVALID_MESSAGE_TYPE',

  // Auth errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Tenant errors
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  TEAM_ACCESS_DENIED = 'TEAM_ACCESS_DENIED',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',

  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * WhatsApp Error Interface
 */
export interface WhatsAppError {
  code: WhatsAppErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp?: Date;
}

/**
 * Tenant Context for multi-tenant operations
 */
export interface TenantContext {
  teamId: string;
  userId?: string;
  websiteId?: string;
  sessionId?: string;
}

/**
 * Correlation Method Types
 */
export type CorrelationMethod =
  | 'phone'
  | 'email'
  | 'session'
  | 'manual'
  | 'ml_model'
  | 'user_agent';

/**
 * WhatsApp Session Status
 */
export type WhatsAppSessionStatus =
  | 'authenticating'
  | 'active'
  | 'disconnected'
  | 'failed'
  | 'connecting';

/**
 * WhatsApp Session Interface
 */
export interface WhatsAppSession {
  sessionId: string;
  teamId: string;
  phoneNumber: string;
  sessionName: string;
  status: WhatsAppSessionStatus;
  qrCode?: string;
  lastSeenAt?: string;
  sessionData?: Record<string, any>;
  browserConfig?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/**
 * Message Direction
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Message Type
 */
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'document'
  | 'audio'
  | 'voice'
  | 'sticker'
  | 'location'
  | 'contact';

/**
 * WhatsApp Message Interface
 */
export interface WhatsAppMessage {
  messageId: string;
  teamId: string;
  sessionId: string;
  waMessageId: string;
  direction: MessageDirection;
  fromPhone: string;
  toPhone: string;
  chatId: string;
  messageType: MessageType;
  messageBody?: string;
  mediaUrl?: string;
  timestamp: string;
  isRead: boolean;
  readAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

/**
 * Conversation Status
 */
export type ConversationStatus = 'open' | 'closed' | 'archived';

/**
 * Conversation Stage (Funnel)
 */
export type ConversationStage =
  | 'initial_contact'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

/**
 * WhatsApp Conversation Interface
 */
export interface WhatsAppConversation {
  conversationId: string;
  teamId: string;
  sessionId: string;
  chatId: string;
  contactPhone: string;
  contactName?: string;
  status: ConversationStatus;
  stage?: ConversationStage;
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * WhatsApp Event Type
 */
export type WhatsAppEventType =
  | 'message_sent'
  | 'message_received'
  | 'message_read'
  | 'message_delivered'
  | 'reaction_added'
  | 'reaction_removed'
  | 'status_updated'
  | 'group_join'
  | 'group_leave'
  | 'call_started'
  | 'call_ended'
  | 'qr_code'
  | 'authenticated'
  | 'disconnected';

/**
 * WhatsApp Event Interface
 */
export interface WhatsAppEvent {
  eventId: string;
  teamId: string;
  sessionId: string;
  eventType: WhatsAppEventType;
  eventData: Record<string, any>;
  timestamp: string;
  processed: boolean;
  processedAt?: string;
}

/**
 * Contact Interface
 */
export interface WhatsAppContact {
  phone: string;
  name?: string;
  pushname?: string;
  isGroup: boolean;
  isBusiness: boolean;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Analytics Metrics Interface
 */
export interface WhatsAppMetrics {
  totalMessages: number;
  totalConversations: number;
  activeConversations: number;
  averageResponseTime: number; // in seconds
  conversionRate: number; // percentage
  messageVolumeToday: number;
  messageVolumeThisWeek: number;
  messageVolumeThisMonth: number;
  trend?: {
    messages: number; // percentage change
    conversations: number;
    responseTime: number;
  };
}

/**
 * Funnel Data Interface
 */
export interface FunnelData {
  stage: ConversationStage;
  count: number;
  percentage: number;
  conversionRate?: number;
}

/**
 * Time Series Data Point
 */
export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

/**
 * Attribution Data Interface
 */
export interface AttributionData {
  channel: string;
  touchpoints: number;
  conversions: number;
  attributionValue: number;
  model: 'last_touch' | 'first_touch' | 'linear' | 'time_decay' | 'position_based';
}

/**
 * Cohort Data Interface
 */
export interface CohortData {
  cohortDate: string;
  period: number;
  users: number;
  retained: number;
  retentionRate: number;
}

/**
 * Date Range Interface
 */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Filters Interface
 */
export interface ConversationFilters {
  status?: ConversationStatus[];
  stage?: ConversationStage[];
  dateRange?: DateRange;
  searchQuery?: string;
  agentId?: string;
  tags?: string[];
}

/**
 * Pagination Interface
 */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * API Response Interface
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: Pagination;
}

/**
 * WebSocket Event Payload
 */
export interface WebSocketEvent {
  type: WhatsAppEventType;
  payload: Record<string, any>;
  timestamp: string;
}

/**
 * QR Code Data
 */
export interface QRCodeData {
  sessionId: string;
  qrCode: string;
  expiresAt: string;
  status: 'waiting' | 'scanning' | 'success' | 'expired';
}

/**
 * Report Configuration
 */
export interface ReportConfig {
  type: 'summary' | 'performance' | 'funnel' | 'custom';
  dateRange: DateRange;
  metrics: string[];
  filters?: ConversationFilters;
  format: 'csv' | 'json' | 'pdf';
}

/**
 * Chart Configuration
 */
export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'funnel' | 'heatmap';
  data: any[];
  options?: Record<string, any>;
}

/**
 * Loading State
 */
export interface LoadingState {
  isLoading: boolean;
  error?: string;
}

/**
 * User Identity Correlation
 */
export interface UserIdentityCorrelation {
  correlationId: string;
  teamId: string;
  websiteId?: string;
  waPhone: string;
  umamiUserId?: string;
  umamiDistinctId?: string;
  umamiSessionId?: string;
  confidenceScore: number;
  correlationMethod: 'phone' | 'email' | 'session' | 'manual';
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Real-Time Status
 */
export interface RealTimeStatus {
  connected: boolean;
  activeSessions: number;
  activeConversations: number;
  messagesPerMinute: number;
  lastUpdate: string;
}
