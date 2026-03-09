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
 * Processes a sitemap URL. 
 * If it's an Index, it follows the sub-sitemaps.
 * If it's a Urlset, it enqueues the page links.
 */
export async function processSitemap(url: string, depth = 0): Promise<number | null> {
  // Limit recursion depth to prevent infinite loops (max 3 levels)
  if (depth > 3) {
    logger.warn(`Max depth reached for: ${url}`);
    return null;
  }

  try {
    logger.debug(`Fetching sitemap: ${url}`);
    const res = await axios.get(url, { 
      timeout: config.timeout, 
      headers: { 'User-Agent': config.userAgent },
      // Some sitemaps might have different encodings, 
      // but axios handles common ones by default.
    });

    if (!res.data || typeof res.data !== 'string') {
      logger.warn(`Sitemap ${url} returned empty or invalid data.`);
      return null;
    }

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

    // Parse the XML content into a JavaScript object
    // trim: true helps with whitespace issues
    const result = await parseStringPromise(res.data, { 
      explicitArray: false,
      trim: true,
      ignoreAttrs: false 
    });

    if (!result) {
      logger.error(`Failed to parse XML for sitemap: ${url}`);
      return sitemap.id;
    }

    // CASE 1: This is a Sitemap Index (Contains links to other sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const nested = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
      logger.info(`Found sitemap index with ${nested.length} sub-sitemaps: ${url}`);
      for (const entry of nested) {
        if (entry.loc) {
          // Recursively process the sub-sitemap
          await processSitemap(entry.loc, depth + 1);
        }
      }
    }

    // CASE 2: This is a Urlset (Contains actual page URLs)
    else if (result.urlset && result.urlset.url) {
      const urlList = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      const sitemapId = sitemap.id;
      logger.info(`Found ${urlList.length} page URLs in sitemap: ${url}`);
      
      for (const entry of urlList) {
        try {
          const loc = entry.loc;
          if (!loc) continue;
          
          const exists = await db.select().from(urls).where(and(eq(urls.url, loc), eq(urls.sitemapId, sitemapId))).limit(1);
          
          if (exists.length === 0) {
            await db.insert(urls).values({ url: loc, sitemapId: sitemapId });
            await boss.send('scrape_queue', { url: loc, sitemapId: sitemapId }, { retryLimit: config.retryLimit, retryDelay: config.retryDelay });
            logger.debug(`Enqueued new URL: ${loc}`);
          }
        } catch (e) {
          logger.error(`Failed to process individual URL ${entry?.loc}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      await db.update(sitemaps).set({ status: 'active', totalUrlsFound: urlList.length, lastCheckedAt: new Date() }).where(eq(sitemaps.id, sitemapId));
    } else {
      logger.warn(`No sitemapindex or urlset recognized in: ${url}`);
    }

    logger.info(`Successfully finished processing: ${url}`);
    return sitemap.id;
  } catch (e) {
    logger.error(`Error processing sitemap ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return null;
  }
}
