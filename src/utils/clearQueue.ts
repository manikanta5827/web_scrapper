import { boss, initQueue, stopQueue } from '../queue/boss';
import { checkConnection } from '../db/client';
import { logger } from './logger';

async function clear() {
  try {
    await checkConnection();
    await initQueue();

    logger.info('Clearing all jobs from "sitemap_queue" and "page_queue"...');
    
    // This removes all jobs (queued, active, completed, failed) for these specific queues
    await boss.deleteAllJobs('sitemap_queue');
    await boss.deleteAllJobs('page_queue');
    await boss.deleteAllJobs('dead_letter');
    
    logger.info('Queues (including DLQ) cleared successfully.');
  } catch (error) {
    logger.error(`Failed to clear queues: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await stopQueue();
    process.exit(0);
  }
}

clear();
