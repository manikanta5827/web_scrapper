import { DynamicScaler } from '../utils/dynamicScaler';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { processSitemap } from './sitemap-processor';
import { processPageBatch } from './page-processor';

/**
 * Start the Sitemap Worker
 */
export async function startSitemapWorker(): Promise<void> {
  const scaler = new DynamicScaler(
    'sitemap_queue',
    async (jobs: any[]) => {
      // Sitemaps are processed one by one (batchSize: 1)
      if (jobs.length > 0) {
        await processSitemap(jobs[0].data);
      }
    },
    config.sitemapConcurrency
  );

  await scaler.init();
  logger.info(`Sitemap worker initialized with dynamic scaling`);
}

/**
 * Start the Page Worker
 */
export async function startPageWorker(): Promise<void> {
  const scaler = new DynamicScaler(
    'page_queue',
    async (jobs: any[]) => {
      await processPageBatch(jobs);
    },
    config.pageConcurrency
  );

  await scaler.init();
  logger.info(`Page worker initialized with dynamic scaling`);
}
