import { checkConnection, closeDb } from './src/db/client';
import { initQueue, stopQueue } from './src/queue/boss';
import { startWorker } from './src/scraper/worker';

async function main(): Promise<void> {
  console.log('[INFO] Initializing Web Scraper System...');

  try {
    // 1. Verify DB Connection
    await checkConnection();

    // 2. Job Queue
    await initQueue();

    // 3. Start Workers
    await startWorker();

    console.log('[INFO] System fully operational');

  } catch (error) {
    console.error(`[FATAL] Startup failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  console.log('[INFO] Shutting down gracefully...');
  try {
    await stopQueue();
    await closeDb();
    console.log('[INFO] Graceful shutdown complete');
  } catch (error) {
    console.error(`[ERROR] Shutdown error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

if (import.meta.main) {
  main();
}
