import axios from 'axios';
import { db } from '../db/client';
import { urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startWorker(): Promise<void> {
  /**
   * We use localConcurrency: 3 and batchSize: 1.
   * This spawns 3 independent workers in this process.
   * Each worker handles ONE job at a time.
   * If a job fails, only that specific job is retried by pg-boss.
   */
  await boss.work('scrape_queue', { 
    localConcurrency: config.concurrency, 
    batchSize: 1 
  }, async (jobs: any[]) => {
    // With batchSize: 1, jobs is an array with exactly one element
    const job = jobs[0];
    const { url, sitemapId } = job.data;
    const jobId = job.id;

    try {
      logger.info(`[Job ${jobId}] Starting scrape for: ${url}`);

      // 1. Mark as scraping
      await db.update(urls)
        .set({ status: 'scraping', updatedAt: new Date() })
        .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)))

      // 3. Fetch
      const res = await axios.get(url, {
        timeout: config.timeout,
        headers: { 'User-Agent': config.userAgent },
        validateStatus: (status) => status < 500,
      });

      // 4. Handle Status Codes
      if (res.status === 429) {
        throw new Error('Rate limited (429)'); 
      }
      
      if (res.status === 403 || res.status === 401) {
        logger.warn(`[Job ${jobId}] Access denied (${res.status}). Permanent failure.`);
        await db.update(urls)
          .set({ status: 'failed' })
          .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
        return; // Job finished (handled failure)
      }

      // 5. Extract and Save
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
        logger.info(`[Job ${jobId}] Successfully scraped: ${url}`);
      } else {
        logger.warn(`[Job ${jobId}] Skipping non-HTML content (${contentType})`);
        await db.update(urls)
          .set({ status: 'failed' })
          .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      }
    } catch (e) {
      logger.error(`[Job ${jobId}] Failed to scrape ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      
      /**
       * Rethrowing here causes pg-boss to fail only THIS specific job.
       * pg-boss will then handle the retry logic for this job independently.
       */
      throw e; 
    }
  });
  
  logger.info(`Worker initialized with localConcurrency: ${config.concurrency}`);
}
