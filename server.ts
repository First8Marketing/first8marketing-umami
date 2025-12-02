/**
 * Custom Next.js Server with WebSocket Support
 *
 * Integrates Socket.io WebSocket server with Next.js for real-time communication.
 * Uses DragonflyDB-compatible Redis for pub/sub and session management.
 */

import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import { initializeWebSocketServer, closeWebSocketServer } from '@/lib/websocket-server';
import { getLogger } from '@/lib/whatsapp-logger';
import { checkConnection } from '@/lib/whatsapp-redis';

const logger = getLogger();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3001', 10);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Start server with WebSocket support
 */
async function startServer() {
  try {
    // Prepare Next.js app
    logger.info('server', 'Preparing Next.js application...');
    await app.prepare();

    // Create HTTP server
    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        logger.error('server', 'Error handling request', err as Error);
        res.statusCode = 500;
        res.end('Internal server error');
      }
    });

    // Verify DragonflyDB/Redis connection
    logger.info('server', 'Checking DragonflyDB connection...');
    const redisConnected = await checkConnection();
    if (!redisConnected) {
      logger.warn('server', 'DragonflyDB connection failed - some features may not work');
    } else {
      logger.info('server', 'DragonflyDB connected successfully');
    }

    // Initialize WebSocket server
    logger.info('server', 'Initializing WebSocket server...');
    await initializeWebSocketServer(server);
    logger.info('server', 'WebSocket server initialized');

    // Start listening
    await new Promise<void>(resolve => {
      server.listen(port, () => {
        logger.info('server', `Server started successfully`, {
          url: `http://${hostname}:${port}`,
          env: process.env.NODE_ENV,
          pid: process.pid,
        });
        resolve();
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info('server', `${signal} received, starting graceful shutdown...`);

      try {
        // Close WebSocket server
        await closeWebSocketServer();
        logger.info('server', 'WebSocket server closed');

        // Close HTTP server
        await new Promise<void>((resolve, reject) => {
          server.close(err => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.info('server', 'HTTP server closed');

        // Close Next.js
        await app.close();
        logger.info('server', 'Next.js closed');

        logger.info('server', 'Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('server', 'Error during shutdown', error as Error);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', error => {
      logger.error('server', 'Uncaught exception', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('server', 'Unhandled rejection', reason as Error, {
        promise: String(promise),
      });
    });
  } catch (error) {
    logger.error('server', 'Failed to start server', error as Error);
    process.exit(1);
  }
}

// Start the server
startServer();
