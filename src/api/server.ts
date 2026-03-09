import { logger } from '../utils/logger';
import { db } from '../db/client';
import { sitemaps } from '../db/schema';
import { config } from '../utils/config';
import { boss } from '../queue/boss';

export function startServer() {
  const server = Bun.serve({
    port: process.env.PORT || 3003,
    async fetch(req) {
      const url = new URL(req.url);

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
          const [siteMap] = await db.insert(sitemaps).values({
            sitemapUrl,
            status: 'active',
          }).returning();

          // Enqueue the sitemap for processing if it was successfully added to the DB
          if (!siteMap) {
            logger.info(`POST /scrape: Sitemap already exists in DB, skipping enqueue: ${sitemapUrl}`);
            return new Response(JSON.stringify({ error: 'Sitemap already exists' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          await boss.send('sitemap_queue', { siteMapUrl: siteMap.sitemapUrl, siteMapId: siteMap.id, depth: 0 }, {
            retryLimit: config.retryLimit,
            retryDelay: config.retryDelay
          });

          return new Response(JSON.stringify({ message: 'Accepted', id: siteMap?.id }), {
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
