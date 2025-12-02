/**
 * API Validation Schemas
 * Zod schemas for validating WhatsApp API requests
 */

import { z } from 'zod';

// Common schemas
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)')
  .describe('Phone number in E.164 format');

export const uuidSchema = z.string().uuid().describe('UUID identifier');

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// Session schemas
export const createSessionSchema = z.object({
  phoneNumber: phoneNumberSchema,
  name: z.string().min(1).max(255).optional(),
});

export const sessionIdSchema = z.object({
  sessionId: uuidSchema,
});

// Message schemas
export const sendMessageSchema = z.object({
  conversationId: uuidSchema,
  content: z.string().min(1).max(65536),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).optional(),
});

export const messageFiltersSchema = z.object({
  conversationId: uuidSchema.optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
  ...dateRangeSchema.shape,
  ...paginationSchema.shape,
});

export const messageIdSchema = z.object({
  messageId: uuidSchema,
});

// Conversation schemas
export const createConversationSchema = z.object({
  contactId: uuidSchema,
  phoneNumber: phoneNumberSchema.optional(),
});

export const updateConversationSchema = z.object({
  status: z.enum(['active', 'resolved', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
  assignedTo: uuidSchema.optional(),
});

export const conversationFiltersSchema = z.object({
  status: z.enum(['active', 'resolved', 'archived']).optional(),
  assignedTo: uuidSchema.optional(),
  tags: z.array(z.string()).optional(),
  ...dateRangeSchema.shape,
  ...paginationSchema.shape,
});

export const conversationIdSchema = z.object({
  conversationId: uuidSchema,
});

export const assignConversationSchema = z.object({
  userId: uuidSchema,
});

// Contact schemas
export const contactFiltersSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ...paginationSchema.shape,
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const contactIdSchema = z.object({
  contactId: uuidSchema,
});

// Analytics schemas
export const metricsRequestSchema = z.object({
  ...dateRangeSchema.shape,
  metrics: z.array(
    z.enum([
      'message_volume',
      'response_time',
      'resolution_rate',
      'conversation_count',
      'active_contacts',
    ]),
  ),
  groupBy: z.enum(['day', 'week', 'month']).optional(),
});

export const funnelRequestSchema = z.object({
  ...dateRangeSchema.shape,
  stages: z.array(z.string()).min(2),
});

export const conversionFiltersSchema = z.object({
  ...dateRangeSchema.shape,
  eventType: z.string().optional(),
  ...paginationSchema.shape,
});

export const trackConversionSchema = z.object({
  conversationId: uuidSchema,
  eventType: z.string().min(1),
  eventData: z.record(z.any()).optional(),
  value: z.number().optional(),
});

export const cohortRequestSchema = z.object({
  cohortType: z.enum(['signup', 'first_message', 'conversion']),
  ...dateRangeSchema.shape,
  groupBy: z.enum(['day', 'week', 'month']).default('week'),
});

// Correlation schemas
export const correlationFiltersSchema = z.object({
  userId: uuidSchema.optional(),
  phoneNumber: phoneNumberSchema.optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  ...paginationSchema.shape,
});

export const triggerCorrelationSchema = z.object({
  phoneNumber: phoneNumberSchema,
  userId: uuidSchema.optional(),
  metadata: z.record(z.any()).optional(),
});

export const correlationIdSchema = z.object({
  correlationId: uuidSchema,
});

export const verifyCorrelationSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

// Notification schemas
export const notificationFiltersSchema = z.object({
  type: z.string().optional(),
  read: z.boolean().optional(),
  ...dateRangeSchema.shape,
  ...paginationSchema.shape,
});

export const notificationIdSchema = z.object({
  notificationId: uuidSchema,
});

export const notificationPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  types: z.array(z.string()).optional(),
});

// Report schemas
export const generateReportSchema = z.object({
  reportType: z.enum([
    'conversation_summary',
    'agent_performance',
    'conversion_analysis',
    'contact_engagement',
  ]),
  ...dateRangeSchema.shape,
  filters: z.record(z.any()).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export const reportIdSchema = z.object({
  reportId: uuidSchema,
});

export const exportFormatSchema = z.object({
  format: z.enum(['json', 'csv']).default('csv'),
});

/**
 * Validate request body against a schema
 */
export function validateBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}

/**
 * Validate path params against a schema
 */
export function validateParams<T extends z.ZodType>(schema: T, params: unknown): z.infer<T> {
  return schema.parse(params);
}

/**
 * Validate query params against a schema
 */
export function validateQuery<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams,
): z.infer<T> {
  const query: Record<string, any> = {};

  searchParams.forEach((value, key) => {
    // Handle arrays (e.g., tags[]=value1&tags[]=value2)
    if (key.endsWith('[]')) {
      const baseKey = key.slice(0, -2);
      if (!query[baseKey]) {
        query[baseKey] = [];
      }
      query[baseKey].push(value);
    } else {
      query[key] = value;
    }
  });

  return schema.parse(query);
}
