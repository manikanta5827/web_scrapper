import { PgBoss } from 'pg-boss';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

// pg-boss can take constructor options. 
// We keep 'max' conservative to prevent saturating the Supabase pool.
export const boss = new PgBoss({
  connectionString: config.queueDatabaseUrl,
  max: config.bossMaxConnections,
});

boss.on('error', (e: Error) => logger.error(`pg-boss: ${e.message}`));

export async function initQueue(): Promise<void> {
  await boss.start();
  
  // 1. Create the Dead Letter Queue
  await boss.createQueue('dead_letter');

  // 2. Create specialized queues linked to the DLQ
  // retryLimit here is a default for the queue if not specified in send()
  await boss.createQueue('sitemap_queue', {
    deadLetter: 'dead_letter'
  });

  await boss.createQueue('page_queue', {
    deadLetter: 'dead_letter'
  });
  
  logger.info('pg-boss queues started: "sitemap_queue", "page_queue" and "dead_letter" verified');
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
  logger.info('pg-boss queues stopped');
}
