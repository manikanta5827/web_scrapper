import axios from 'axios';
import { db } from '../db/client';
import { urls } from '../db/schema';
import { sql, and, eq } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';
import { uploadToS3 } from '../utils/uploadS3';
import { isNotFoundError } from './utils';
import type { PageJob, PageScrapeResult } from './types';
import pLimit from 'p-limit';

/**
 * Logic for processing a single URL
 */
async function scrapeUrl(url: string, sitemapId: number, rootId: number): Promise<PageScrapeResult> {
  try {
    const res = await axios.get(url, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
      validateStatus: (status) => status < 500,
    });

    if (res.status === 429) throw new Error('Rate limited (429)');
    if (res.status === 403 || res.status === 401) {
      return { url, sitemapId, rootId, status: 'failed', failureReason: `Auth error: ${res.status}`, updatedAt: new Date() };
    }

    const contentType = res.headers['content-type'];
    if (contentType?.includes('text/html')) {
      const cleanContent = extract(res.data);
      
      let s3Url: string | undefined;
      let mdS3Url: string | undefined;

      if (config.enableS3Upload) {
        [s3Url, mdS3Url] = await Promise.all([
          uploadToS3(url, res.data, 'html'),
          uploadToS3(url, cleanContent, 'md')
        ]);
      } else {
        logger.debug(`[Scraper] S3 Upload skipped for ${url} (enableS3Upload=false)`);
      }

      return {
        url,
        sitemapId,
        rootId,
        s3Url,
        mdS3Url,
        status: 'done',
        lastScrapedAt: new Date(),
        updatedAt: new Date()
      };
    } else {
      return { url, sitemapId, rootId, status: 'failed', failureReason: `Invalid content type: ${contentType}`, updatedAt: new Date() };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { url, sitemapId, rootId, status: 'failed', failureReason: msg, updatedAt: new Date() };
  }
}

/**
 * Logic for processing a batch of pages
 */
export async function processPageBatch(jobs: PageJob[]): Promise<void> {
  if (jobs.length === 0) return;
  
  const batchId = jobs[0]?.id?.substring(0, 8) || 'unknown';
  const urlKeys = jobs.map(j => j.data.url);
  const limit = pLimit(config.pageConcurrency.internalLimit);

  // SELF-TERMINATION TIMER: Using dynamic config
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Batch Timeout (${config.pageConcurrency.batchTimeoutMs}ms limit exceeded)`)), config.pageConcurrency.batchTimeoutMs)
  );

  try {
    logger.info(`[Page Worker] Processing batch ${batchId} (${jobs.length} jobs)`);

    // 1. Initial status update
    await db.update(urls)
      .set({ status: 'scraping', updatedAt: new Date() })
      .where(sql`${urls.url} IN (${sql.join(urlKeys.map(u => sql`${u}`), sql`, `)})`);

    // 2. Parallel Processing (Race against the timeout)
    const scrapePromise = Promise.allSettled(jobs.map(job => 
      limit(() => scrapeUrl(job.data.url, job.data.sitemapId, job.data.rootId))
    ));

    const settlements = await Promise.race([scrapePromise, timeoutPromise]) as any[];

    const dbResults: PageScrapeResult[] = [];
    const successJobIds: string[] = [];
    const failureDetails: { id: string; error: string }[] = [];

    settlements.forEach((res, i) => {
      const job = jobs[i];
      if (!job) return;

      if (res.status === 'fulfilled') {
        const value = res.value as PageScrapeResult;
        dbResults.push(value);
        if (value.status === 'done') {
          successJobIds.push(job.id);
        } else {
          failureDetails.push({ id: job.id, error: value.failureReason || 'Unknown failure' });
        }
      } else {
        const error = res.reason instanceof Error ? res.reason.message : String(res.reason);
        dbResults.push({
          url: job.data.url,
          sitemapId: job.data.sitemapId,
          rootId: job.data.rootId,
          status: 'failed',
          failureReason: error,
          updatedAt: new Date()
        });
        failureDetails.push({ id: job.id, error });
      }
    });

    // 3. Final Bulk Update (Optimistic Locking)
    if (dbResults.length > 0) {
      const updatePromises = dbResults.map(res => 
        db.update(urls)
          .set({
            status: res.status,
            failureReason: res.failureReason,
            s3Url: res.s3Url,
            mdS3Url: res.mdS3Url,
            lastScrapedAt: res.lastScrapedAt,
            updatedAt: new Date()
          })
          .where(and(eq(urls.url, res.url), eq(urls.status, 'scraping')))
      );
      await Promise.all(updatePromises);
    }

    // 4. Batch Acknowledge
    await Promise.all([
      ...successJobIds.map(id => boss.complete('page_queue', id)),
      ...failureDetails.map(f => boss.fail('page_queue', f.id, { message: f.error }))
    ]);

    logger.info(`[Page Worker] Batch ${batchId} done: ${successJobIds.length} OK`);

  } catch (err) {
    logger.error(`[Page Worker] Batch ${batchId} failed/timed out: ${err}`);
    // If it's a timeout or fatal error, try to fail all jobs in pg-boss so they can be retried
    await Promise.all(jobs.map(j => boss.fail('page_queue', j.id, { message: String(err) })));
    throw err;
  }
}
