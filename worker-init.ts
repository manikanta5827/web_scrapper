import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startSitemapWorker, startPageWorker } from './src/scraper/worker';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  const type = process.argv[2]; // 'sitemap' or 'page'

  if (!type || (type !== 'sitemap' && type !== 'page')) {
    console.error('Usage: bun worker-init.ts <sitemap|page>');
    process.exit(1);
  }

  logger.info(`--- ${type.toUpperCase()} WORKER STARTING ---`);
  try {
    await checkConnection();
    await initQueue();
    
    if (type === 'sitemap') {
      await startSitemapWorker();
    } else {
      await startPageWorker();
    }
    
    logger.info(`${type.charAt(0).toUpperCase() + type.slice(1)} worker is active`);
  } catch (error) {
    logger.error(`Worker failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
