import { boss } from '../queue/boss';
import { logger } from './logger';
import { db } from '../db/client';
import { healthChecks } from '../db/schema';
import { getISTDate } from './time';

export interface ScalerOptions {
  queueName: string;
  serviceName: string; // The service name to update in healthChecks
  min: number;
  max: number;
  scaleUpThreshold: number;
  pollInterval?: number;
  batchSize?: number;
}

/**
 * Manages horizontal scaling of workers by adding/removing registrations.
 */
export class DynamicScaler {
  private workerIds: string[] = [];
  private currentConcurrency: number = 0;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private options: ScalerOptions,
    private handler: (jobs: any[]) => Promise<void>
  ) {}

  /**
   * Update the heartbeat and pool stats in DB
   */
  private async updateGlobalCount() {
    try {
      await db.insert(healthChecks)
        .values({ 
          serviceName: this.options.serviceName, 
          concurrency: this.currentConcurrency,
          lastSeen: getISTDate()
        })
        .onConflictDoUpdate({
          target: healthChecks.serviceName,
          set: { 
            concurrency: this.currentConcurrency,
            lastSeen: getISTDate()
          }
        });
    } catch (err) {
      logger.error(`[Scaler] ${this.options.serviceName} heartbeat failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  /**
   * Initialize workers and start monitoring
   */
  async start() {
    const { min, batchSize = 1, queueName } = this.options;
    
    if (min > 0) {
      const startPromises = Array.from({ length: min }).map(() => 
        boss.work(queueName, { localConcurrency: 1, batchSize }, this.handler)
      );
      
      const ids = await Promise.all(startPromises);
      this.workerIds.push(...ids.filter((id): id is string => !!id));
      this.currentConcurrency = this.workerIds.length;
    }

    await this.updateGlobalCount();
    logger.info(`[Scaler] Started ${this.options.serviceName} with ${this.currentConcurrency} workers`);

    this.interval = setInterval(() => this.checkAndScale(), this.options.pollInterval || 30000);
  }

  /**
   * Stop all workers and monitoring
   */
  async stop() {
    if (this.interval) clearInterval(this.interval);
    
    const stopPromises = this.workerIds.map(id => 
      boss.offWork(this.options.queueName, { id })
    );
    
    await Promise.all(stopPromises);
    
    this.workerIds = [];
    this.currentConcurrency = 0;
    await this.updateGlobalCount();
    logger.info(`[Scaler] Stopped ${this.options.serviceName}`);
  }

  /**
   * Adjust worker count based on queue pressure
   */
  private async checkAndScale() {
    const { queueName, max, min, scaleUpThreshold, batchSize = 1 } = this.options;
    
    try {
      const stats = await boss.getQueueStats(queueName);
      const queueSize = stats.queuedCount;
      
      let targetConcurrency = Math.ceil(queueSize / scaleUpThreshold);
      targetConcurrency = Math.max(min, Math.min(max, targetConcurrency));

      if (targetConcurrency > this.currentConcurrency) {
        const toAdd = targetConcurrency - this.currentConcurrency;
        logger.debug(`[Scaler] ${queueName} Scaling UP: ${this.currentConcurrency} -> ${targetConcurrency}`);
        
        const addPromises = Array.from({ length: toAdd }).map(() => 
          boss.work(queueName, { localConcurrency: 1, batchSize }, this.handler)
        );
        
        const newIds = await Promise.all(addPromises);
        this.workerIds.push(...newIds.filter((id): id is string => !!id));
        this.currentConcurrency = this.workerIds.length;
        
        await this.updateGlobalCount();
      } else if (targetConcurrency < this.currentConcurrency && this.currentConcurrency > min) {
        const toRemove = this.currentConcurrency - targetConcurrency;
        logger.debug(`[Scaler] ${queueName} Scaling DOWN: ${this.currentConcurrency} -> ${targetConcurrency}`);
        
        const removeIds = this.workerIds.splice(-toRemove);
        await Promise.all(removeIds.map(id => boss.offWork(queueName, { id })));
        this.currentConcurrency = this.workerIds.length;
        
        await this.updateGlobalCount();
      } else {
        await this.updateGlobalCount();
      }
    } catch (err) {
      logger.error(`[Scaler] ${queueName} scaling failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
