import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startWorker } from './src/scraper/worker';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('--- WORKER PROCESS STARTING ---');

  try {
    // 1. Verify DB Connection
    await checkConnection();

    // 2. Start pg-boss (for polling jobs)
    await initQueue();

    // 3. Start Workers (to process the queue)
    await startWorker();

    logger.info('Worker is active and polling the queue');

  } catch (error) {
    logger.error(`Worker startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down worker gracefully...');
  try {
    await stopQueue();
    await closeDb();
    logger.info('Worker shutdown complete');
  } catch (error) {
    logger.error(`Worker shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

if (import.meta.main) {
  main();
}
