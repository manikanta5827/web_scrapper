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
/**
 * Worker for processing XML sitemaps and indices.
 */
export async function startSitemapWorker(): Promise<void> {
  await boss.work('sitemap_queue', {
    localConcurrency: config.siteMapQueueConcurrency,
    batchSize: 1
  }, async (jobs: any[]) => {
    const job = jobs[0];
    const { sitemapUrl, sitemapId, depth } = job.data;

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

      // handle sitemapindex
      if (result.sitemapindex?.sitemap) {
        const entries = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
        totalItems = entries.length;

        for (const entry of entries) {
          if (!entry.loc) continue;
          const [newSitemap] = await db.insert(sitemaps)
            .values({ parentId: sitemapId, sitemapUrl: entry.loc, status: 'processing' })
            .onConflictDoUpdate({ target: sitemaps.sitemapUrl, set: { updatedAt: new Date() } })
            .returning();

          if (newSitemap) {
            await boss.send('sitemap_queue', { sitemapUrl: entry.loc, sitemapId: newSitemap.id, depth: depth + 1 });
          }
        }
      // handle urlset
      } else if (result.urlset?.url) {
        const entries = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
        totalItems = entries.length;

        for (const entry of entries) {
          if (!entry.loc || typeof entry.loc !== 'string') continue;
          const baseUrl = entry.loc.split('?')[0] ?? '';
          const isSitemap = baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz');

          // handle sitemap
          if (isSitemap) {
            const [newSitemap] = await db.insert(sitemaps)
              .values({ parentId: sitemapId, sitemapUrl: entry.loc, status: 'processing' })
              .onConflictDoUpdate({ target: sitemaps.sitemapUrl, set: { updatedAt: new Date() } })
              .returning();
            if (newSitemap) {
              await boss.send('sitemap_queue', { sitemapUrl: entry.loc, sitemapId: newSitemap.id, depth: depth + 1 });
            }
            // handle url
          } else {
            const [newUrl] = await db.insert(urls)
              .values({ sitemapId: sitemapId, url: entry.loc, status: 'queued' })
              .onConflictDoNothing()
              .returning();
            if (newUrl) {
              await boss.send('page_queue', { url: entry.loc, sitemapId: sitemapId });
            }
          }
        }
      }

      await db.update(sitemaps)
        .set({ status: 'active', totalUrlsFound: totalItems, lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(sitemaps.id, sitemapId));

    } catch (e) {
      logger.error(`Error processing sitemap ${sitemapUrl}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e;
    }
  });

  logger.info('Sitemap worker initialized with concurrency: ' + config.siteMapQueueConcurrency);
}

/**
 * Worker for scraping individual HTML pages.
 */
export async function startPageWorker(): Promise<void> {
  await boss.work('page_queue', {
    localConcurrency: config.pageQueueConcurrency,
    batchSize: 1
  }, async (jobs: any[]) => {
    const job = jobs[0];
    const { url, sitemapId } = job.data;
    const jobId = job.id;

    try {
      logger.info(`[Page Worker ${jobId}] Scraping: ${url}`);
      await db.update(urls)
        .set({ status: 'scraping', updatedAt: new Date() })
        .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));

      // sleep for a random time between 1 and 3 seconds to avoid hitting rate limits
      await sleep(Math.floor(Math.random() * 2000) + 1000);
      
      const res = await axios.get(url, {
        timeout: config.timeout,
        headers: { 'User-Agent': config.userAgent },
        validateStatus: (status) => status < 500,
      });

      if (res.status === 429) throw new Error('Rate limited (429)');
      if (res.status === 403 || res.status === 401) {
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
        logger.info(`[Page Worker ${jobId}] Successfully scraped: ${url}`);
      } else {
        await db.update(urls).set({ status: 'failed' }).where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
      }
    } catch (e) {
      logger.error(`[Page Worker ${jobId}] Failed to scrape ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e;
    }
  });

  logger.info(`Page worker initialized with concurrency: ${config.pageQueueConcurrency}`);
}
