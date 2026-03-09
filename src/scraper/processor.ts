import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { createHash } from 'crypto';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../config';

const hash = (c: string) => createHash('sha256').update(c).digest('hex');

export async function processSitemap(url: string, depth = 0): Promise<number | null> {
  if (depth > config.maxSitemapDepth) return null;

  try {
    const res = await axios.get(url, { timeout: config.timeout, headers: { 'User-Agent': config.userAgent } });
    const currentHash = hash(res.data);
    
    let sitemap = await db.select().from(sitemaps).where(eq(sitemaps.sitemapUrl, url)).limit(1).then(r => r[0]);
    
    if (sitemap) {
      if (sitemap.lastHash === currentHash) {
        console.log(`[INFO] Sitemap unchanged: ${url}`);
        return sitemap.id;
      }
      await db.update(sitemaps).set({ lastHash: currentHash, status: 'processing', lastCheckedAt: new Date() }).where(eq(sitemaps.id, sitemap.id));
    } else {
      const inserted = await db.insert(sitemaps).values({ sitemapUrl: url, lastHash: currentHash, status: 'processing', lastCheckedAt: new Date() }).returning();
      sitemap = inserted[0];
    }

    if (!sitemap) return null;

    const result = await parseStringPromise(res.data, { explicitArray: false });

    // Handle sitemapindex
    if (result.sitemapindex?.sitemap) {
      const nested = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
      for (const e of nested) {
        if (e.loc) await processSitemap(e.loc, depth + 1);
      }
    }

    // Handle urlset
    if (result.urlset?.url) {
      const urlList = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      const sitemapId = sitemap.id;
      
      for (let i = 0; i < urlList.length; i += config.batchSize) {
        const batch = urlList.slice(i, i + config.batchSize);
        await Promise.all(batch.map(async (e: any) => {
          if (!e.loc) return;
          const exists = await db.select().from(urls).where(and(eq(urls.url, e.loc), eq(urls.sitemapId, sitemapId))).limit(1);
          if (exists.length === 0) {
            await db.insert(urls).values({ url: e.loc, sitemapId: sitemapId });
            await boss.send('scrape_queue', { url: e.loc, sitemapId: sitemapId }, { retryLimit: config.retryLimit, retryDelay: config.retryDelay });
          }
        }));
      }
      await db.update(sitemaps).set({ status: 'active', totalUrlsFound: urlList.length, lastCheckedAt: new Date() }).where(eq(sitemaps.id, sitemapId));
    }

    console.log(`[INFO] Processed sitemap: ${url}`);
    return sitemap.id;
  } catch (e) {
    console.error(`[ERROR] Sitemap ${url}: ${e instanceof Error ? e.message : ''}`);
    return null;
  }
}
