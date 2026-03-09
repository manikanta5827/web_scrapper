import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { createHash } from 'crypto';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const hash = (c: string) => createHash('sha256').update(c).digest('hex');

/**
 * Processes a sitemap URL to extract and enqueue page URLs.
 * Ignores sitemap indexes and only processes direct urlset links.
 */
export async function processSitemap(url: string): Promise<number | null> {
  try {
    logger.debug(`Fetching sitemap: ${url}`);
    const res = await axios.get(url, { timeout: config.timeout, headers: { 'User-Agent': config.userAgent } });
    const currentHash = hash(res.data);
    
    let sitemap = await db.select().from(sitemaps).where(eq(sitemaps.sitemapUrl, url)).limit(1).then(r => r[0]);
    
    if (sitemap) {
      if (sitemap.lastHash === currentHash) {
        logger.info(`Sitemap content unchanged, skipping: ${url}`);
        return sitemap.id;
      }
      await db.update(sitemaps).set({ lastHash: currentHash, status: 'processing', lastCheckedAt: new Date() }).where(eq(sitemaps.id, sitemap.id));
    } else {
      const inserted = await db.insert(sitemaps).values({ sitemapUrl: url, lastHash: currentHash, status: 'processing', lastCheckedAt: new Date() }).returning();
      sitemap = inserted[0];
    }

    if (!sitemap) return null;

    const result = await parseStringPromise(res.data, { explicitArray: false });

    if (result.urlset?.url) {
      const urlList = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      const sitemapId = sitemap.id;
      logger.info(`Found ${urlList.length} page URLs in sitemap: ${url}`);
      
      // Sequential processing: one after another
      for (const entry of urlList) {
        try {
          const loc = entry.loc;
          if (!loc) continue;
          
          // Check if URL already exists for this sitemap
          const exists = await db.select().from(urls).where(and(eq(urls.url, loc), eq(urls.sitemapId, sitemapId))).limit(1);
          
          // If not exists, insert and enqueue
          if (exists.length === 0) {
            await db.insert(urls).values({ url: loc, sitemapId: sitemapId });
            await boss.send('scrape_queue', { url: loc, sitemapId: sitemapId }, { retryLimit: config.retryLimit, retryDelay: config.retryDelay });
            logger.debug(`Enqueued new URL: ${loc}`);
          }
        } catch (e) {
          logger.error(`Failed to process individual URL ${entry?.loc} from sitemap: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      
      await db.update(sitemaps).set({ status: 'active', totalUrlsFound: urlList.length, lastCheckedAt: new Date() }).where(eq(sitemaps.id, sitemapId));
    } else {
      logger.warn(`No urlset found in sitemap: ${url}.`);
      await db.update(sitemaps).set({ status: 'failed' }).where(eq(sitemaps.id, sitemap.id));
    }

    logger.info(`Successfully processed sitemap: ${url}`);
    return sitemap.id;
  } catch (e) {
    logger.error(`Error processing sitemap ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return null;
  }
}
