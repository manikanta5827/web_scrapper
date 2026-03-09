import axios from 'axios';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { extract } from './extractor';
import { logger } from '../utils/logger';
import { parseStringPromise } from 'xml2js';

export async function startWorker(): Promise<void> {
  // 1. Process Sitemaps
  await boss.work('sitemap_queue', {
    localConcurrency: 2, // Sitemaps are relatively fast to parse
    batchSize: 1
  }, async (jobs: any[]) => {
    const job = jobs[0];
    const { sitemapUrl, sitemapId, depth } = job.data;

    // Depth limit to prevent infinite loops
    if (depth > 5) {
      logger.warn(`Max depth reached for: ${sitemapUrl}`);
      return;
    }

    try {
      logger.info(`[Worker] Fetching sitemap: ${sitemapUrl}`);
      const res = await axios.get(sitemapUrl, {
        timeout: config.timeout,
        headers: { 'User-Agent': config.userAgent },
      });

      if (!res.data || typeof res.data !== 'string') {
        await db.update(sitemaps).set({ status: 'failed' }).where(eq(sitemaps.id, sitemapId));
        return;
      }

      const result = await parseStringPromise(res.data, {
        explicitArray: false,
        trim: true,
        ignoreAttrs: false
      });

      if (!result) {
        await db.update(sitemaps).set({ status: 'failed' }).where(eq(sitemaps.id, sitemapId));
        return;
      }

      let totalItems = 0;

      // CASE A: Sitemap Index
      if (result.sitemapindex?.sitemap) {
        const entries = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
        totalItems = entries.length;

        for (const entry of entries) {
          if (!entry.loc) continue;

          // Insert or get existing sitemap record
          const [newSitemap] = await db.insert(sitemaps)
            .values({
              parentId: sitemapId,
              sitemapUrl: entry.loc,
              status: 'processing',
            })
            .onConflictDoUpdate({
              target: sitemaps.sitemapUrl,
              set: { updatedAt: new Date() }
            })
            .returning();

          if (newSitemap) {
            await boss.send('sitemap_queue', { sitemapUrl: entry.loc, sitemapId: newSitemap.id, depth: depth + 1 }, {
              retryLimit: config.retryLimit,
              retryDelay: config.retryDelay
            });
          }
        }
      } 
      // CASE B: Urlset
      else if (result.urlset?.url) {
        const entries = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
        totalItems = entries.length;

        for (const entry of entries) {
          if (!entry.loc || typeof entry.loc !== 'string') continue;

          const baseUrl = entry.loc.split('?')[0] ?? '';
          const isSitemap = baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz');

          if (isSitemap) {
            const [newSitemap] = await db.insert(sitemaps)
              .values({
                parentId: sitemapId,
                sitemapUrl: entry.loc,
                status: 'processing',
              })
              .onConflictDoUpdate({
                target: sitemaps.sitemapUrl,
                set: { updatedAt: new Date() }
              })
              .returning();

            if (newSitemap) {
              await boss.send('sitemap_queue', { sitemapUrl: entry.loc, sitemapId: newSitemap.id, depth: depth + 1 }, {
                retryLimit: config.retryLimit,
                retryDelay: config.retryDelay
              });
            }
          } else {
            // Add page URL
            const [newUrl] = await db.insert(urls)
              .values({
                sitemapId: sitemapId,
                url: entry.loc,
                status: 'queued',
              })
              .onConflictDoNothing()
              .returning();

            if (newUrl) {
              await boss.send('page_queue', { url: entry.loc, sitemapId: sitemapId }, {
                retryLimit: config.retryLimit,
                retryDelay: config.retryDelay
              });
            }
          }
        }
      }

      // Mark sitemap as active and update counts
      await db.update(sitemaps)
        .set({ 
          status: 'active', 
          totalUrlsFound: totalItems, 
          lastCheckedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(sitemaps.id, sitemapId));

    } catch (e) {
      logger.error(`Error processing sitemap ${sitemapUrl}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e;
    }
  });

  // 2. Process Page URLs
  await boss.work('page_queue', {
    localConcurrency: config.concurrency,
    batchSize: 1
  }, async (jobs: any[]) => {
    const job = jobs[0];
    const { url, sitemapId } = job.data;
    const jobId = job.id;

    try {
      logger.info(`[Job ${jobId}] Starting scrape for: ${url}`);

      await db.update(urls)
        .set({ status: 'scraping', updatedAt: new Date() })
        .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));

      const res = await axios.get(url, {
        timeout: config.timeout,
        headers: { 'User-Agent': config.userAgent },
        validateStatus: (status) => status < 500,
      });

      if (res.status === 429) throw new Error('Rate limited (429)');

      if (res.status === 403 || res.status === 401) {
        logger.warn(`[Job ${jobId}] Access denied (${res.status}).`);
        await db.update(urls).set({ status: 'failed' }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
        return;
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
        logger.info(`[Job ${jobId}] Successfully scraped: ${url}`);
      } else {
        logger.warn(`[Job ${jobId}] Skipping non-HTML content (${contentType})`);
        await db.update(urls).set({ status: 'failed' }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      }
    } catch (e) {
      logger.error(`[Job ${jobId}] Failed to scrape ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e;
    }
  });

  logger.info(`Worker initialized with localConcurrency: ${config.concurrency}`);
}
