import { boss } from '../queue/boss';
import { logger } from './logger';
import { db } from '../db/client';
import { healthChecks } from '../db/schema';

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
          lastSeen: new Date()
        })
        .onConflictDoUpdate({
          target: healthChecks.serviceName,
          set: { 
            concurrency: this.currentConcurrency,
            lastSeen: new Date()
          }
        });
    } catch (err) {
      logger.error(`[DynamicScaler] Error updating database concurrency: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Start the initial workers and the monitoring interval.
   */
  async start() {
    const { min, batchSize = 1, queueName } = this.options;
    
    // Start initial workers
    for (let i = 0; i < min; i++) {
      const workerId = await boss.work(queueName, { 
        localConcurrency: 1, 
        batchSize 
      }, this.handler);
      
      if (workerId) {
        this.workerIds.push(workerId);
        this.currentConcurrency++;
      }
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
    for (const id of this.workerIds) {
      await boss.offWork(this.options.queueName, { id: id });
    }
    this.workerIds = [];
    this.currentConcurrency = 0;
    await this.updateGlobalCount();
    logger.info(`[DynamicScaler] Stopped all workers for ${this.options.queueName}.`);
  }

  /**
   * Periodic check of queue size and adjustment of worker count.
   */
  private async checkAndScale() {
    const { queueName, max, min, scaleUpThreshold } = this.options;
    
    try {
      // getQueue returns current status including counts
      const queueStats = await boss.getQueue(queueName);
      const queueSize = queueStats?.queuedCount || 0;
      
      // Calculate target concurrency: 
      // If we have 50 jobs and scaleUpThreshold is 10, we want 5 workers.
      // We always stay within [min, max].
      let targetConcurrency = Math.ceil(queueSize / scaleUpThreshold);
      targetConcurrency = Math.max(min, Math.min(max, targetConcurrency));

      if (targetConcurrency > this.currentConcurrency) {
        const toAdd = targetConcurrency - this.currentConcurrency;
        logger.info(`[DynamicScaler] Scaling UP ${queueName}: ${this.currentConcurrency} -> ${targetConcurrency} (Queue: ${queueSize})`);
        
        for (let i = 0; i < toAdd; i++) {
          const workerId = await boss.work(queueName, { 
            localConcurrency: 1, 
            batchSize: this.options.batchSize || 1 
          }, this.handler);
          
          if (workerId) {
            this.workerIds.push(workerId);
            this.currentConcurrency++;
          }
        }
        await this.updateGlobalCount();
      } else if (targetConcurrency < this.currentConcurrency && this.currentConcurrency > min) {
        const toRemove = this.currentConcurrency - targetConcurrency;
        logger.info(`[DynamicScaler] Scaling DOWN ${queueName}: ${this.currentConcurrency} -> ${targetConcurrency} (Queue: ${queueSize})`);
        
        for (let i = 0; i < toRemove; i++) {
          const id = this.workerIds.pop();
          if (id) {
            await boss.offWork(this.options.queueName, { id: id });
            this.currentConcurrency--;
          }
        }
        await this.updateGlobalCount();
      }
    } catch (err) {
      logger.error(`[DynamicScaler] Error scaling ${queueName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
