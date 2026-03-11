import { db } from '../../db/client';
import { urls as urlsTable } from '../../db/schema';
import { eq, desc, and, count as countFn } from 'drizzle-orm';

export async function handleUrls(req: Request, url: URL): Promise<Response> {
  const rootId = parseInt(url.pathname.split('/').pop() || '');
  if (isNaN(rootId)) return new Response('Invalid rootId', { status: 400 });

  // Get pagination and filter params
  const page = parseInt(url.searchParams.get('page') || '0');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const statusFilter = url.searchParams.get('status') || 'all';
  const offset = page * limit;

  const conditions = [eq(urlsTable.rootId, rootId)];
  if (statusFilter !== 'all') {
    conditions.push(eq(urlsTable.status, statusFilter as any));
  }

  // 1. Get total count for pagination UI
  const [totalResult] = await db
    .select({ total: countFn() })
    .from(urlsTable)
    .where(and(...conditions));

  // 2. Get the actual URLs with pagination
  const results = await db.select()
    .from(urlsTable)
    .where(and(...conditions))
    .orderBy(desc(urlsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify({
    data: results,
    pagination: {
      total: totalResult?.total,
      page,
      limit,
    }
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
