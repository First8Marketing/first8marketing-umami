/**
 * WhatsApp Correlation Engine - Unit Tests
 * Tests user identity correlation logic, confidence scoring, and multi-matcher orchestration
 */

import { WhatsAppCorrelationEngine, CorrelationRequest } from '../whatsapp-correlation-engine';
import type { TenantContext } from '@/types/whatsapp';

// Mock all dependencies
jest.mock('../whatsapp-db');
jest.mock('../whatsapp-logger');
jest.mock('@/config/whatsapp-config');
jest.mock('@/lib/correlation/confidence-scorer');
jest.mock('@/lib/correlation/phone-matcher');
jest.mock('@/lib/correlation/email-matcher');
jest.mock('@/lib/correlation/session-matcher');
jest.mock('@/lib/correlation/behavioral-matcher');
jest.mock('@/lib/correlation/journey-mapper');
jest.mock('@/lib/correlation/verification-manager');

import { executeWithContext, transactionWithContext } from '../whatsapp-db';
import { getLogger } from '../whatsapp-logger';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import { createConfidenceScorer } from '@/lib/correlation/confidence-scorer';
import { createPhoneMatcher } from '@/lib/correlation/phone-matcher';
import { createEmailMatcher } from '@/lib/correlation/email-matcher';
import { createSessionMatcher } from '@/lib/correlation/session-matcher';
import { createBehavioralMatcher } from '@/lib/correlation/behavioral-matcher';
import { createJourneyMapper } from '@/lib/correlation/journey-mapper';
import { createVerificationManager } from '@/lib/correlation/verification-manager';

const mockExecute = executeWithContext as jest.MockedFunction<typeof executeWithContext>;
const mockTransaction = transactionWithContext as jest.MockedFunction<
  typeof transactionWithContext
>;

describe('WhatsAppCorrelationEngine', () => {
  let engine: WhatsAppCorrelationEngine;
  let mockContext: TenantContext;
  let mockLogger: any;
  let mockConfidenceScorer: any;
  let mockPhoneMatcher: any;
  let mockEmailMatcher: any;
  let mockSessionMatcher: any;
  let mockBehavioralMatcher: any;
  let mockJourneyMapper: any;
  let mockVerificationManager: any;

  beforeEach(() => {
    mockContext = {
      teamId: 'team-123',
      userRole: 'admin',
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    (getLogger as jest.MockedFunction<typeof getLogger>).mockReturnValue(mockLogger);

    (getWhatsAppConfig as jest.MockedFunction<typeof getWhatsAppConfig>).mockReturnValue({
      correlationConfidenceThreshold: 0.4,
      autoVerifyThreshold: 0.9,
    } as any);

    // Setup mock matchers
    mockConfidenceScorer = {
      calculate: jest.fn().mockReturnValue({
        score: 0.85,
        method: 'phone',
        reasoning: 'Strong phone match',
        breakdown: {},
      }),
      needsManualVerification: jest.fn().mockReturnValue(false),
    };

    mockPhoneMatcher = {
      findMatches: jest.fn().mockResolvedValue([
        {
          umamiUserId: 'user-123',
          confidence: 0.95,
          quality: 'high',
        },
      ]),
      createEvidence: jest.fn().mockReturnValue({
        method: 'phone',
        matched: true,
        weight: 1.0,
        quality: 'high',
        data: { bestMatch: { umamiUserId: 'user-123' } },
      }),
    };

    mockEmailMatcher = {
      extractEmails: jest.fn().mockReturnValue([]),
      findMatches: jest.fn().mockResolvedValue([]),
      createEvidence: jest.fn().mockReturnValue({
        method: 'email',
        matched: false,
        weight: 0.9,
        quality: 'none',
        data: {},
      }),
    };

    mockSessionMatcher = {
      findTemporalMatches: jest.fn().mockResolvedValue([]),
      findUserAgentMatches: jest.fn().mockResolvedValue([]),
      createEvidence: jest.fn().mockReturnValue({
        method: 'session',
        matched: false,
        weight: 0.7,
        quality: 'none',
        data: {},
      }),
    };

    mockBehavioralMatcher = {
      findPatternMatches: jest.fn().mockResolvedValue([]),
      createEvidence: jest.fn().mockReturnValue({
        method: 'ml_model',
        matched: false,
        weight: 0.6,
        quality: 'none',
        data: {},
      }),
    };

    mockJourneyMapper = {
      buildJourney: jest.fn().mockResolvedValue(null),
      calculateJourneyQuality: jest.fn().mockReturnValue(0.8),
    };

    mockVerificationManager = {
      queueForVerification: jest.fn().mockResolvedValue(undefined),
    };

    (createConfidenceScorer as jest.MockedFunction<typeof createConfidenceScorer>).mockReturnValue(
      mockConfidenceScorer,
    );
    (createPhoneMatcher as jest.MockedFunction<typeof createPhoneMatcher>).mockReturnValue(
      mockPhoneMatcher,
    );
    (createEmailMatcher as jest.MockedFunction<typeof createEmailMatcher>).mockReturnValue(
      mockEmailMatcher,
    );
    (createSessionMatcher as jest.MockedFunction<typeof createSessionMatcher>).mockReturnValue(
      mockSessionMatcher,
    );
    (
      createBehavioralMatcher as jest.MockedFunction<typeof createBehavioralMatcher>
    ).mockReturnValue(mockBehavioralMatcher);
    (createJourneyMapper as jest.MockedFunction<typeof createJourneyMapper>).mockReturnValue(
      mockJourneyMapper,
    );
    (
      createVerificationManager as jest.MockedFunction<typeof createVerificationManager>
    ).mockReturnValue(mockVerificationManager);

    mockExecute.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    mockTransaction.mockImplementation(async (context, callback) => {
      const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      return callback(mockClient as any);
    });

    engine = new WhatsAppCorrelationEngine();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('correlate', () => {
    /**
     * Test successful correlation with high confidence phone match
     */
    it('should correlate with high confidence phone match', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
        waContactName: 'John Doe',
        messageTimestamp: new Date('2025-01-01T00:00:00.000Z'),
      };

      // Mock no existing correlation
      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await engine.correlate(mockContext, request);

      expect(result.confidenceScore).toBe(0.85);
      expect(result.correlationMethod).toBe('phone');
      expect(result.verified).toBe(false); // Below 0.90 threshold
      expect(result.created).toBe(true);
      expect(result.umamiUserId).toBe('user-123');

      expect(mockPhoneMatcher.findMatches).toHaveBeenCalledWith(mockContext, '+1234567890');
    });

    /**
     * Test auto-verification when confidence exceeds threshold
     */
    it('should auto-verify when confidence >= 0.90', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
      };

      mockConfidenceScorer.calculate.mockReturnValueOnce({
        score: 0.95,
        method: 'phone',
        reasoning: 'Excellent match',
        breakdown: {},
      });

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await engine.correlate(mockContext, request, {
        autoVerifyThreshold: 0.9,
      });

      expect(result.verified).toBe(true);
      expect(result.needsVerification).toBe(false);
    });

    /**
     * Test correlation below minimum threshold
     */
    it('should not create correlation below minimum threshold', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
      };

      mockConfidenceScorer.calculate.mockReturnValueOnce({
        score: 0.3,
        method: 'session',
        reasoning: 'Low confidence',
        breakdown: {},
      });

      mockPhoneMatcher.findMatches.mockResolvedValueOnce([]);
      mockPhoneMatcher.createEvidence.mockReturnValueOnce({
        method: 'phone',
        matched: false,
        weight: 1.0,
        quality: 'none',
        data: {},
      });

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await engine.correlate(mockContext, request, {
        minConfidenceThreshold: 0.4,
      });

      expect(result.created).toBe(false);
      expect(result.correlationId).toBe('');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'correlation',
        'Confidence below threshold',
        expect.objectContaining({
          score: 0.3,
          threshold: 0.4,
        }),
      );
    });

    /**
     * Test email extraction and matching from message content
     */
    it('should extract and match emails from message content', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
        messageContent: 'My email is john@example.com, please contact me',
      };

      mockEmailMatcher.extractEmails.mockReturnValueOnce(['john@example.com']);
      mockEmailMatcher.findMatches.mockResolvedValueOnce([
        {
          umamiUserId: 'user-456',
          confidence: 0.9,
          quality: 'high',
        },
      ]);
      mockEmailMatcher.createEvidence.mockReturnValueOnce({
        method: 'email',
        matched: true,
        weight: 0.9,
        quality: 'high',
        data: { bestMatch: { umamiUserId: 'user-456' } },
      });

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await engine.correlate(mockContext, request);

      expect(mockEmailMatcher.extractEmails).toHaveBeenCalledWith(request.messageContent);
      expect(mockEmailMatcher.findMatches).toHaveBeenCalledWith(mockContext, 'john@example.com');
    });

    /**
     * Test temporal session matching with user agent
     */
    it('should perform temporal session matching with user agent', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
        messageTimestamp: new Date('2025-01-01T12:00:00.000Z'),
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      };

      mockSessionMatcher.findTemporalMatches.mockResolvedValueOnce([
        {
          umamiSessionId: 'session-789',
          confidence: 0.65,
          quality: 'medium',
        },
      ]);

      mockSessionMatcher.findUserAgentMatches.mockResolvedValueOnce([
        {
          umamiSessionId: 'session-789',
          confidence: 0.75,
          quality: 'high',
        },
      ]);

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await engine.correlate(mockContext, request);

      expect(mockSessionMatcher.findTemporalMatches).toHaveBeenCalledWith(
        mockContext,
        request.messageTimestamp,
      );
      expect(mockSessionMatcher.findUserAgentMatches).toHaveBeenCalledWith(
        mockContext,
        request.userAgent,
        request.messageTimestamp,
      );
    });

    /**
     * Test behavioral matching when enabled
     */
    it('should perform behavioral matching when enabled', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
      };

      mockBehavioralMatcher.findPatternMatches.mockResolvedValueOnce([
        {
          umamiUserId: 'user-999',
          confidence: 0.6,
          quality: 'medium',
        },
      ]);

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await engine.correlate(mockContext, request, {
        enableBehavioral: true,
      });

      expect(mockBehavioralMatcher.findPatternMatches).toHaveBeenCalledWith(
        mockContext,
        request.waPhone,
      );
    });

    /**
     * Test journey mapping when enabled
     */
    it('should build journey map when enabled', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
      };

      const mockJourney = {
        waPhone: '+1234567890',
        umamiUserId: 'user-123',
        touchpoints: [
          { timestamp: '2025-01-01T10:00:00.000Z', channel: 'web', event: 'page_view' },
          { timestamp: '2025-01-01T11:00:00.000Z', channel: 'whatsapp', event: 'message_sent' },
        ],
      };

      mockJourneyMapper.buildJourney.mockResolvedValueOnce(mockJourney);

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await engine.correlate(mockContext, request, {
        enableJourneyMapping: true,
      });

      expect(mockJourneyMapper.buildJourney).toHaveBeenCalledWith(
        mockContext,
        request.waPhone,
        'user-123',
      );
      expect(mockJourneyMapper.calculateJourneyQuality).toHaveBeenCalledWith(mockJourney);
    });

    /**
     * Test verification queue for medium confidence
     */
    it('should queue for verification when confidence needs manual review', async () => {
      const request: CorrelationRequest = {
        waPhone: '+1234567890',
      };

      mockConfidenceScorer.calculate.mockReturnValueOnce({
        score: 0.65,
        method: 'session',
        reasoning: 'Medium confidence',
        breakdown: {},
      });

      mockConfidenceScorer.needsManualVerification.mockReturnValueOnce(true);

      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await engine.correlate(mockContext, request);

      expect(result.needsVerification).toBe(true);
      expect(mockVerificationManager.queueForVerification).toHaveBeenCalledWith(
        mockContext,
        expect.any(String),
        expect.stringContaining('65%'),
        expect.any(Number),
      );
    });
  });

  describe('batchCorrelate', () => {
    /**
     * Test batch processing of multiple correlation requests
     */
    it('should process batch of correlations', async () => {
      const requests: CorrelationRequest[] = [
        { waPhone: '+1111111111' },
        { waPhone: '+2222222222' },
        { waPhone: '+3333333333' },
      ];

      mockExecute.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const results = await engine.batchCorrelate(mockContext, requests, {
        batchSize: 2,
      });

      expect(results).toHaveLength(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'correlation',
        'Batch correlation complete',
        expect.objectContaining({
          totalRequests: 3,
          successCount: 3,
        }),
      );
    });

    /**
     * Test batch processing with failures
     */
    it('should handle failures in batch processing', async () => {
      const requests: CorrelationRequest[] = [
        { waPhone: '+1111111111' },
        { waPhone: '+2222222222' }, // This will fail
        { waPhone: '+3333333333' },
      ];

      mockExecute
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const results = await engine.batchCorrelate(mockContext, requests, {
        batchSize: 1,
      });

      expect(results.length).toBeLessThan(3); // Some failed
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return correlation statistics', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          {
            total: '100',
            verified: '70',
            pending: '30',
            avg_confidence: 0.75,
            correlation_method: 'phone',
            method_count: '60',
          },
          {
            total: '100',
            verified: '70',
            pending: '30',
            avg_confidence: 0.65,
            correlation_method: 'email',
            method_count: '30',
          },
          {
            total: '100',
            verified: '70',
            pending: '30',
            avg_confidence: 0.55,
            correlation_method: 'session',
            method_count: '10',
          },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const stats = await engine.getStatistics(mockContext);

      expect(stats.totalCorrelations).toBe(100);
      expect(stats.verifiedCount).toBe(70);
      expect(stats.pendingCount).toBe(30);
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(stats.methodDistribution).toHaveProperty('phone');
      expect(stats.methodDistribution.phone).toBe(60);
    });
  });

  describe('deleteCorrelation', () => {
    it('should soft delete correlation', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      await engine.deleteCorrelation(mockContext, 'corr-123');

      expect(mockExecute).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('UPDATE whatsapp_user_identity_correlation'),
        ['corr-123', 'team-123'],
      );
      expect(mockLogger.info).toHaveBeenCalledWith('correlation', 'Correlation deleted', {
        correlationId: 'corr-123',
      });
    });
  });
});
