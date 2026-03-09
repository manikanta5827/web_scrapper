import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../utils/config';
import * as schema from './schema';
import { logger } from '../utils/logger';

const pool = new Pool({ connectionString: config.databaseUrl });
export const db = drizzle(pool, { schema });

export async function checkConnection(): Promise<void> {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      client.release();
      logger.info('Connected to local database');
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
