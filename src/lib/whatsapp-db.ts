/**
 * WhatsApp Analytics Integration - Database Connection Manager
 *
 * PostgreSQL connection pool with Row-Level Security (RLS) support.
 * Ensures tenant isolation via session variables.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { getWhatsAppConfig, getDatabaseUrl } from '@/config/whatsapp-config';
import { getLogger } from '@/lib/whatsapp-logger';
import { DatabaseError } from '@/lib/whatsapp-errors';
import type { TenantContext } from '@/types/whatsapp';

const logger = getLogger();

/**
 * Database connection pool
 */
let pool: Pool | null = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initializePool(): Pool {
  if (pool) {
    return pool;
  }

  const config = getWhatsAppConfig();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new DatabaseError('DATABASE_URL is required');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    min: config.dbPoolMin,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeout,
    connectionTimeoutMillis: config.dbConnectionTimeout,
  });

  // Error handling for pool
  pool.on('error', err => {
    logger.error('database', 'Unexpected pool error', err);
  });

  pool.on('connect', () => {
    logger.debug('database', 'New client connected to pool');
  });

  pool.on('remove', () => {
    logger.debug('database', 'Client removed from pool');
  });

  logger.info('database', 'PostgreSQL connection pool initialized', {
    min: config.dbPoolMin,
    max: config.dbPoolMax,
  });

  return pool;
}

/**
 * Get connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Set session variables for RLS
 */
async function setSessionContext(client: PoolClient, context: TenantContext): Promise<void> {
  try {
    // Set tenant context
    await client.query('SET LOCAL app.current_team_id = $1', [context.teamId]);

    // Set user role
    await client.query('SET LOCAL app.current_user_role = $1', [context.userRole]);

    logger.debug('database', 'Session context set', {
      teamId: context.teamId,
      userRole: context.userRole,
    });
  } catch (error) {
    logger.error('database', 'Failed to set session context', error as Error, {
      teamId: context.teamId,
    });
    throw new DatabaseError('Failed to set session context', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Execute query with tenant context
 */
export async function executeWithContext<T = any>(
  context: TenantContext,
  query: string,
  values?: any[],
): Promise<QueryResult<T>> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setSessionContext(client, context);

    const config = getWhatsAppConfig();
    if (config.dbLogQueries) {
      logger.debug('database', 'Executing query', { query, values });
    }

    const result = await client.query<T>(query, values);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('database', 'Query execution failed', error as Error, {
      query: query.substring(0, 200),
    });
    throw new DatabaseError('Query execution failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction with tenant context
 */
export async function transactionWithContext<T>(
  context: TenantContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setSessionContext(client, context);

    const result = await callback(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('database', 'Transaction failed', error as Error);
    throw new DatabaseError('Transaction failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    client.release();
  }
}

/**
 * Execute query without tenant context (use with caution)
 * Only for system-level operations
 */
export async function executeRaw<T = any>(query: string, values?: any[]): Promise<QueryResult<T>> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const result = await client.query<T>(query, values);
    return result;
  } catch (error) {
    logger.error('database', 'Raw query execution failed', error as Error, {
      query: query.substring(0, 200),
    });
    throw new DatabaseError('Raw query execution failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    client.release();
  }
}

/**
 * Check database connection health
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    logger.error('database', 'Connection health check failed', error as Error);
    return false;
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats() {
  if (!pool) {
    return null;
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Close database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('database', 'Connection pool closed');
  }
}

/**
 * Helper to build WHERE clause with tenant filter
 */
export function buildTenantFilter(teamId: string, additionalFilters?: string): string {
  const filters = [`team_id = '${teamId}'`];

  if (additionalFilters) {
    filters.push(additionalFilters);
  }

  return filters.join(' AND ');
}

/**
 * Helper to paginate query results
 */
export function buildPaginationQuery(
  baseQuery: string,
  page: number = 1,
  pageSize: number = 20,
  orderBy: string = 'created_at',
  orderDirection: 'ASC' | 'DESC' = 'DESC',
): string {
  const offset = (page - 1) * pageSize;
  return `
    ${baseQuery}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
}

/**
 * Helper to count total rows
 */
export async function countRows(
  context: TenantContext,
  query: string,
  values?: any[],
): Promise<number> {
  const countQuery = `SELECT COUNT(*) as total FROM (${query}) as subquery`;
  const result = await executeWithContext<{ total: string }>(context, countQuery, values);
  return parseInt(result.rows[0]?.total || '0', 10);
}

/**
 * Helper for paginated queries with count
 */
export async function executePaginated<T>(
  context: TenantContext,
  baseQuery: string,
  values: any[] = [],
  page: number = 1,
  pageSize: number = 20,
  orderBy: string = 'created_at',
  orderDirection: 'ASC' | 'DESC' = 'DESC',
): Promise<{
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  // Get total count
  const total = await countRows(context, baseQuery, values);

  // Build paginated query
  const paginatedQuery = buildPaginationQuery(baseQuery, page, pageSize, orderBy, orderDirection);

  // Execute query
  const result = await executeWithContext<T>(context, paginatedQuery, values);

  return {
    data: result.rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Create database query builder for WhatsApp tables
 */
export class WhatsAppQueryBuilder {
  private context: TenantContext;

  constructor(context: TenantContext) {
    this.context = context;
  }

  /**
   * Execute query with context
   */
  async execute<T = any>(query: string, values?: any[]): Promise<QueryResult<T>> {
    return executeWithContext<T>(this.context, query, values);
  }

  /**
   * Execute transaction with context
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return transactionWithContext(this.context, callback);
  }

  /**
   * Execute paginated query
   */
  async executePaginated<T>(
    query: string,
    values?: any[],
    page?: number,
    pageSize?: number,
    orderBy?: string,
    orderDirection?: 'ASC' | 'DESC',
  ) {
    return executePaginated<T>(
      this.context,
      query,
      values,
      page,
      pageSize,
      orderBy,
      orderDirection,
    );
  }
}

/**
 * Create query builder with tenant context
 */
export function createQueryBuilder(context: TenantContext): WhatsAppQueryBuilder {
  return new WhatsAppQueryBuilder(context);
}

// Export pool management functions
export { initializePool };

// Default export
export default {
  getPool,
  executeWithContext,
  transactionWithContext,
  executeRaw,
  checkConnection,
  getPoolStats,
  closePool,
  createQueryBuilder,
  buildTenantFilter,
  buildPaginationQuery,
  countRows,
  executePaginated,
};
