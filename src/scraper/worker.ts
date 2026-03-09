import axios from 'axios';
import { db } from '../db/client';
import { urls } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../config';
import { extract } from './extractor';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startWorker(): Promise<void> {
  await boss.work('scrape_queue', { batchSize: config.concurrency }, async (jobs) => {
    await Promise.all(jobs.map(async (job: any) => {
      const { url, sitemapId } = job.data;
      try {
        await db.update(urls)
          .set({ status: 'scraping', updatedAt: new Date() })
          .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));

        await sleep(config.requestDelay);

        const res = await axios.get(url, {
          timeout: config.timeout,
          headers: { 'User-Agent': config.userAgent },
          validateStatus: (status) => status < 500,
        });

        if (res.status === 429) throw new Error('Rate limited');
        
        if (res.status === 403 || res.status === 401) {
          await db.update(urls)
            .set({ status: 'failed' })
            .where(and(eq(urls.url, url), eq(urls.sitemapId, sitemapId)));
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
          console.log(`[INFO] Scraped: ${url}`);
        }
      } catch (e) {
        console.error(`[ERROR] URL ${url}: ${e instanceof Error ? e.message : ''}`);
        throw e;
      }
    }));
  });
  console.log(`[INFO] Worker active (concurrency: ${config.concurrency})`);
}
