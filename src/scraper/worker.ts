import axios from 'axios';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';
import { parseStringPromise } from 'xml2js';
import { setTimeout as sleep } from 'node:timers/promises';
import { uploadToS3 } from '../utils/uploadS3';
import { DynamicScaler } from '../utils/dynamicScaler';
import { getISTDate } from '../utils/time';

/**
 * Helper to parse date safely and convert to IST
 */
function parseDate(dateStr: any): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(d.getTime() + istOffset);
}

/**
 * Helper to handle DB errors during worker processing (e.g. if parent was deleted)
 */
function isNotFoundError(e: any): boolean {
  // Check for Postgres Foreign Key Violation (23503) or generic "not found"
  const code = e?.code || e?.cause?.code;
  return code === '23503';
}

/**
 * Bulk insert and queue sitemaps in chunks
 */
async function bulkProcessSitemaps(
  entries: { loc: string; lastMod: Date | null }[],
  parentId: number,
  rootId: number,
  depth: number
): Promise<void> {
  if (entries.length === 0) return;

  // Deduplicate by URL to avoid conflicts
  const uniqueEntries = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.loc, entry);
      return map;
    }, new Map<string, { loc: string; lastMod: Date | null }>()).values()
  );

  // Process in batches to manage memory and DB load
  for (let i = 0; i < uniqueEntries.length; i += config.batchSize) {
    const chunk = uniqueEntries.slice(i, i + config.batchSize);
    
    const inserted = await db.insert(sitemaps)
      .values(chunk.map(e => ({
        parentId,
        rootId,
        sitemapUrl: e.loc,
        status: 'processing' as const,
        lastMod: e.lastMod
      })))
      .onConflictDoNothing()
      .returning({ id: sitemaps.id, sitemapUrl: sitemaps.sitemapUrl });

    if (inserted.length === 0) continue;

    const jobs = inserted.map(s => ({
      data: {
        sitemapUrl: s.sitemapUrl,
        sitemapId: s.id,
        rootId,
        depth: depth + 1
      },
      options: { 
        priority: 10,
        retryLimit: config.retryLimit,
        retryDelay: config.retryDelay,
        retryBackoff: true
      }
    }));

    await boss.insert('sitemap_queue', jobs);
    logger.debug(`Queued chunk of ${inserted.length} new sitemaps`);
  }
}

/**
 * Bulk insert and queue URLs in chunks
 */
async function bulkProcessUrls(

  entries: { loc: string; lastMod: Date | null }[],
  sitemapId: number,
  rootId: number
): Promise<void> {
  if (entries.length === 0) return;

  // Deduplicate by URL
  const uniqueEntries = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.loc, entry);
      return map;
    }, new Map<string, { loc: string; lastMod: Date | null }>()).values()
  );

  // Process in batches
  for (let i = 0; i < uniqueEntries.length; i += config.batchSize) {
    const chunk = uniqueEntries.slice(i, i + config.batchSize);

    const inserted = await db.insert(urls)
      .values(chunk.map(e => ({
        sitemapId,
        rootId,
        url: e.loc,
        status: 'queued' as const,
        lastMod: e.lastMod
      })))
      .onConflictDoNothing()
      .returning({ id: urls.id, url: urls.url });

    if (inserted.length === 0) continue;

    const jobs = inserted.map(u => ({
      data: { url: u.url, sitemapId, rootId },
      options: { 
        priority: 1,
        retryLimit: config.retryLimit,
        retryDelay: config.retryDelay,
        retryBackoff: true
      }
    }));

    await boss.insert('page_queue', jobs);
    logger.debug(`Queued chunk of ${inserted.length} new URLs`);
  }
}

/**
 * Logic for processing sitemaps
 */
async function processSitemap(data: any): Promise<void> {
  const { sitemapUrl, sitemapId, rootId, depth } = data;

  if (depth > 5) {
    logger.warn(`Max depth reached for: ${sitemapUrl}`);
    return;
  }

  try {
    logger.info(`[Sitemap Worker] Fetching: ${sitemapUrl}`);
    const res = await axios.get(sitemapUrl, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
    });

    if (!res.data || typeof res.data !== 'string') {
      try {
        await db.update(sitemaps).set({ status: 'failed', failureReason: 'Empty sitemap response' }).where(eq(sitemaps.id, sitemapId));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return; // Silently exit if sitemap was deleted
        throw dbErr;
      }
      return;
    }

    const result = await parseStringPromise(res.data, {
      explicitArray: false,
      trim: true,
      ignoreAttrs: false
    });

    if (!result) {
      try {
        await db.update(sitemaps).set({ status: 'failed', failureReason: 'Failed to parse XML' }).where(eq(sitemaps.id, sitemapId));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
      return;
    }

    let totalItems = 0;

    // handle sitemapindex
    if (result.sitemapindex?.sitemap) {
      const entries = (Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap])
        .filter((e: any) => e.loc);
      totalItems = entries.length;

      if (totalItems > 0) {
        try {
          const sitemapData = entries.map((entry: any) => ({
            loc: entry.loc,
            lastMod: parseDate(entry.lastmod)
          }));
          await bulkProcessSitemaps(sitemapData, sitemapId, rootId, depth);
        } catch (dbErr) {
          if (isNotFoundError(dbErr)) {
            logger.warn(`Parent sitemap ${sitemapId} was deleted, stopping crawl for this branch.`);
            return;
          }
          throw dbErr;
        }
      }
    } else if (result.urlset?.url) {
      const entries = (Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url])
        .filter((e: any) => e.loc && typeof e.loc === 'string');
      totalItems = entries.length;

      if (totalItems > 0) {
        const sitemapEntries: { loc: string; lastMod: Date | null }[] = [];
        const urlEntries: { loc: string; lastMod: Date | null }[] = [];

        for (const entry of entries) {
          const baseUrl = entry.loc.split('?')[0] ?? '';
          const isSitemap = baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz');
          const entryData = {
            loc: entry.loc,
            lastMod: parseDate(entry.lastmod)
          };
          
          if (isSitemap) {
            sitemapEntries.push(entryData);
          } else {
            urlEntries.push(entryData);
          }
        }

        try {
          if (sitemapEntries.length > 0) {
            await bulkProcessSitemaps(sitemapEntries, sitemapId, rootId, depth);
          }
          if (urlEntries.length > 0) {
            await bulkProcessUrls(urlEntries, sitemapId, rootId);
          }
        } catch (dbErr) {
          if (isNotFoundError(dbErr)) {
            logger.warn(`Parent sitemap ${sitemapId} was deleted, stopping branch processing.`);
            return;
          }
          throw dbErr;
        }
      }
    }

    try {
      await db.update(sitemaps)
        .set({ status: 'active', totalUrlsFound: totalItems, updatedAt: getISTDate() })
        .where(eq(sitemaps.id, sitemapId));
    } catch (dbErr) {
      if (isNotFoundError(dbErr)) return;
      throw dbErr;
    }

  } catch (e) {
    if (isNotFoundError(e)) return;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error(`Error processing sitemap ${sitemapUrl}: ${msg}`);
    try {
      await db.update(sitemaps).set({ status: 'failed', failureReason: msg }).where(eq(sitemaps.id, sitemapId));
    } catch (dbErr) {
      // Ignore if already deleted
    }
    throw e;
  }
}

/**
 * Logic for processing a single URL (Helper for batch)
 */
async function scrapeUrl(url: string, sitemapId: number, rootId: number) {
  try {
    const res = await axios.get(url, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
      validateStatus: (status) => status < 500,
    });

    if (res.status === 429) throw new Error('Rate limited (429)');
    if (res.status === 403 || res.status === 401) {
      return { url, sitemapId, rootId, status: 'failed' as const, failureReason: `Auth error: ${res.status}` };
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
        status: 'done' as const,
        lastScrapedAt: getISTDate(),
        updatedAt: getISTDate()
      };
    } else {
      return { url, sitemapId, rootId, status: 'failed' as const, failureReason: `Invalid content type: ${contentType}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { url, sitemapId, rootId, status: 'failed' as const, failureReason: msg };
  }
}

interface PageJob {
  id: string;
  data: {
    url: string;
    sitemapId: number;
    rootId: number;
  };
}

interface PageScrapeResult {
  url: string;
  sitemapId: number;
  rootId: number;
  status: 'done' | 'failed';
  failureReason?: string;
  s3Url?: string;
  mdS3Url?: string;
  lastScrapedAt?: Date;
  updatedAt: Date;
}

/**
 * Logic for processing a batch of pages
 */
async function processPageBatch(jobs: PageJob[]): Promise<void> {
  const batchId = jobs[0]?.id?.substring(0, 8) || 'unknown';
  const urlKeys = jobs.map(j => j.data.url);

  try {
    logger.info(`[Page Worker] Processing batch ${batchId} (${jobs.length} jobs)`);

    // 1. Mark all as scraping in DB
    try {
      await db.update(urls)
        .set({ status: 'scraping', updatedAt: getISTDate() })
        .where(sql`${urls.url} IN (${sql.join(urlKeys.map(u => sql`${u}`), sql`, `)})`);
    } catch (dbErr) {
      if (!isNotFoundError(dbErr)) throw dbErr;
    }

    // 2. Process all in parallel (Settled ensures one failure doesn't stop the loop)
    const settlements = await Promise.allSettled(jobs.map(job => 
      scrapeUrl(job.data.url, job.data.sitemapId, job.data.rootId)
    ));

    const dbResults: PageScrapeResult[] = [];
    const successJobIds: string[] = [];
    const failureJobIds: { id: string; error: Error }[] = [];

    // 3. Classify results
    settlements.forEach((res, i) => {
      const job = jobs[i];
      if (!job) return;

      if (res.status === 'fulfilled') {
        const value = res.value as PageScrapeResult;
        dbResults.push(value);
        if (value.status === 'done') {
          successJobIds.push(job.id);
        } else {
          failureJobIds.push({ id: job.id, error: new Error(value.failureReason || 'Unknown error') });
        }
      } else {
        // This handles actual code crashes/rejections in scrapeUrl
        const error = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
        dbResults.push({
          url: job.data.url,
          sitemapId: job.data.sitemapId,
          rootId: job.data.rootId,
          status: 'failed' as const,
          failureReason: error.message,
          updatedAt: getISTDate()
        });
        failureJobIds.push({ id: job.id, error });
      }
    });

    // 4. Bulk sync all results to DB (Successes and Failures)
    if (dbResults.length > 0) {
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
    }

    // 5. Granularly complete or fail jobs in the queue
    const queuePromises = [
      ...successJobIds.map(id => boss.complete('page_queue', id)),
      ...failureJobIds.map(f => boss.fail('page_queue', f.id, { message: f.error.message }))
    ];

    await Promise.all(queuePromises);
    logger.info(`[Page Worker] Batch ${batchId} finished: ${successJobIds.length} OK, ${failureJobIds.length} Failed`);

  } catch (err) {
    logger.error(`[Page Worker] Fatal error in batch ${batchId}: ${err}`);
    // Throwing here triggers a pg-boss retry for the entire batch
    throw err;
  }
}

/**
 * Start the Sitemap Worker
 */
export async function startSitemapWorker(): Promise<void> {
  const scaler = new DynamicScaler({
    queueName: 'sitemap_queue',
    serviceName: 'sitemap-worker',
    ...config.sitemapConcurrency,
  }, async (jobs: any[]) => {
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
