import { db } from '../../db/client';
import { urls as urlsTable, healthChecks } from '../../db/schema';
import { eq, count } from 'drizzle-orm';
import { logger } from '../../utils/logger';

export async function handleGlobalStatus(): Promise<Response> {
  try {
    const stats = await db.select().from(healthChecks);
    
    // Log for debugging (viewable in server console)
    logger.info(`Global Status Query Result: ${JSON.stringify(stats)}`);

    // Flexible lookup for both camelCase and snake_case keys
    const getStat = (name: string) => {
      const record = stats.find((s: any) => (s.serviceName === name || s.service_name === name));
      return record ? record.concurrency : 0;
    };

    const sitemapWorkers = getStat('sitemap-worker');
    const pageWorkers = getStat('page-worker');

    return new Response(JSON.stringify({
      workers: {
        sitemap: sitemapWorkers,
        page: pageWorkers
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`GET /api/global-status: Error fetching worker status: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return new Response(JSON.stringify({ error: 'Server error fetching worker status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleStatus(req: Request, url: URL): Promise<Response> {
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
