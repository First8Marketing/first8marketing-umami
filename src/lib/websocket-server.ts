/**
 * WhatsApp Analytics Integration - WebSocket Server
 *
 * Socket.io server initialization with Redis adapter for horizontal scaling.
 * Handles authentication, team-based rooms, and connection management.
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getPublisher, getSubscriber } from '@/lib/whatsapp-redis';
import { parseSecureToken } from '@/lib/jwt';
import { secret } from '@/lib/crypto';
import { getUser } from '@/queries/prisma/user';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';

const logger = getLogger();

/**
 * Socket data interface with authentication info
 */
interface SocketData {
  userId: string;
  teamId: string;
  userRole: string;
}

/**
 * Connection tracking
 */
interface ConnectionInfo {
  socketId: string;
  userId: string;
  teamId: string;
  connectedAt: Date;
}

/**
 * WhatsApp WebSocket Server
 * Manages real-time connections with authentication and team isolation
 */
export class WhatsAppWebSocketServer {
  private io: SocketServer;
  private connections: Map<string, Set<ConnectionInfo>> = new Map(); // teamId -> connections
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private initialized = false;

  constructor(httpServer: HTTPServer) {
    // Initialize Socket.io with configuration
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || '*',
        credentials: true,
        methods: ['GET', 'POST'],
      },
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: false,
    });

    logger.info('websocket', 'WebSocket server created');
  }

  /**
   * Initialize server with Redis adapter and event handlers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('websocket', 'Server already initialized');
      return;
    }

    try {
      // Setup Redis adapter for cross-instance communication
      await this.setupRedisAdapter();

      // Setup authentication middleware
      this.setupMiddleware();

      // Setup connection handlers
      this.setupEventHandlers();

      this.initialized = true;
      logger.info('websocket', 'WebSocket server initialized successfully');
    } catch (error) {
      logger.error('websocket', 'Failed to initialize WebSocket server', error as Error);
      throw new InternalError('WebSocket server initialization failed');
    }
  }

  /**
   * Setup Redis adapter for horizontal scaling
   */
  private async setupRedisAdapter(): Promise<void> {
    try {
      const pubClient = getPublisher();
      const subClient = getSubscriber();

      // Create and attach adapter
      const adapter = createAdapter(pubClient, subClient);
      this.io.adapter(adapter);

      logger.info('websocket', 'Redis adapter configured');
    } catch (error) {
      logger.error('websocket', 'Failed to setup Redis adapter', error as Error);
      throw error;
    }
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: Socket, next) => {
      try {
        // Extract token from handshake
        const token =
          socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        const teamId = socket.handshake.query.teamId as string;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        if (!teamId) {
          return next(new Error('Team ID required'));
        }

        // Validate JWT token
        const payload = parseSecureToken(token, secret());
        if (!payload?.userId) {
          return next(new Error('Invalid authentication token'));
        }

        // Get user from database
        const user = await getUser(payload.userId);
        if (!user) {
          return next(new Error('User not found'));
        }

        // Validate team access (simplified - should check team membership)
        // In production, verify user has access to this team
        const hasTeamAccess = true; // TODO: Implement team access check

        if (!hasTeamAccess) {
          return next(new Error('Access denied to team'));
        }

        // Store auth data in socket
        socket.data.userId = user.id;
        socket.data.teamId = teamId;
        socket.data.userRole = user.role;

        logger.debug('websocket', 'Socket authenticated', {
          socketId: socket.id,
          userId: user.id,
          teamId,
        });

        next();
      } catch (error) {
        logger.error('websocket', 'Authentication failed', error as Error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket<any, any, any, SocketData>) => {
      const { userId, teamId, userRole } = socket.data;

      logger.info('websocket', 'Client connected', {
        socketId: socket.id,
        userId,
        teamId,
        userRole,
      });

      // Join team-specific room
      socket.join(`team:${teamId}`);
      socket.join(`user:${userId}`);

      // Track connection
      this.trackConnection(teamId, userId, socket.id);

      // Send connection confirmation
      socket.emit('connected', {
        socketId: socket.id,
        timestamp: new Date(),
        teamId,
      });

      // Handle disconnection
      socket.on('disconnect', reason => {
        logger.info('websocket', 'Client disconnected', {
          socketId: socket.id,
          userId,
          teamId,
          reason,
        });

        this.removeConnection(teamId, userId, socket.id);
      });

      // Handle heartbeat/ping
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle errors
      socket.on('error', error => {
        logger.error('websocket', 'Socket error', error as Error, {
          socketId: socket.id,
          userId,
          teamId,
        });
      });

      // Subscribe to team-specific events
      socket.onAny((event, ...args) => {
        logger.debug('websocket', 'Event received', {
          event,
          socketId: socket.id,
          userId,
          teamId,
          argsCount: args.length,
        });
      });
    });
  }

  /**
   * Track active connection
   */
  private trackConnection(teamId: string, userId: string, socketId: string): void {
    // Track by team
    if (!this.connections.has(teamId)) {
      this.connections.set(teamId, new Set());
    }
    this.connections.get(teamId)!.add({
      socketId,
      userId,
      teamId,
      connectedAt: new Date(),
    });

    // Track by user
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);

    logger.debug('websocket', 'Connection tracked', {
      teamId,
      userId,
      socketId,
      teamConnections: this.connections.get(teamId)?.size,
      userConnections: this.userSockets.get(userId)?.size,
    });
  }

  /**
   * Remove connection tracking
   */
  private removeConnection(teamId: string, userId: string, socketId: string): void {
    // Remove from team connections
    const teamConnections = this.connections.get(teamId);
    if (teamConnections) {
      const connection = Array.from(teamConnections).find(c => c.socketId === socketId);
      if (connection) {
        teamConnections.delete(connection);
      }
      if (teamConnections.size === 0) {
        this.connections.delete(teamId);
      }
    }

    // Remove from user sockets
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    logger.debug('websocket', 'Connection removed', {
      teamId,
      userId,
      socketId,
    });
  }

  /**
   * Get Socket.io server instance
   */
  getIO(): SocketServer {
    return this.io;
  }

  /**
   * Get active connections count for a team
   */
  getTeamConnectionsCount(teamId: string): number {
    return this.connections.get(teamId)?.size || 0;
  }

  /**
   * Get active connections count for a user
   */
  getUserConnectionsCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  /**
   * Get all active teams
   */
  getActiveTeams(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    totalTeams: number;
    totalUsers: number;
  } {
    let totalConnections = 0;
    this.connections.forEach(connections => {
      totalConnections += connections.size;
    });

    return {
      totalConnections,
      totalTeams: this.connections.size,
      totalUsers: this.userSockets.size,
    };
  }

  /**
   * Close server and cleanup
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Disconnect all clients
      this.io.disconnectSockets();

      // Close server
      await new Promise<void>(resolve => {
        this.io.close(() => {
          resolve();
        });
      });

      // Clear connection tracking
      this.connections.clear();
      this.userSockets.clear();

      this.initialized = false;
      logger.info('websocket', 'WebSocket server closed');
    } catch (error) {
      logger.error('websocket', 'Error closing WebSocket server', error as Error);
      throw error;
    }
  }
}

// Singleton instance
let wsServer: WhatsAppWebSocketServer | null = null;

/**
 * Initialize WebSocket server
 */
export async function initializeWebSocketServer(
  httpServer: HTTPServer,
): Promise<WhatsAppWebSocketServer> {
  if (wsServer) {
    logger.warn('websocket', 'WebSocket server already exists');
    return wsServer;
  }

  wsServer = new WhatsAppWebSocketServer(httpServer);
  await wsServer.initialize();
  return wsServer;
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): WhatsAppWebSocketServer | null {
  return wsServer;
}

/**
 * Close WebSocket server
 */
export async function closeWebSocketServer(): Promise<void> {
  if (wsServer) {
    await wsServer.close();
    wsServer = null;
  }
}
