import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startWorker } from './src/scraper/worker';
import { startServer } from './src/api/server';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('Initializing Web Scraper System...');

  try {
    // 1. Verify DB Connection
    await checkConnection();

    // 2. Job Queue
    await initQueue();

    // 3. Start Workers
    await startWorker();

    // 4. Start API Server
    startServer();

    logger.info('System fully operational');

  } catch (error) {
    logger.error(`Startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');
  try {
    await stopQueue();
    await closeDb();
    logger.info('Graceful shutdown complete');
  } catch (error) {
    logger.error(`Shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

if (import.meta.main) {
  main();
}
