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

// Project B (Queue DB)
export const queuePool = new Pool({ 
  connectionString: config.queueDatabaseUrl,
  max: 5, // Low max for monitoring/health checks
});

export async function checkConnection(): Promise<void> {
  await Promise.all([
    verifyPool(pool, 'Main Database'),
    verifyPool(queuePool, 'Queue Database')
  ]);
}

async function verifyPool(targetPool: Pool, name: string): Promise<void> {
  let retries = 3;
  while (retries > 0) {
    try {
      const client = await targetPool.connect();
      client.release();
      logger.info(`Successfully connected to ${name}`);
      return;
    } catch (err) {
      retries--;
      logger.warn(`${name} connection failed. Retries left: ${retries}. ${err instanceof Error ? err.message : ''}`);
      if (retries === 0) throw new Error(`${name} connection failed`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export async function closeDb(): Promise<void> {
  await Promise.all([
    pool.end(),
    queuePool.end()
  ]);
}
