import axios from 'axios';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';
import { parseStringPromise } from 'xml2js';
import { setTimeout as sleep } from 'node:timers/promises';
import { uploadToS3 } from '../utils/uploadS3';
import { DynamicScaler } from '../utils/dynamicScaler';

/**
 * Helper to parse date safely
 */
function parseDate(dateStr: any): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
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
 * Helper to bulk insert and queue sitemaps
 */
async function bulkProcessSitemaps(
  entries: { loc: string; lastMod: Date | null }[],
  parentId: number,
  rootId: number,
  depth: number
): Promise<void> {
  if (entries.length === 0) return;

  const inserted = await db.insert(sitemaps)
    .values(entries.map(e => ({
      parentId,
      rootId,
      sitemapUrl: e.loc,
      status: 'processing' as const,
      lastMod: e.lastMod
    })))
    .onConflictDoUpdate({
      target: sitemaps.sitemapUrl,
      set: { updatedAt: new Date() }
    })
    .returning({ id: sitemaps.id, sitemapUrl: sitemaps.sitemapUrl });

  const jobs = inserted.map(s => ({
    data: {
      sitemapUrl: s.sitemapUrl,
      sitemapId: s.id,
      rootId,
      depth: depth + 1
    },
    options: { priority: 10 }
  }));

  await boss.insert('sitemap_queue', jobs);
  logger.info(`Bulk discovered ${inserted.length} sitemaps`);
}

/**
 * Helper to bulk insert and queue URLs
 */
async function bulkProcessUrls(
  entries: { loc: string; lastMod: Date | null }[],
  sitemapId: number,
  rootId: number
): Promise<void> {
  if (entries.length === 0) return;

  const inserted = await db.insert(urls)
    .values(entries.map(e => ({
      sitemapId,
      rootId,
      url: e.loc,
      status: 'queued' as const,
      lastMod: e.lastMod
    })))
    .onConflictDoUpdate({
      target: urls.url,
      set: { updatedAt: new Date() }
    })
    .returning({ id: urls.id, url: urls.url });

  const jobs = inserted.map(u => ({
    data: { url: u.url, sitemapId, rootId },
    options: { priority: 1 }
  }));

  await boss.insert('page_queue', jobs);
  logger.info(`Bulk queued ${inserted.length} URLs for scraping`);
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
        .set({ status: 'active', totalUrlsFound: totalItems, updatedAt: new Date() })
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
 * Logic for processing pages
 */
async function processPage(data: any, jobId: string): Promise<void> {
  const { url, sitemapId } = data;

  try {
    try {
      logger.info(`[Page Worker ${jobId}] Scraping: ${url}`);
      const [updated] = await db.update(urls)
        .set({ status: 'scraping', updatedAt: new Date() })
        .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)))
        .returning();
      
      if (!updated) {
        logger.warn(`[Page Worker ${jobId}] URL ${url} not found in DB, it might have been deleted. Skipping.`);
        return;
      }
    } catch (dbErr) {
      if (isNotFoundError(dbErr)) return;
      throw dbErr;
    }

    await sleep(Math.floor(Math.random() * 2000) + 1000);
    
    const res = await axios.get(url, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
      validateStatus: (status) => status < 500,
    });

    if (res.status === 429) throw new Error('Rate limited (429)');
    if (res.status === 403 || res.status === 401) {
      try {
        await db.update(urls).set({ status: 'failed', failureReason: `Auth error: ${res.status}` }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
      return;
    }

    const contentType = res.headers['content-type'];
    if (contentType?.includes('text/html')) {
      // 1. Upload raw HTML
      const s3Url = await uploadToS3(url, res.data, 'html');
      
      // 2. Extract and Upload cleaned Markdown
      const cleanContent = extract(res.data);
      const mdS3Url = await uploadToS3(url, cleanContent, 'md');

      try {
        await db.update(urls)
          .set({
            s3Url: s3Url,
            mdS3Url: mdS3Url,
            status: 'done',
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
        
        logger.info(`[Page Worker ${jobId}] Successfully scraped & archived (HTML + MD): ${url}`);
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
    } else {
      try {
        await db.update(urls).set({ status: 'failed', failureReason: `Invalid content type: ${contentType}` }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
    }
  } catch (e) {
    if (isNotFoundError(e)) return;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error(`[Page Worker ${jobId}] Failed to scrape ${url}: ${msg}`);
    try {
      await db.update(urls).set({ status: 'failed', failureReason: msg }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
    } catch (dbErr) {
      // Ignore
    }
    throw e;
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
    batchSize: 1
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
    batchSize: 1
  }, async (jobs: any[]) => {
    const job = jobs[0];
    await processPage(job.data, job.id);
  });

  await scaler.start();
  logger.info(`Page worker initialized with dynamic scaling`);
}
