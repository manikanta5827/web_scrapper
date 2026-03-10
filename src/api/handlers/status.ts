import { db } from '../../db/client';
import { urls as urlsTable, healthChecks } from '../../db/schema';
import { eq, count } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import os from 'os';

export async function handleGlobalStatus(): Promise<Response> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stats = await db.select().from(healthChecks);
    
    // Filter for active workers only (seen in last 5 minutes)
    const activeStats = stats.filter(s => new Date(s.lastSeen) > fiveMinutesAgo);
    
    // Log for debugging (viewable in server console)
    logger.info(`Global Status Query Result (Active): ${JSON.stringify(activeStats)}`);

    // Flexible lookup for both camelCase and snake_case keys
    const getStat = (name: string) => {
      const record = activeStats.find((s: any) => (s.serviceName === name || s.service_name === name));
      return record ? record.concurrency : 0;
    };

    const sitemapWorker = getStat('sitemap-worker');
    const pageWorker = getStat('page-worker');

    // System Memory Stats
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

    // Process Memory Stats (current Bun process)
    const processMem = process.memoryUsage();
    const rss = processMem.rss; // Resident Set Size (total memory for the process)
    const heapUsed = processMem.heapUsed;
    
    return new Response(JSON.stringify({
      workers: {
        sitemap: sitemapWorker,
        page: pageWorker
      },
      system: {
        totalMemory: totalMem,
        freeMemory: freeMem,
        usedMemory: usedMem,
        usagePercent: parseFloat(memUsagePercent)
      },
      process: {
        rss: rss,
        heapUsed: heapUsed,
        percentOfTotal: parseFloat(((rss / totalMem) * 100).toFixed(2))
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
