import { PgBoss } from 'pg-boss';
import { config } from '../config';
import { logger } from '../utils/logger';

export const boss = new PgBoss(config.databaseUrl);

boss.on('error', (e: Error) => logger.error(`pg-boss: ${e.message}`));

export async function initQueue(): Promise<void> {
  await boss.start();
  logger.info('pg-boss queue started');
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
  logger.info('pg-boss queue stopped');
}
