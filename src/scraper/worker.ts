import { DynamicScaler } from '../utils/dynamicScaler';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { processSitemap } from './sitemap-processor';
import { processPageBatch } from './page-processor';

/**
 * Start the Sitemap Worker
 */
export async function startSitemapWorker(): Promise<void> {
  const scaler = new DynamicScaler({
    queueName: 'sitemap_queue',
    serviceName: 'sitemap-worker',
    ...config.sitemapConcurrency,
  }, async (jobs: any[]) => {
    // Sitemaps are processed one by one (batchSize: 1)
    await processSitemap(jobs[0].data);
  });

  await scaler.start();
  logger.info(`Sitemap worker initialized with dynamic scaling`);
}

/**
 * Start the Page Worker
 */
export async function startPageWorker(): Promise<void> {
  const scaler = new DynamicScaler({
    queueName: 'page_queue',
    serviceName: 'page-worker',
    ...config.pageConcurrency,
  }, async (jobs: any[]) => {
    await processPageBatch(jobs);
  });

  await scaler.start();
  logger.info(`Page worker initialized with dynamic scaling`);
}
