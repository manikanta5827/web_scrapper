import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { logger } from './logger';

async function migrateToIST() {
  logger.info('Starting migration of existing records to IST...');

  try {
    // Update sitemaps
    const sitemapsResult = await db.execute(sql`
      UPDATE sitemaps 
      SET 
        created_at = created_at + interval '5 hours 30 minutes',
        updated_at = updated_at + interval '5 hours 30 minutes',
        last_mod = last_mod + interval '5 hours 30 minutes'
    `);
    logger.info('Updated sitemaps table.');

    // Update urls
    const urlsResult = await db.execute(sql`
      UPDATE urls 
      SET 
        created_at = created_at + interval '5 hours 30 minutes',
        updated_at = updated_at + interval '5 hours 30 minutes',
        last_mod = last_mod + interval '5 hours 30 minutes',
        last_scraped_at = last_scraped_at + interval '5 hours 30 minutes'
    `);
    logger.info('Updated urls table.');

    // Update health_checks
    const healthResult = await db.execute(sql`
      UPDATE health_checks 
      SET 
        last_seen = last_seen + interval '5 hours 30 minutes'
    `);
    logger.info('Updated health_checks table.');

    logger.info('Migration to IST completed successfully.');
  } catch (error) {
    logger.error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrateToIST();
