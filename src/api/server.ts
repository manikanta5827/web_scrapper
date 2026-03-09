import { processSitemap } from '../scraper/processor';
import { logger } from '../utils/logger';

export function startServer() {
  const server = Bun.serve({
    port: process.env.PORT || 3000,
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
          // Trigger processing in background
          const sitemapId = await processSitemap(sitemapUrl);

          return new Response(JSON.stringify({ message: 'Accepted', id: sitemapId }), {
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
