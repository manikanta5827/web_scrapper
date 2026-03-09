import { processSitemap } from '../scraper/processor';

const server = Bun.serve({
    port: process.env.PORT || 3000,
    async fetch(req: any) {
      const url = new URL(req.url);

      if (req.method === 'POST' && url.pathname === '/scrape') {
        try {
          const body = await req.json();
          const { url: sitemapUrl } = body;

          if (!sitemapUrl) {
            return new Response(JSON.stringify({ error: 'Missing url in body' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Trigger processing in background
          const sitemapId = await processSitemap(sitemapUrl);

          return new Response(JSON.stringify({ message: 'Accepted', id: sitemapId }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Invalid JSON or server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  console.log(`[INFO] API Server running on port ${server.port}`);