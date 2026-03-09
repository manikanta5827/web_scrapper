import { PgBoss } from 'pg-boss';
import { config } from '../config';

export const boss = new PgBoss(config.databaseUrl);

boss.on('error', (e: any) => console.error(`[ERROR] pg-boss: ${e.message}`));

export async function initQueue(): Promise<void> {
  await boss.start();
  console.log('[INFO] pg-boss queue started');
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
  console.log('[INFO] pg-boss queue stopped');
}
