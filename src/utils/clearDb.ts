import { db, checkConnection, closeDb } from '../db/client';
import { sitemaps, urls, healthChecks } from '../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from './logger';

async function clear() {
  try {
    await checkConnection();

    logger.info('Deleting all data from "urls", "sitemaps", and "health_checks" tables...');
    
    // We use a raw SQL TRUNCATE with CASCADE to handle the foreign key relationship
    // This is much faster and cleaner than individual deletes
    await db.execute(sql`TRUNCATE TABLE ${urls} RESTART IDENTITY CASCADE`);
    await db.execute(sql`TRUNCATE TABLE ${sitemaps} RESTART IDENTITY CASCADE`);
    await db.execute(sql`TRUNCATE TABLE ${healthChecks} RESTART IDENTITY CASCADE`);
    
    logger.info('Database tables cleared successfully.');
  } catch (error) {
    logger.error(`Failed to clear database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await closeDb();
    process.exit(0);
  }
}

clear();
