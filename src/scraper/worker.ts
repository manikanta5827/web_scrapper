import axios from 'axios';
import { db } from '../db/client';
import { urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../config';
import { extract } from './extractor';
import { logger } from '../utils/logger';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startWorker(): Promise<void> {
  // boss.work() fetches a batch of jobs (size = config.concurrency)
  await boss.work('scrape_queue', { batchSize: config.concurrency }, async (jobs: any[]) => {
    logger.info(`Processing batch of ${jobs.length} jobs concurrently...`);

    // Use allSettled for TRUE parallel processing within the batch
    const results = await Promise.allSettled(jobs.map(async (job: any) => {
      const { url, sitemapId } = job.data;
      try {
        // Update status to scraping
        await db.update(urls)
          .set({ status: 'scraping', updatedAt: new Date() })
          .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));

        // Respect the requested delay before the HTTP call
        await sleep(config.requestDelay);

        const res = await axios.get(url, {
          timeout: config.timeout,
          headers: { 'User-Agent': config.userAgent },
          validateStatus: (status) => status < 500,
        });

        if (res.status === 429) throw new Error('Rate limited');
        
        if (res.status === 403 || res.status === 401) {
          logger.warn(`Access denied (${res.status}) for: ${url}`);
          await db.update(urls)
            .set({ status: 'failed' })
            .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
          return; // Job finished (failed permanently)
        }

        const contentType = res.headers['content-type'];
        if (contentType?.includes('text/html')) {
          await db.update(urls)
            .set({
              rawContent: extract(res.data),
              status: 'done',
              lastScrapedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
          logger.info(`Successfully scraped: ${url}`);
        } else {
          logger.warn(`Skipping non-HTML content (${contentType}) for: ${url}`);
          await db.update(urls)
            .set({ status: 'failed' })
            .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
        }
      } catch (e) {
        logger.error(`Failed to scrape ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        // Rethrow so pg-boss knows THIS SPECIFIC JOB failed and can retry it
        throw e;
      }
    }));

    // Check for any rejections to log them, but pg-boss handles individual job retries
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejected.length > 0) {
      logger.error(`Batch finished with ${rejected.length} job failures. pg-boss will handle retries.`);
    }
  });
  
  logger.info(`Worker active (concurrency: ${config.concurrency})`);
}
