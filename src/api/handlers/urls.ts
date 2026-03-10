import { db } from '../../db/client';
import { urls as urlsTable } from '../../db/schema';
import { eq, desc, and, count as countFn } from 'drizzle-orm';

export async function handleUrls(req: Request, url: URL): Promise<Response> {
  const rootId = parseInt(url.pathname.split('/').pop() || '');
  if (isNaN(rootId)) return new Response('Invalid rootId', { status: 400 });

  // Get pagination params
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // 1. Get total count for pagination UI
  const [totalResult] = await db
    .select({ total: countFn() })
    .from(urlsTable)
    .where(and(
      eq(urlsTable.rootId, rootId),
      eq(urlsTable.status, 'done')
    ));

  // 2. Get the actual "done" URLs with pagination
  const results = await db.select()
    .from(urlsTable)
    .where(and(
      eq(urlsTable.rootId, rootId),
      eq(urlsTable.status, 'done')
    ))
    .orderBy(desc(urlsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify({
    data: results,
    pagination: {
      total: totalResult?.total,
      page,
      limit,
      totalPages: Math.ceil(totalResult?.total || 0 / limit)
    }
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
