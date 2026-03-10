import { db } from '../../db/client';
import { healthChecks } from '../../db/schema';
import os from 'os';

export async function handleHealth(req: Request): Promise<Response> {
  try {
    const heartbeats = await db.select().from(healthChecks);
    const now = new Date().getTime();
    
    // Memory calculations (in MB)
    const totalMem = os.totalmem() / (1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024);
    const processMem = process.memoryUsage().rss / (1024 * 1024);

    const status = {
      api: 'up',
      database: 'connected',
      workers: heartbeats.map(h => ({
        name: h.serviceName,
        status: (now - h.lastSeen.getTime()) < 60000 ? 'healthy' : 'down',
        lastSeen: h.lastSeen
      })),
      system: {
        uptime: Math.floor(process.uptime()) + 's',
        totalMemory: Math.round(totalMem) + ' MB',
        freeMemory: Math.round(freeMem) + ' MB',
        processUsedMemory: Math.round(processMem) + ' MB',
        memoryUsagePercent: Math.round((processMem / totalMem) * 100) + '%'
      }
    };

    return new Response(JSON.stringify(status), {
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
