import { db } from '../../db/client';
import { sql } from 'drizzle-orm';

export async function handleHealth(req: Request): Promise<Response> {
  try {
    // Check DB connection
    await db.execute(sql`SELECT 1`);

    return new Response(JSON.stringify({
      api: 'up',
      database: 'connected',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
