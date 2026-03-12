import { startServer } from './src/api/server';
import { startSitemapWorker, startPageWorker } from './src/scraper/worker';
import { initQueue, stopQueue } from './src/queue/boss';
import { checkConnection, closeDb, db } from './src/db/client';
import { urls } from './src/db/schema';
import { lt, and, eq } from 'drizzle-orm';
import { config } from './src/utils/config';
import { logger } from './src/utils/logger';

/**
 * Ghost Buster: Periodically resets URLs stuck in 'scraping' status
 * back to 'queued' in the database. pg-boss handles actual re-queueing
 * via its 'expireInSeconds' mechanism.
 */
function startGhostBuster(): void {
  setInterval(async () => {
    try {
      const stallThreshold = new Date(Date.now() - config.ghostBuster.stallThresholdMs);
      
      const result = await db.update(urls)
        .set({ status: 'queued', updatedAt: new Date() })
        .where(
          and(
            eq(urls.status, 'scraping'),
            lt(urls.updatedAt, stallThreshold)
          )
        );
      
      const count = (result as any).rowCount || 0;
      if (count > 0) {
        logger.warn(`[Ghost Buster] Reset ${count} stalled URLs in database back to 'queued'.`);
      }
    } catch (e) {
      logger.error(`[Ghost Buster] Failed to reset stalled URLs: ${e}`);
    }
  }, config.ghostBuster.checkIntervalMs);
}

async function main(): Promise<void> {
  logger.info('--- STARTING COMBINED SERVICE (API + WORKERS) ---');

  try {
    // 1. Verify DB Connection
    await checkConnection();

    // 3. Initialize Queue (once for the whole process)
    await initQueue();

    // Start Ghost Buster to keep DB status in sync with Queue
    startGhostBuster();

    // 3. Start Workers
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
