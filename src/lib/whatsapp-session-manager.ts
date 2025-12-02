/**
 * WhatsApp Analytics Integration - Session Manager
 *
 * Orchestrates multiple WhatsApp client sessions for multi-tenant support.
 * Manages session lifecycle, state persistence, and concurrent session limits.
 */

import { v4 as uuidv4 } from 'uuid';
import { WhatsAppClientManager, createWhatsAppClient } from '@/lib/whatsapp-client';
import { executeWithContext } from '@/lib/whatsapp-db';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { getWhatsAppConfig } from '@/config/whatsapp-config';
import {
  SessionAlreadyExistsError,
  SessionLimitExceededError,
  InternalError,
} from '@/lib/whatsapp-errors';
import type { WhatsAppSession, WhatsAppSessionStatus, TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Session info for tracking active sessions
 */
interface SessionInfo {
  sessionId: string;
  teamId: string;
  phoneNumber?: string;
  client: WhatsAppClientManager;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Session manager for multi-tenant WhatsApp clients
 */
export class SessionManager {
  private static instance: SessionManager | null = null;
  private sessions: Map<string, SessionInfo> = new Map();
  private teamSessions: Map<string, Set<string>> = new Map();
  private config = getWhatsAppConfig();

  private constructor() {
    logger.info('session-manager', 'SessionManager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Get session count for a team
   */
  private getTeamSessionCount(teamId: string): number {
    return this.teamSessions.get(teamId)?.size || 0;
  }

  /**
   * Check if team can create new session
   */
  private canCreateSession(teamId: string): boolean {
    const count = this.getTeamSessionCount(teamId);
    return count < this.config.maxSessions;
  }

  /**
   * Add session to tracking
   */
  private addSessionToTeam(teamId: string, sessionId: string): void {
    if (!this.teamSessions.has(teamId)) {
      this.teamSessions.set(teamId, new Set());
    }
    this.teamSessions.get(teamId)!.add(sessionId);
  }

  /**
   * Remove session from tracking
   */
  private removeSessionFromTeam(teamId: string, sessionId: string): void {
    const sessions = this.teamSessions.get(teamId);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.teamSessions.delete(teamId);
      }
    }
  }

  /**
   * Create new WhatsApp session
   */
  async createSession(
    context: TenantContext,
    sessionName: string,
    phoneNumber?: string,
  ): Promise<WhatsAppSession> {
    const { teamId } = context;

    try {
      // Check session limit
      if (!this.canCreateSession(teamId)) {
        throw new SessionLimitExceededError(this.config.maxSessions);
      }

      // Check if session already exists for team
      const existingSession = await this.getActiveSessionByTeam(context);
      if (existingSession) {
        throw new SessionAlreadyExistsError(teamId);
      }

      // Generate session ID
      const sessionId = uuidv4();

      logger.info('session-manager', 'Creating new session', {
        sessionId,
        teamId,
        sessionName,
      });

      // Create database record
      const query = `
        INSERT INTO whatsapp_session (
          session_id, team_id, phone_number, session_name, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await executeWithContext<WhatsAppSession>(context, query, [
        sessionId,
        teamId,
        phoneNumber,
        sessionName,
        'authenticating',
      ]);

      const session = result.rows[0];

      // Create WhatsApp client
      const client = createWhatsAppClient(sessionId, teamId, phoneNumber);

      // Store session info
      const sessionInfo: SessionInfo = {
        sessionId,
        teamId,
        phoneNumber,
        client,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.sessions.set(sessionId, sessionInfo);
      this.addSessionToTeam(teamId, sessionId);

      // Initialize client asynchronously
      this.initializeClient(sessionInfo, context).catch(error => {
        logger.error('session-manager', 'Failed to initialize client', error);
      });

      logger.info('session-manager', 'Session created', { sessionId, teamId });

      return session;
    } catch (error) {
      logger.error('session-manager', 'Failed to create session', error as Error);
      throw error;
    }
  }

  /**
   * Initialize WhatsApp client
   */
  private async initializeClient(sessionInfo: SessionInfo, context: TenantContext): Promise<void> {
    const { sessionId, client } = sessionInfo;

    try {
      // Setup event handlers before initialization
      this.setupClientHandlers(sessionInfo, context);

      // Initialize client
      await client.initialize();

      logger.info('session-manager', 'Client initialized', { sessionId });
    } catch (error) {
      logger.error('session-manager', 'Client initialization failed', error as Error);

      // Update session status to failed
      await this.updateSessionStatus(context, sessionId, 'failed');
    }
  }

  /**
   * Setup client event handlers
   */
  private setupClientHandlers(sessionInfo: SessionInfo, context: TenantContext): void {
    const { sessionId, client } = sessionInfo;

    // QR code event
    client.on('qr', async (qrCode: string) => {
      logger.info('session-manager', 'QR code received', { sessionId });
      await this.handleQrCode(context, sessionId, qrCode);
    });

    // Ready event
    client.on('ready', async () => {
      logger.info('session-manager', 'Client ready', { sessionId });
      await this.updateSessionStatus(context, sessionId, 'active');
      sessionInfo.lastActivity = new Date();
    });

    // Authenticated event
    client.on('authenticated', async () => {
      logger.info('session-manager', 'Client authenticated', { sessionId });
      await this.updateSessionStatus(context, sessionId, 'active');
    });

    // Auth failure event
    client.on('auth_failure', async (msg: string) => {
      logger.error('session-manager', 'Auth failure', new Error(msg), { sessionId });
      await this.updateSessionStatus(context, sessionId, 'failed');
    });

    // Disconnected event
    client.on('disconnected', async (reason: string) => {
      logger.warn('session-manager', 'Client disconnected', { sessionId, reason });
      await this.updateSessionStatus(context, sessionId, 'disconnected');
    });

    // Update last activity on messages
    client.on('message', () => {
      sessionInfo.lastActivity = new Date();
    });

    client.on('message_create', () => {
      sessionInfo.lastActivity = new Date();
    });
  }

  /**
   * Handle QR code update
   */
  private async handleQrCode(
    context: TenantContext,
    sessionId: string,
    qrCode: string,
  ): Promise<void> {
    try {
      // Update database with QR code
      const query = `
        UPDATE whatsapp_session
        SET qr_code = $1, updated_at = NOW()
        WHERE session_id = $2
      `;

      await executeWithContext(context, query, [qrCode, sessionId]);

      // Cache QR code with 90 second TTL
      await cache.set(`qr:${sessionId}`, qrCode, 90);

      logger.debug('session-manager', 'QR code saved', { sessionId });
    } catch (error) {
      logger.error('session-manager', 'Failed to save QR code', error as Error);
    }
  }

  /**
   * Update session status
   */
  private async updateSessionStatus(
    context: TenantContext,
    sessionId: string,
    status: WhatsAppSessionStatus,
  ): Promise<void> {
    try {
      const query = `
        UPDATE whatsapp_session
        SET status = $1, updated_at = NOW(), last_seen_at = NOW()
        WHERE session_id = $2
      `;

      await executeWithContext(context, query, [status, sessionId]);

      logger.debug('session-manager', 'Session status updated', { sessionId, status });
    } catch (error) {
      logger.error('session-manager', 'Failed to update session status', error as Error);
    }
  }

  /**
   * Get session by ID
   */
  async getSession(context: TenantContext, sessionId: string): Promise<WhatsAppSession | null> {
    try {
      const query = `
        SELECT * FROM whatsapp_session
        WHERE session_id = $1 AND deleted_at IS NULL
      `;

      const result = await executeWithContext<WhatsAppSession>(context, query, [sessionId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('session-manager', 'Failed to get session', error as Error);
      throw new InternalError('Failed to get session');
    }
  }

  /**
   * Get active session for team
   */
  async getActiveSessionByTeam(context: TenantContext): Promise<WhatsAppSession | null> {
    try {
      const query = `
        SELECT * FROM whatsapp_session
        WHERE team_id = $1 AND status IN ('authenticating', 'active', 'reconnecting')
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await executeWithContext<WhatsAppSession>(context, query, [context.teamId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('session-manager', 'Failed to get active session', error as Error);
      return null;
    }
  }

  /**
   * Get client by session ID
   */
  getClient(sessionId: string): WhatsAppClientManager | null {
    const sessionInfo = this.sessions.get(sessionId);
    return sessionInfo?.client || null;
  }

  /**
   * Get all sessions for a team
   */
  async listSessions(context: TenantContext): Promise<WhatsAppSession[]> {
    try {
      const query = `
        SELECT * FROM whatsapp_session
        WHERE team_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;

      const result = await executeWithContext<WhatsAppSession>(context, query, [context.teamId]);

      return result.rows;
    } catch (error) {
      logger.error('session-manager', 'Failed to list sessions', error as Error);
      throw new InternalError('Failed to list sessions');
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(teamId?: string): {
    total: number;
    byStatus: Record<string, number>;
    byTeam?: Record<string, number>;
  } {
    const stats: {
      total: number;
      byStatus: Record<string, number>;
      byTeam: Record<string, number>;
    } = {
      total: this.sessions.size,
      byStatus: {},
      byTeam: {},
    };

    for (const [, sessionInfo] of this.sessions) {
      if (teamId && sessionInfo.teamId !== teamId) {
        continue;
      }

      const status = sessionInfo.client.getStatus();
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      if (!teamId) {
        stats.byTeam[sessionInfo.teamId] = (stats.byTeam[sessionInfo.teamId] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Terminate session
   */
  async terminateSession(context: TenantContext, sessionId: string): Promise<void> {
    try {
      logger.info('session-manager', 'Terminating session', { sessionId });

      const sessionInfo = this.sessions.get(sessionId);
      if (sessionInfo) {
        // Logout and destroy client
        await sessionInfo.client.logout();

        // Remove from tracking
        this.sessions.delete(sessionId);
        this.removeSessionFromTeam(sessionInfo.teamId, sessionId);
      }

      // Soft delete in database
      const query = `
        UPDATE whatsapp_session
        SET status = 'disconnected', deleted_at = NOW(), updated_at = NOW()
        WHERE session_id = $1
      `;

      await executeWithContext(context, query, [sessionId]);

      logger.info('session-manager', 'Session terminated', { sessionId });
    } catch (error) {
      logger.error('session-manager', 'Failed to terminate session', error as Error);
      throw new InternalError('Failed to terminate session');
    }
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupInactiveSessions(): Promise<number> {
    let cleaned = 0;
    const timeout = this.config.sessionTimeout;
    const now = Date.now();

    for (const [sessionId, sessionInfo] of this.sessions) {
      const inactive = now - sessionInfo.lastActivity.getTime() > timeout;

      if (inactive) {
        logger.info('session-manager', 'Cleaning up inactive session', { sessionId });

        try {
          const context: TenantContext = {
            teamId: sessionInfo.teamId,
            userRole: 'admin',
          };

          await this.terminateSession(context, sessionId);
          cleaned++;
        } catch (error) {
          logger.error('session-manager', 'Failed to cleanup session', error as Error);
        }
      }
    }

    if (cleaned > 0) {
      logger.info('session-manager', 'Cleaned up inactive sessions', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Health check for all sessions
   */
  async healthCheck(): Promise<{ healthy: number; unhealthy: number; total: number }> {
    const results = { healthy: 0, unhealthy: 0, total: this.sessions.size };

    for (const [sessionId, sessionInfo] of this.sessions) {
      try {
        const isHealthy = await sessionInfo.client.healthCheck();
        if (isHealthy) {
          results.healthy++;
        } else {
          results.unhealthy++;
        }
      } catch (error) {
        logger.error('session-manager', 'Health check failed', error as Error, { sessionId });
        results.unhealthy++;
      }
    }

    return results;
  }

  /**
   * Shutdown all sessions gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('session-manager', 'Shutting down all sessions', {
      count: this.sessions.size,
    });

    const promises: Promise<void>[] = [];

    for (const [sessionId, sessionInfo] of this.sessions) {
      promises.push(
        sessionInfo.client.destroy().catch(error => {
          logger.error('session-manager', 'Failed to destroy client', error, { sessionId });
        }),
      );
    }

    await Promise.all(promises);

    this.sessions.clear();
    this.teamSessions.clear();

    logger.info('session-manager', 'All sessions shut down');
  }
}

/**
 * Get session manager instance
 */
export function getSessionManager(): SessionManager {
  return SessionManager.getInstance();
}

export default SessionManager;
