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
      await db.update(sitemaps).set({ status: 'failed', failureReason: 'Empty sitemap response' }).where(eq(sitemaps.id, sitemapId));
      return;
    }

    const result = await parseStringPromise(res.data, {
      explicitArray: false,
      trim: true,
      ignoreAttrs: false
    });

    if (!result) {
      await db.update(sitemaps).set({ status: 'failed', failureReason: 'Failed to parse XML' }).where(eq(sitemaps.id, sitemapId));
      return;
    }

    let totalItems = 0;

    // handle sitemapindex
    if (result.sitemapindex?.sitemap) {
      const entries = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
      totalItems = entries.length;

      for (const entry of entries) {
        if (!entry.loc) continue;
        const lastMod = parseDate(entry.lastmod);

        const [newSitemap] = await db.insert(sitemaps)
          .values({ 
            parentId: sitemapId, 
            rootId: rootId,
            sitemapUrl: entry.loc, 
            status: 'processing',
            lastMod: lastMod
          })
          .onConflictDoUpdate({ 
            target: sitemaps.sitemapUrl, 
            set: { updatedAt: new Date() }
          })
          .returning();

        const sId = newSitemap?.id || (await db.select({ id: sitemaps.id }).from(sitemaps).where(eq(sitemaps.sitemapUrl, entry.loc)))[0]?.id;

        if (sId) {
          if (newSitemap) logger.info(`Discovered new sitemap: ${entry.loc}`);
          await boss.send('sitemap_queue', { 
            sitemapUrl: entry.loc, 
            sitemapId: sId, 
            rootId: rootId,
            depth: depth + 1 
          }, { priority: 10 });
        }
      }
    } else if (result.urlset?.url) {
      const entries = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      totalItems = entries.length;

      for (const entry of entries) {
        if (!entry.loc || typeof entry.loc !== 'string') continue;
        const baseUrl = entry.loc.split('?')[0] ?? '';
        const isSitemap = baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz');
        const lastMod = parseDate(entry.lastmod);

        if (isSitemap) {
          const [newSitemap] = await db.insert(sitemaps)
            .values({ 
              parentId: sitemapId, 
              rootId: rootId,
              sitemapUrl: entry.loc, 
              status: 'processing',
              lastMod: lastMod
            })
            .onConflictDoUpdate({ 
              target: sitemaps.sitemapUrl, 
              set: { updatedAt: new Date() }
            })
            .returning();
          
          const sId = newSitemap?.id || (await db.select({ id: sitemaps.id }).from(sitemaps).where(eq(sitemaps.sitemapUrl, entry.loc)))[0]?.id;

          if (sId) {
            if (newSitemap) logger.info(`Discovered nested sitemap: ${entry.loc}`);
            await boss.send('sitemap_queue', { 
              sitemapUrl: entry.loc, 
              sitemapId: sId, 
              rootId: rootId,
              depth: depth + 1 
            }, { priority: 10 });
          }
        } else {
          const [newUrl] = await db.insert(urls)
            .values({ 
              sitemapId: sitemapId, 
              rootId: rootId,
              url: entry.loc, 
              status: 'queued',
              lastMod: lastMod
            })
            .onConflictDoUpdate({
              target: urls.url,
              set: { updatedAt: new Date() },
            })
            .returning();
          
          const uId = newUrl?.id || (await db.select({ id: urls.id }).from(urls).where(eq(urls.url, entry.loc)))[0]?.id;

          if (uId) {
            if (newUrl) logger.info(`Queued URL for scraping: ${entry.loc}`);
            await boss.send('page_queue', { url: entry.loc, sitemapId: sitemapId, rootId: rootId }, { priority: 1 });
          }
        }
      }
    }

    await db.update(sitemaps)
      .set({ status: 'active', totalUrlsFound: totalItems, updatedAt: new Date() })
      .where(eq(sitemaps.id, sitemapId));

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error(`Error processing sitemap ${sitemapUrl}: ${msg}`);
    await db.update(sitemaps).set({ status: 'failed', failureReason: msg }).where(eq(sitemaps.id, sitemapId));
    throw e;
  }
}

/**
 * Logic for processing pages
 */
async function processPage(data: any, jobId: string): Promise<void> {
  const { url, sitemapId } = data;

  try {
    logger.info(`[Page Worker ${jobId}] Scraping: ${url}`);
    await db.update(urls)
      .set({ status: 'scraping', updatedAt: new Date() })
      .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));

    await sleep(Math.floor(Math.random() * 2000) + 1000);
    
    const res = await axios.get(url, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
      validateStatus: (status) => status < 500,
    });

    if (res.status === 429) throw new Error('Rate limited (429)');
    if (res.status === 403 || res.status === 401) {
      await db.update(urls).set({ status: 'failed', failureReason: `Auth error: ${res.status}` }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      return;
    }

    const contentType = res.headers['content-type'];
    if (contentType?.includes('text/html')) {
      // 1. Upload raw HTML
      const s3Url = await uploadToS3(url, res.data, 'html');
      
      // 2. Extract and Upload cleaned Markdown
      const cleanContent = extract(res.data);
      const mdS3Url = await uploadToS3(url, cleanContent, 'md');

      await db.update(urls)
        .set({
          s3Url: s3Url,
          mdS3Url: mdS3Url,
          rawContent: cleanContent,
          status: 'done',
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      
      logger.info(`[Page Worker ${jobId}] Successfully scraped & archived (HTML + MD): ${url}`);
    } else {
      await db.update(urls).set({ status: 'failed', failureReason: `Invalid content type: ${contentType}` }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error(`[Page Worker ${jobId}] Failed to scrape ${url}: ${msg}`);
    await db.update(urls).set({ status: 'failed', failureReason: msg }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
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
