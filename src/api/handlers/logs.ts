import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { existsSync } from 'node:fs';

export async function handleLogs(): Promise<Response> {
  try {
    const logPath = config.logFile;
    
    if (!existsSync(logPath)) {
      return new Response(JSON.stringify({ logs: ['Log file not found yet.'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Efficiently get last 100 lines using system tail command via Bun.spawn
    // This uses negligible memory regardless of file size
    const proc = Bun.spawn(['tail', '-n', '100', logPath]);
    const text = await new Response(proc.stdout).text();
    
    const lines = text.trim().split('\n').reverse();

    return new Response(JSON.stringify({ logs: lines }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`Error tailing logs: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return new Response(JSON.stringify({ error: 'Failed to read logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
