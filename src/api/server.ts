import { logger } from '../utils/logger';
import { db } from '../db/client';
import { sitemaps, urls as urlsTable } from '../db/schema';
import { config } from '../utils/config';
import { boss } from '../queue/boss';
import { eq, count } from 'drizzle-orm';

export function startServer() {
  const server = Bun.serve({
    port: process.env.PORT || 3003,
    async fetch(req) {
      const url = new URL(req.url);

      // Handle GET /status/:rootId
      if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
        const rootId = parseInt(url.pathname.split('/').pop() || '');
        
        if (isNaN(rootId)) {
          return new Response(JSON.stringify({ error: 'Invalid rootId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        try {
          const results = await db
            .select({
              status: urlsTable.status,
              count: count(),
            })
            .from(urlsTable)
            .where(eq(urlsTable.rootId, rootId))
            .groupBy(urlsTable.status);

          const total = results.reduce((acc, curr) => acc + curr.count, 0);

          return new Response(JSON.stringify({
            rootId,
            total,
            breakdown: results
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          logger.error(`GET /status/${rootId}: Error fetching status: ${e instanceof Error ? e.message : 'Unknown error'}`);
          return new Response(JSON.stringify({ error: 'Server error fetching status' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (req.method === 'POST' && url.pathname === '/scrape') {
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

      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`API Server running on port ${server.port}`);
  return server;
}
