import { logger } from '../utils/logger';
import { handleScrape } from './handlers/scrape';
import { handleHealth } from './handlers/health';
import { handleStatus, handleGlobalStatus } from './handlers/status';
import { handleDashboard } from './handlers/dashboard';
import { handleUrls } from './handlers/urls';
import { handleLogs } from './handlers/logs';
import { handleGetSitemaps, handleDeleteSitemap } from './handlers/sitemaps';

export function startServer() {
  const server = Bun.serve({
    port: process.env.PORT || 3003,
    idleTimeout: 30, // Increase timeout to 30 seconds
    async fetch(req) {
      const url = new URL(req.url);

      // --- DASHBOARD HTML (Index and Detail) ---
      if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/'))) {
        return handleDashboard(req, url);
      }

      // --- LOGS DASHBOARD ---
      if (req.method === 'GET' && url.pathname === '/logs') {
        try {
          const html = await Bun.file('src/api/logs.html').text();
          return new Response(html, { headers: { 'Content-Type': 'text/html' } });
        } catch (e) {
          return new Response('Log dashboard template not found', { status: 404 });
        }
      }

      // --- API: URL LIST ---
      if (req.method === 'GET' && url.pathname.startsWith('/api/urls/')) {
        return handleUrls(req, url);
      }

      // --- HEALTH ---
      if (req.method === 'GET' && url.pathname === '/health') {
        return handleHealth(req);
      }

      // --- GLOBAL STATUS ---
      if (req.method === 'GET' && url.pathname === '/api/global-status') {
        return handleGlobalStatus();
      }

      // --- API: LOGS ---
      if (req.method === 'GET' && url.pathname === '/api/logs') {
        return handleLogs();
      }

      // --- API: SITEMAPS ---
      if (req.method === 'GET' && url.pathname === '/api/sitemaps') {
        return handleGetSitemaps();
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/sitemaps/')) {
        return handleDeleteSitemap(req, url);
      }

      // --- STATUS ---
      if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
        return handleStatus(req, url);
      }

      // --- SCRAPE ---
      if (req.method === 'POST' && url.pathname === '/scrape') {
        return handleScrape(req);
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`API Server running on port ${server.port}`);
  return server;
}
