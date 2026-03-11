import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../utils/config';
import * as schema from './schema';
import { logger } from '../utils/logger';

export const pool = new Pool({ 
  connectionString: config.databaseUrl,
  max: config.dbMaxConnections,
  connectionTimeoutMillis: config.dbConnectionTimeout,
  idleTimeoutMillis: config.dbIdleTimeout,
});

export const db = drizzle(pool, { schema });

// Project B (Queue DB) - Used only for connection count monitoring in Dashboard
// pg-boss handles its own connection for worker logic
export const queuePool = config.queueDatabaseUrl !== config.databaseUrl
  ? new Pool({ 
      connectionString: config.queueDatabaseUrl,
      max: 2, // Low max, only for health checks/monitoring
    })
  : null;

export async function checkConnection(): Promise<void> {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      client.release();
      logger.info('Successfully connected to database');
      return;
    } catch (err) {
      retries--;
      logger.warn(`DB connection failed. Retries left: ${retries}. ${err instanceof Error ? err.message : ''}`);
      if (retries === 0) throw new Error('Database connection failed');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
