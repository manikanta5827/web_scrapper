import { db } from '../../db/client';
import { sitemaps } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { boss } from '../../queue/boss';
import { config } from '../../utils/config';

export async function handleScrape(req: Request): Promise<Response> {
  try {
    const body: any = await req.json();
    const { url: sitemapUrl } = body;

    if (!sitemapUrl) {
      logger.warn('POST /scrape: Missing URL in request body');
      return new Response(JSON.stringify({ error: 'Missing url in body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // URL Validation
    try {
      const parsedUrl = new URL(sitemapUrl);
      if (parsedUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'Only HTTPS sitemaps are allowed' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const isXml = parsedUrl.pathname.toLowerCase().endsWith('.xml') || 
                   parsedUrl.pathname.toLowerCase().endsWith('.xml.gz');
      
      if (!isXml) {
        return new Response(JSON.stringify({ error: 'URL must end with .xml or .xml.gz' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.info(`POST /scrape: Received request for ${sitemapUrl}`);
    // add the sitemap to db and queue
    let [siteMap] = await db.insert(sitemaps).values({
      sitemapUrl,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: sitemaps.sitemapUrl,
      set: { status: 'active', updatedAt: new Date() }
    })
    .returning();

    if (!siteMap) {
       return new Response(JSON.stringify({ error: 'Failed to insert sitemap' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If it was already a root or we just created it, ensure rootId is set
    if (!siteMap.rootId) {
      const [updated] = await db.update(sitemaps)
        .set({ rootId: siteMap.id })
        .where(eq(sitemaps.id, siteMap.id))
        .returning();
      siteMap = updated;
    }

    if (!siteMap) {
       return new Response(JSON.stringify({ error: 'Failed to update sitemap rootId' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await boss.send('sitemap_queue', { 
      sitemapUrl: siteMap.sitemapUrl, 
      sitemapId: siteMap.id, 
      rootId: siteMap.rootId, 
      depth: 0 
    }, {
      retryLimit: config.retryLimit,
      retryDelay: config.retryDelay
    });

    return new Response(JSON.stringify({ message: 'Accepted', id: siteMap.id, rootId: siteMap.rootId }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`POST /scrape: Error processing request: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return new Response(JSON.stringify({ error: 'Invalid JSON or server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
