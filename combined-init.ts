import { startServer } from './src/api/server';
import { startSitemapWorker, startPageWorker } from './src/scraper/worker';
import { initQueue, stopQueue } from './src/queue/boss';
import { checkConnection, closeDb } from './src/db/client';
import { hydrateConfig } from './src/utils/config';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('--- STARTING COMBINED SERVICE (API + WORKERS) ---');

  try {
    // 1. Load Dynamic Configs from AWS SSM FIRST
    await hydrateConfig();

    // 2. Verify DB Connection
    await checkConnection();

    // 3. Initialize Queue (once for the whole process)
    await initQueue();

    // 3. Start Workers
    // These run as background tasks in the same event loop
    await startSitemapWorker();
    await startPageWorker();

    // 4. Start API Server (Foreground)
    startServer();

    logger.info('All services (API, Sitemap Worker, Page Worker) are operational in one process.');
  } catch (error) {
    logger.error(`Combined service startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('Gracefully shutting down combined service...');
  try {
    await stopQueue();
    await closeDb();
    logger.info('Shutdown complete');
  } catch (error) {
    logger.error(`Shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

main();
