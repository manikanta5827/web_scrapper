import { db } from '../../db/client';
import { urls as urlsTable, healthChecks, sitemaps as sitemapsTable } from '../../db/schema';
import { eq, count, and, isNotNull, sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import os from 'os';

export async function handleGlobalStatus(): Promise<Response> {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const stats = await db.select().from(healthChecks);
    
    // Filter for active workers only (seen in last 1 minute)
    const activeStats = stats.filter(s => new Date(s.lastSeen) > oneMinuteAgo);
    
    // Option B: Direct DB query for total connections to this database
    const dbConnectionsResult = await db.execute(sql`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
      AND state IS NOT NULL
    `);
    const totalDbConnections = parseInt(dbConnectionsResult.rows[0]?.count as string || '0');

    // Combine all
    const allPools: any[] = []; // Leaving empty to satisfy any frontend loop for now

    // Log for debugging
    logger.info(`Global Status Query Result (Active): ${JSON.stringify(activeStats)}`);

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

    // Process Memory Stats
    const processMem = process.memoryUsage();
    
    return new Response(JSON.stringify({
      workers: {
        sitemap: sitemapWorker,
        page: pageWorker
      },
      db: {
        totalActiveConnections: totalDbConnections,
        processPools: allPools
      },
      system: {
        totalMemory: totalMem,
        freeMemory: freeMem,
        usedMemory: usedMem,
        usagePercent: parseFloat(memUsagePercent)
      },
      process: {
        rss: processMem.rss,
        heapUsed: processMem.heapUsed,
        percentOfTotal: parseFloat(((processMem.rss / totalMem) * 100).toFixed(2))
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
    // 1. Get SUB-Sitemap count for this root (excluding the root itself)
    // We do this by checking where root_id matches but parent_id IS NOT NULL
    const sitemapResult = await db
      .select({ value: count() })
      .from(sitemapsTable)
      .where(
        and(
          eq(sitemapsTable.rootId, rootId),
          isNotNull(sitemapsTable.parentId)
        )
      );
    
    // 2. Get Page status breakdown
    const results = await db
      .select({
        status: urlsTable.status,
        count: count(),
      })
      .from(urlsTable)
      .where(eq(urlsTable.rootId, rootId))
      .groupBy(urlsTable.status);

    const totalPages = results.reduce((acc, curr) => acc + curr.count, 0);
    const getCount = (status: string) => results.find(r => r.status === status)?.count || 0;

    return new Response(JSON.stringify({
      rootId,
      sitemaps: sitemapResult[0]?.value || 0,
      pages: {
        total: totalPages,
        done: getCount('done'),
        scraping: getCount('scraping'),
        queued: getCount('queued'),
        failed: getCount('failed')
      },
      breakdown: results // Keep for compatibility
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
