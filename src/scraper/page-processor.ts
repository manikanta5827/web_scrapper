import axios from 'axios';
import { db } from '../db/client';
import { urls } from '../db/schema';
import { sql } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';
import { uploadToS3 } from '../utils/uploadS3';
import { getISTDate } from '../utils/time';
import { isNotFoundError } from './utils';
import type { PageJob, PageScrapeResult } from './types';

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
      return { url, sitemapId, rootId, status: 'failed', failureReason: `Auth error: ${res.status}`, updatedAt: getISTDate() };
    }

    const contentType = res.headers['content-type'];
    if (contentType?.includes('text/html')) {
      const cleanContent = extract(res.data);
      const [s3Url, mdS3Url] = await Promise.all([
        uploadToS3(url, res.data, 'html'),
        uploadToS3(url, cleanContent, 'md')
      ]);

      return {
        url,
        sitemapId,
        rootId,
        s3Url,
        mdS3Url,
        status: 'done',
        lastScrapedAt: getISTDate(),
        updatedAt: getISTDate()
      };
    } else {
      return { url, sitemapId, rootId, status: 'failed', failureReason: `Invalid content type: ${contentType}`, updatedAt: getISTDate() };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { url, sitemapId, rootId, status: 'failed', failureReason: msg, updatedAt: getISTDate() };
  }
}

/**
 * Logic for processing a batch of pages
 */
export async function processPageBatch(jobs: PageJob[]): Promise<void> {
  const batchId = jobs[0]?.id?.substring(0, 8) || 'unknown';
  const urlKeys = jobs.map(j => j.data.url);

  try {
    logger.info(`[Page Worker] Processing batch ${batchId} (${jobs.length} jobs)`);

    try {
      await db.update(urls)
        .set({ status: 'scraping', updatedAt: getISTDate() })
        .where(sql`${urls.url} IN (${sql.join(urlKeys.map(u => sql`${u}`), sql`, `)})`);
    } catch (dbErr) {
      if (isNotFoundError(dbErr)) {
        logger.warn(`[Page Worker] Batch ${batchId} parent records missing, skipping status update.`);
      } else {
        throw dbErr;
      }
    }

    const settlements = await Promise.allSettled(jobs.map(job => 
      scrapeUrl(job.data.url, job.data.sitemapId, job.data.rootId)
    ));

    const dbResults: PageScrapeResult[] = [];
    const successJobIds: string[] = [];
    const failureJobIds: { id: string; error: Error }[] = [];

    settlements.forEach((res, i) => {
      const job = jobs[i];
      if (!job) return;

      if (res.status === 'fulfilled') {
        const value = res.value as PageScrapeResult;
        dbResults.push(value);
        if (value.status === 'done') successJobIds.push(job.id);
        else failureJobIds.push({ id: job.id, error: new Error(value.failureReason || 'Unknown error') });
      } else {
        const error = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
        dbResults.push({
          url: job.data.url,
          sitemapId: job.data.sitemapId,
          rootId: job.data.rootId,
          status: 'failed',
          failureReason: error.message,
          updatedAt: getISTDate()
        });
        failureJobIds.push({ id: job.id, error });
      }
    });

    if (dbResults.length > 0) {
      try {
        await db.insert(urls)
          .values(dbResults)
          .onConflictDoUpdate({
            target: urls.url,
            set: {
              status: sql`excluded.status`,
              failureReason: sql`excluded.failure_reason`,
              s3Url: sql`excluded.s3_url`,
              mdS3Url: sql`excluded.md_s3_url`,
              lastScrapedAt: sql`excluded.last_scraped_at`,
              updatedAt: sql`excluded.updated_at`
            }
          });
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) {
          logger.warn(`[Page Worker] Batch ${batchId} parent sitemap was deleted, cannot sync results.`);
        } else {
          throw dbErr;
        }
      }
    }

    const queuePromises = [
      ...successJobIds.map(id => boss.complete('page_queue', id)),
      ...failureJobIds.map(f => boss.fail('page_queue', f.id, { message: f.error.message }))
    ];

    await Promise.all(queuePromises);
    logger.info(`[Page Worker] Batch ${batchId} finished: ${successJobIds.length} OK, ${failureJobIds.length} Failed`);

  } catch (err) {
    if (isNotFoundError(err)) return;
    logger.error(`[Page Worker] Fatal error in batch ${batchId}: ${err}`);
    throw err;
  }
}
