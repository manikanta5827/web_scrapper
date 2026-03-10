import { db } from '../../db/client';
import { sitemaps } from '../../db/schema';
import { eq, isNull, desc } from 'drizzle-orm';
import { logger } from '../../utils/logger';

export async function handleGetSitemaps(): Promise<Response> {
  try {
    const results = await db.select()
      .from(sitemaps)
      .where(isNull(sitemaps.parentId))
      .orderBy(desc(sitemaps.createdAt));

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`GET /api/sitemaps: Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    return new Response(JSON.stringify({ error: 'Failed to fetch sitemaps' }), { status: 500 });
  }
}

export async function handleDeleteSitemap(req: Request, url: URL): Promise<Response> {
  const id = parseInt(url.pathname.split('/').pop() || '');
  
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  }

  try {
    logger.info(`Deleting root sitemap and all children: ID ${id}`);
    
    // Cascading delete handles URLs and Sub-Sitemaps automatically 
    // because of the ON DELETE CASCADE constraint we added.
    await db.delete(sitemaps).where(eq(sitemaps.id, id));

    return new Response(JSON.stringify({ message: 'Deleted successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`DELETE /api/sitemaps/${id}: Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    return new Response(JSON.stringify({ error: 'Failed to delete sitemap' }), { status: 500 });
  }
}
