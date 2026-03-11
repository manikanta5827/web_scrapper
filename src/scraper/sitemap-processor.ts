import axios from 'axios';
import { db } from '../db/client';
import { sitemaps, urls } from '../db/schema';
import { eq } from 'drizzle-orm';
import { boss } from '../queue/boss';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { parseStringPromise } from 'xml2js';
import { getISTDate } from '../utils/time';
import { parseDate, isNotFoundError } from './utils';
import type { SitemapJobData } from './types';

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

  const uniqueEntries = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.loc, entry);
      return map;
    }, new Map<string, { loc: string; lastMod: Date | null }>()).values()
  );

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

  const uniqueEntries = Array.from(
    entries.reduce((map, entry) => {
      map.set(entry.loc, entry);
      return map;
    }, new Map<string, { loc: string; lastMod: Date | null }>()).values()
  );

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
export async function processSitemap(data: SitemapJobData): Promise<void> {
  const { sitemapUrl, sitemapId, rootId, depth } = data;

  if (depth > 5) {
    logger.warn(`Max depth reached for: ${sitemapUrl}`);
    try {
      await db.update(sitemaps)
        .set({ status: 'failed', failureReason: 'Max depth (5) reached', updatedAt: getISTDate() })
        .where(eq(sitemaps.id, sitemapId));
    } catch (e) {
      if (isNotFoundError(e)) return;
      throw e;
    }
    return;
  }

  try {
    logger.info(`[Sitemap Worker] Fetching: ${sitemapUrl}`);
    const res = await axios.get(sitemapUrl, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
    });

    if (!res.data || typeof res.data !== 'string') {
      const msg = 'Empty or invalid sitemap response';
      try {
        await db.update(sitemaps).set({ status: 'failed', failureReason: msg }).where(eq(sitemaps.id, sitemapId));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
      throw new Error(msg);
    }

    const result = await parseStringPromise(res.data, {
      explicitArray: false,
      trim: true,
      ignoreAttrs: false
    });

    if (!result) {
      const msg = 'Failed to parse sitemap XML';
      try {
        await db.update(sitemaps).set({ status: 'failed', failureReason: msg }).where(eq(sitemaps.id, sitemapId));
      } catch (dbErr) {
        if (isNotFoundError(dbErr)) return;
        throw dbErr;
      }
      throw new Error(msg);
    }

    let totalItems = 0;

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
            logger.warn(`Parent sitemap ${sitemapId} was deleted, stopping crawl.`);
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
        const sitemapEntries: any[] = [];
        const urlEntries: any[] = [];

        for (const entry of entries) {
          const baseUrl = entry.loc.split('?')[0] ?? '';
          const isSitemap = baseUrl.toLowerCase().endsWith('.xml') || baseUrl.toLowerCase().endsWith('.xml.gz');
          const entryData = { loc: entry.loc, lastMod: parseDate(entry.lastmod) };
          
          if (isSitemap) sitemapEntries.push(entryData);
          else urlEntries.push(entryData);
        }

        try {
          if (sitemapEntries.length > 0) await bulkProcessSitemaps(sitemapEntries, sitemapId, rootId, depth);
          if (urlEntries.length > 0) await bulkProcessUrls(urlEntries, sitemapId, rootId);
        } catch (dbErr) {
          if (isNotFoundError(dbErr)) {
            logger.warn(`Parent sitemap ${sitemapId} was deleted, stopping branch.`);
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
    if (e instanceof Error && (e.message.includes('Empty') || e.message.includes('parse'))) throw e;

    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error(`Error processing sitemap ${sitemapUrl}: ${msg}`);
    try {
      await db.update(sitemaps).set({ status: 'failed', failureReason: msg }).where(eq(sitemaps.id, sitemapId));
    } catch (dbErr) {
      if (isNotFoundError(dbErr)) return;
    }
    throw e;
  }
}
