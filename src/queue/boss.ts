import { PgBoss } from 'pg-boss';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

// pg-boss can take constructor options instead of just a string
export const boss = new PgBoss({
  connectionString: config.databaseUrl,
  max: config.bossMaxConnections, // Explicitly limit the pool size for pg-boss
});

boss.on('error', (e: Error) => logger.error(`pg-boss: ${e.message}`));

export async function initQueue(): Promise<void> {
  await boss.start();
  
  // Explicitly create the queues so workers don't crash on startup
  // If they already exist, this does nothing.
  await boss.createQueue('page_queue');
  await boss.createQueue('sitemap_queue');
  
  logger.info('pg-boss queue started and "page_queue", "sitemap_queue" verified');
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
  logger.info('pg-boss queue stopped');
}
