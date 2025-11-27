/**
 * WhatsApp Session Manager - Unit Tests
 * Tests session lifecycle, multi-tenant isolation, and concurrent session management
 */

import { SessionManager } from '../whatsapp-session-manager';
import type { TenantContext, WhatsAppSession } from '@/types/whatsapp';

// Mock dependencies
jest.mock('../whatsapp-client');
jest.mock('../whatsapp-db');
jest.mock('../whatsapp-redis');
jest.mock('../whatsapp-logger');
jest.mock('@/config/whatsapp-config');

import { createWhatsAppClient } from '../whatsapp-client';
import { executeWithContext } from '../whatsapp-db';
import { sessionStorage, cache } from '../whatsapp-redis';
import { getLogger } from '../whatsapp-logger';
import { getWhatsAppConfig } from '@/config/whatsapp-config';

const mockCreateClient = createWhatsAppClient as jest.MockedFunction<typeof createWhatsAppClient>;
const mockExecuteWithContext = executeWithContext as jest.MockedFunction<typeof executeWithContext>;
// Session storage mock - available for future tests requiring storage verification
const _mockSessionStorage = sessionStorage as jest.Mocked<typeof sessionStorage>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockGetConfig = getWhatsAppConfig as jest.MockedFunction<typeof getWhatsAppConfig>;

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockContext: TenantContext;
  let mockLogger: any;
  let mockClient: any;

  beforeEach(() => {
    // Reset singleton instance
    (SessionManager as any).instance = null;
    sessionManager = SessionManager.getInstance();

    // Setup mock context
    mockContext = {
      teamId: 'team-123',
      userRole: 'admin',
    };

    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockGetLogger.mockReturnValue(mockLogger);

    // Setup mock config
    mockGetConfig.mockReturnValue({
      maxSessions: 5,
      sessionTimeout: 3600000, // 1 hour
      qrCodeExpiry: 90000, // 90 seconds
      reconnectAttempts: 5,
      reconnectDelay: 5000,
    } as any);

    // Setup mock client
    mockClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue('active'),
      healthCheck: jest.fn().mockResolvedValue(true),
    };
    mockCreateClient.mockReturnValue(mockClient);

    // Setup mock database responses
    mockExecuteWithContext.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    // Setup mock Redis
    mockCache.set = jest.fn().mockResolvedValue(undefined);
    mockCache.get = jest.fn().mockResolvedValue(null);
    mockCache.delete = jest.fn().mockResolvedValue(1);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = SessionManager.getInstance();
      const instance2 = SessionManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(mockLogger.info).toHaveBeenCalledWith('session-manager', 'SessionManager initialized');
    });
  });

  describe('createSession', () => {
    /**
     * Test successful session creation with all components initialized
     */
    it('should create new session successfully', async () => {
      const mockSession: WhatsAppSession = {
        sessionId: 'session-123',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        sessionName: 'Test Session',
        status: 'authenticating',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [mockSession],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await sessionManager.createSession(mockContext, 'Test Session', '+1234567890');

      expect(result).toEqual(mockSession);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('INSERT INTO whatsapp_session'),
        expect.arrayContaining([
          expect.any(String), // session_id
          'team-123',
          '+1234567890',
          'Test Session',
          'authenticating',
        ]),
      );
      expect(mockCreateClient).toHaveBeenCalledWith(expect.any(String), 'team-123', '+1234567890');
    });

    /**
     * Test session limit enforcement per team
     */
    it('should reject session creation when limit exceeded', async () => {
      // Create 5 sessions to reach limit
      for (let i = 0; i < 5; i++) {
        const mockSession: WhatsAppSession = {
          sessionId: `session-${i}`,
          teamId: 'team-123',
          phoneNumber: `+123456789${i}`,
          sessionName: `Session ${i}`,
          status: 'active',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        mockExecuteWithContext.mockResolvedValueOnce({
          rows: [mockSession],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

        await sessionManager.createSession(mockContext, `Session ${i}`, `+123456789${i}`);
      }

      // Attempt to create 6th session
      await expect(
        sessionManager.createSession(mockContext, 'Extra Session', '+9876543210'),
      ).rejects.toThrow('Session limit exceeded');
    });

    /**
     * Test preventing duplicate active sessions for same team
     */
    it('should reject duplicate session for team', async () => {
      const existingSession: WhatsAppSession = {
        sessionId: 'existing-123',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        sessionName: 'Existing',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      // Mock getActiveSessionByTeam to return existing session
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [existingSession],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await expect(
        sessionManager.createSession(mockContext, 'New Session', '+1234567890'),
      ).rejects.toThrow('Session already exists');
    });
  });

  describe('getSession', () => {
    it('should retrieve session by ID', async () => {
      const mockSession: WhatsAppSession = {
        sessionId: 'session-123',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        sessionName: 'Test Session',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [mockSession],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionManager.getSession(mockContext, 'session-123');

      expect(result).toEqual(mockSession);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('SELECT * FROM whatsapp_session'),
        ['session-123'],
      );
    });

    it('should return null for non-existent session', async () => {
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionManager.getSession(mockContext, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('terminateSession', () => {
    it('should terminate session and cleanup resources', async () => {
      // Create a session first
      const mockSession: WhatsAppSession = {
        sessionId: 'session-123',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        sessionName: 'Test Session',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext
        .mockResolvedValueOnce({
          rows: [mockSession],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        });

      await sessionManager.createSession(mockContext, 'Test Session', '+1234567890');

      await sessionManager.terminateSession(mockContext, 'session-123');

      expect(mockClient.logout).toHaveBeenCalled();
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('UPDATE whatsapp_session'),
        ['session-123'],
      );
    });
  });

  describe('listSessions', () => {
    it('should list all sessions for team', async () => {
      const mockSessions: WhatsAppSession[] = [
        {
          sessionId: 'session-1',
          teamId: 'team-123',
          phoneNumber: '+1111111111',
          sessionName: 'Session 1',
          status: 'active',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          sessionId: 'session-2',
          teamId: 'team-123',
          phoneNumber: '+2222222222',
          sessionName: 'Session 2',
          status: 'disconnected',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: mockSessions,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionManager.listSessions(mockContext);

      expect(result).toEqual(mockSessions);
      expect(result).toHaveLength(2);
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', () => {
      const stats = sessionManager.getSessionStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byTeam');
      expect(typeof stats.total).toBe('number');
    });

    it('should filter stats by teamId when provided', () => {
      const stats = sessionManager.getSessionStats('team-123');

      expect(stats).toHaveProperty('total');
      expect(stats).not.toHaveProperty('byTeam');
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('should cleanup inactive sessions beyond timeout', async () => {
      // Create session with old lastActivity
      const oldDate = new Date(Date.now() - 7200000); // 2 hours ago

      const sessionInfo = {
        sessionId: 'old-session',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        client: mockClient,
        createdAt: oldDate,
        lastActivity: oldDate,
      };

      // Manually add to sessions map
      (sessionManager as any).sessions.set('old-session', sessionInfo);
      (sessionManager as any).teamSessions.set('team-123', new Set(['old-session']));

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const cleaned = await sessionManager.cleanupInactiveSessions();

      expect(cleaned).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'session-manager',
        'Cleaned up inactive sessions',
        { count: 1 },
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all sessions', async () => {
      // Create mock session
      const sessionInfo = {
        sessionId: 'session-123',
        teamId: 'team-123',
        phoneNumber: '+1234567890',
        client: mockClient,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      (sessionManager as any).sessions.set('session-123', sessionInfo);
      mockClient.healthCheck.mockResolvedValue(true);

      const result = await sessionManager.healthCheck();

      expect(result).toEqual({
        healthy: 1,
        unhealthy: 0,
        total: 1,
      });
    });
  });

  describe('shutdown', () => {
    it('should gracefully shutdown all sessions', async () => {
      // Create mock sessions
      const sessionInfo1 = {
        sessionId: 'session-1',
        teamId: 'team-123',
        phoneNumber: '+1111111111',
        client: { ...mockClient, destroy: jest.fn().mockResolvedValue(undefined) },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const sessionInfo2 = {
        sessionId: 'session-2',
        teamId: 'team-123',
        phoneNumber: '+2222222222',
        client: { ...mockClient, destroy: jest.fn().mockResolvedValue(undefined) },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      (sessionManager as any).sessions.set('session-1', sessionInfo1);
      (sessionManager as any).sessions.set('session-2', sessionInfo2);

      await sessionManager.shutdown();

      expect(sessionInfo1.client.destroy).toHaveBeenCalled();
      expect(sessionInfo2.client.destroy).toHaveBeenCalled();
      expect((sessionManager as any).sessions.size).toBe(0);
    });
  });

  describe('Multi-tenant isolation', () => {
    /**
     * Test that sessions from different teams are properly isolated
     */
    it('should isolate sessions by team', async () => {
      const team1Context: TenantContext = { teamId: 'team-1', userRole: 'admin' };
      const team2Context: TenantContext = { teamId: 'team-2', userRole: 'admin' };

      const session1: WhatsAppSession = {
        sessionId: 'session-1',
        teamId: 'team-1',
        phoneNumber: '+1111111111',
        sessionName: 'Team 1 Session',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const session2: WhatsAppSession = {
        sessionId: 'session-2',
        teamId: 'team-2',
        phoneNumber: '+2222222222',
        sessionName: 'Team 2 Session',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext
        .mockResolvedValueOnce({
          rows: [session1],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [session2],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      await sessionManager.createSession(team1Context, 'Team 1 Session', '+1111111111');
      await sessionManager.createSession(team2Context, 'Team 2 Session', '+2222222222');

      const stats = sessionManager.getSessionStats();
      expect(stats.byTeam['team-1']).toBe(1);
      expect(stats.byTeam['team-2']).toBe(1);
      expect(stats.total).toBe(2);
    });
  });
});
