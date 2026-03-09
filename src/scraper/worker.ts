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
    const { siteMapUrl, siteMapId, depth } = job.data;
    try {
      // get the content of the sitemap
      const res = await axios.get(siteMapUrl, {
        timeout: config.timeout,
        headers: { 'User-Agent': config.userAgent },
      });

      if (!res.data || typeof res.data !== 'string') {
        await db.update(sitemaps).set({ status: 'failed' }).where(eq(sitemaps.sitemapUrl, siteMapUrl));
        return null;
      }

      // check if content is sitemap then add it to sitemap queue ,else if urlset and contains xml add it to sitemap queue else add it to url queue
      const result = await parseStringPromise(res.data, {
        explicitArray: false,
        trim: true,
        ignoreAttrs: false
      });

      if (!result) {
        await db.update(sitemaps).set({ status: 'failed' }).where(eq(sitemaps.sitemapUrl, siteMapUrl));
        return null;
      }

      if (result.sitemapindex?.sitemap) {
        const entries = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
        for (const entry of entries) {
          if (entry.loc) {
            // add this sub sitemap to the db and queue
            const [newSitemap] = await db.insert(sitemaps).values({
              parentId: siteMapId,
              sitemapUrl: entry.loc,
              status: 'active',
            }).onConflictDoNothing().returning();

            if(!newSitemap) {
              logger.info(`Sitemap already exists in DB, skipping enqueue: ${entry.loc}`);
              continue; // Skip if sitemap already exists (due to unique constraint)
            }

            await boss.send('sitemap_queue', { siteMapUrl: entry.loc, siteMapId: newSitemap.id, depth: depth + 1 }, {
              retryLimit: config.retryLimit,
              retryDelay: config.retryDelay
            });
          }
        }
      } else if (result.urlset?.url) {
        const entries = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
        for (const entry of entries) {
          if (entry.loc && typeof entry.loc === 'string') {
            const baseUrl = entry.loc.split('?')[0] ?? '';
            if (baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz')) {
              // add this sub sitemap to the queue
              const [newSitemap] = await db.insert(sitemaps).values({
                parentId: siteMapId,
                sitemapUrl: entry.loc,
                status: 'active',
              }).onConflictDoNothing().returning();

              if(!newSitemap) {
                logger.info(`Sitemap already exists in DB, skipping enqueue: ${entry.loc}`);
                continue; // Skip if sitemap already exists (due to unique constraint)
              }

              await boss.send('sitemap_queue', { siteMapUrl: entry.loc, siteMapId: newSitemap.id, depth: depth + 1 }, {
                retryLimit: config.retryLimit,
                retryDelay: config.retryDelay
              });
            }
            else {
              // add this url to the url queue
              const [newUrl] = await db.insert(urls).values({
                sitemapId: siteMapId,
                url: entry.loc,
                status: 'queued',
              }).onConflictDoNothing().returning();

              if(!newUrl) {
                logger.info(`URL already exists in DB, skipping enqueue: ${entry.loc}`);
                continue; // Skip if URL already exists (due to unique constraint)
              }
              await boss.send('url_queue', { url: entry.loc, sitemapId: siteMapId }, {
                retryLimit: config.retryLimit,
                retryDelay: config.retryDelay
              });
            }
          }
        }
      }

    } catch (e) {
      logger.error(`Error enqueuing sitemap ${siteMapUrl}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e; // Let BullMQ handle retries based on the configuration
    }
  });

  // 2. Process Page URLs
  await boss.work('page_queue', {
    localConcurrency: config.concurrency,
    batchSize: 1
  }, async (jobs: any[]) => {
    // With batchSize: 1, jobs is an array with exactly one element
    const job = jobs[0];
    const { pageUrl, sitemapId } = job.data;
    const jobId = job.id;

    try {
      logger.info(`[Job ${jobId}] Starting scrape for: ${pageUrl}`);

      // 1. Mark as scraping
      await db.update(urls)
        .set({ status: 'scraping', updatedAt: new Date() })
        .where(and(eq(urls.url, pageUrl), eq(urls.sitemapId, sitemapId)))

      // 3. Fetch
      const res = await axios.get(pageUrl, {
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
          .where(and(eq(urls.url, pageUrl), eq(urls.sitemapId, sitemapId)));
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
          .where(and(eq(urls.url, pageUrl), eq(urls.sitemapId, sitemapId)));
        logger.info(`[Job ${jobId}] Successfully scraped: ${pageUrl}`);
      } else {
        logger.warn(`[Job ${jobId}] Skipping non-HTML content (${contentType})`);
        await db.update(urls)
          .set({ status: 'failed' })
          .where(and(eq(urls.url, pageUrl), eq(urls.sitemapId, sitemapId)));
      }
    } catch (e) {
      logger.error(`[Job ${jobId}] Failed to scrape ${pageUrl}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      throw e;
    }
  });

  logger.info(`Worker initialized with localConcurrency: ${config.concurrency}`);
}
