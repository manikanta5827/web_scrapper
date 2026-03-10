import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startPageWorker } from './src/scraper/worker';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('--- PAGE SCRAPER WORKER STARTING ---');
  try {
    await checkConnection();
    await initQueue();
    await startPageWorker();
    logger.info('Page scraper worker is active');
  } catch (error) {
    logger.error(`Page worker failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  try {
    await stopQueue();
    await closeDb();
  } catch (error) {
    logger.error(`Shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

main();
