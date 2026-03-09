import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startServer } from './src/api/server';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  logger.info('--- API SERVER STARTING ---');

  try {
    // 1. Verify DB Connection
    await checkConnection();

    // 2. Start pg-boss (for enqueuing jobs)
    await initQueue();

    // 3. Start API Server (Listening for /scrape)
    startServer();

    logger.info('API Server fully operational and accepting requests');

  } catch (error) {
    logger.error(`Server startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down server gracefully...');
  try {
    await stopQueue();
    await closeDb();
    logger.info('Server shutdown complete');
  } catch (error) {
    logger.error(`Server shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

if (import.meta.main) {
  main();
}
