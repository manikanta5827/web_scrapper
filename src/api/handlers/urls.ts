import { db } from '../../db/client';
import { urls as urlsTable } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function handleUrls(req: Request, url: URL): Promise<Response> {
  const rootId = parseInt(url.pathname.split('/').pop() || '');
  if (isNaN(rootId)) return new Response('Invalid rootId', { status: 400 });

  const results = await db.select()
    .from(urlsTable)
    .where(eq(urlsTable.rootId, rootId))
    .orderBy(desc(urlsTable.updatedAt))
    .limit(100);

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
}
