import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startSitemapWorker } from './src/scraper/worker';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('--- SITEMAP WORKER STARTING ---');
  try {
    await checkConnection();
    await initQueue();
    await startSitemapWorker();
    logger.info('Sitemap worker is active');
  } catch (error) {
    logger.error(`Sitemap worker failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
