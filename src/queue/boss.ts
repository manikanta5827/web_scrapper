import { PgBoss } from 'pg-boss';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

// pg-boss can take constructor options. 
// We keep 'max' conservative to prevent saturating the Supabase pool.
export const boss = new PgBoss({
  connectionString: config.databaseUrl,
  max: config.bossMaxConnections,
});

boss.on('error', (e: Error) => logger.error(`pg-boss: ${e.message}`));

export async function initQueue(): Promise<void> {
  await boss.start();
  
  // Create specialized queues
  await boss.createQueue('sitemap_queue');
  await boss.createQueue('page_queue');
  
  logger.info('pg-boss queues started: "sitemap_queue" and "page_queue" verified');
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
  logger.info('pg-boss queues stopped');
}
