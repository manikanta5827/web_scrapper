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
 * Manages dynamic scaling of workers by adding/removing worker registrations.
 * This scales horizontally (more polling loops) within the same process.
 */
export class DynamicScaler {
  private workerIds: string[] = [];
  private currentConcurrency: number = 0;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private options: ScalerOptions,
    private handler: (jobs: any[]) => Promise<void>
  ) {}

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
      logger.error(`[DynamicScaler] ${this.options.queueName} Error updating health check: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  /**
   * Start the initial workers and the monitoring interval.
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
    logger.info(`[DynamicScaler] Started ${queueName} with ${this.currentConcurrency} workers.`);

    // Start monitoring interval
    this.interval = setInterval(() => this.checkAndScale(), this.options.pollInterval || 30000);
  }

  /**
   * Stop all workers and the monitoring interval.
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
    logger.info(`[DynamicScaler] Stopped all workers for ${this.options.queueName}.`);
  }

  /**
   * Periodic check of queue size and adjustment of worker count.
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
        logger.info(`[DynamicScaler] Scaling UP ${queueName}: ${this.currentConcurrency} -> ${targetConcurrency} (Queue: ${queueSize})`);
        
        const addPromises = Array.from({ length: toAdd }).map(() => 
          boss.work(queueName, { localConcurrency: 1, batchSize }, this.handler)
        );
        
        const newIds = await Promise.all(addPromises);
        const validIds = newIds.filter((id): id is string => !!id);
        
        this.workerIds.push(...validIds);
        this.currentConcurrency = this.workerIds.length;
        
        await this.updateGlobalCount();
      } else if (targetConcurrency < this.currentConcurrency && this.currentConcurrency > min) {
        const toRemove = this.currentConcurrency - targetConcurrency;
        logger.info(`[DynamicScaler] Scaling DOWN ${queueName}: ${this.currentConcurrency} -> ${targetConcurrency} (Queue: ${queueSize})`);
        
        const removeIds = this.workerIds.splice(-toRemove);
        const removePromises = removeIds.map(id => 
          boss.offWork(queueName, { id })
        );
        
        await Promise.all(removePromises);
        this.currentConcurrency = this.workerIds.length;
        
        await this.updateGlobalCount();
      } else {
        // Heartbeat
        await this.updateGlobalCount();
      }
    } catch (err) {
      logger.error(`[DynamicScaler] Error scaling ${queueName}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }
}
