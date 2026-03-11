import { db, queuePool } from '../../db/client';
import { urls as urlsTable, sitemaps as sitemapsTable } from '../../db/schema';
import { eq, count, and, isNotNull, sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { boss } from '../../queue/boss';

export async function handleGlobalStatus(): Promise<Response> {
  try {
    // 1. Query Project A (Main DB) connections
    const dbConnectionsResult = await db.execute(sql`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
      AND state IS NOT NULL
    `);
    const totalDbConnections = parseInt(dbConnectionsResult.rows[0]?.count as string || '0');

    // 2. Query Project B (Queue DB) connections if separate
    let queueDbConnections = 0;
    if (queuePool) {
      const client = await queuePool.connect();
      try {
        const res = await client.query(`
          SELECT count(*) as count 
          FROM pg_stat_activity 
          WHERE datname = current_database()
          AND state IS NOT NULL
        `);
        queueDbConnections = parseInt(res.rows[0]?.count as string || '0');
      } finally {
        client.release();
      }
    } else {
      queueDbConnections = totalDbConnections; // Same DB
    }

    return new Response(JSON.stringify({
      workers: {
        sitemap: 0,
        page: 0
      },
      db: {
        totalActiveConnections: totalDbConnections,
        queueActiveConnections: queueDbConnections
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`GET /api/global-status: Error fetching global status: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return new Response(JSON.stringify({ error: 'Server error fetching status' }), {
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
