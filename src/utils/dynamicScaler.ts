import { boss } from '../queue/boss';
import { logger } from './logger';

/**
 * Manages horizontal scaling of workers by adding/removing registrations
 * based on queue pressure.
 */
export class DynamicScaler {
  private activeWorkers: string[] = [];
  private isScaling = false;

  constructor(
    private queueName: string,
    private workerFn: (jobs: any[]) => Promise<void>,
    private config: {
      min: number;
      max: number;
      scaleUpThreshold: number;
      batchSize: number;
      workerFetchIntervalSeconds: number;
      scalerCheckIntervalMs: number;
    }
  ) {}

  /**
   * Adds a new worker registration to pg-boss.
   * Each registration acts as an independent "fetcher" loop.
   */
  private async addWorker() {
    if (this.activeWorkers.length >= this.config.max) return;

    try {
      const workerId = await boss.work(this.queueName, {
        batchSize: this.config.batchSize,
        pollingIntervalSeconds: this.config.workerFetchIntervalSeconds
      }, this.workerFn);

      if (workerId) {
        this.activeWorkers.push(workerId);
        logger.info(`[Scaler] ${this.queueName} scaled UP: ${this.activeWorkers.length} workers.`);
      }
    } catch (err) {
      logger.error(`[Scaler] ${this.queueName} failed to add worker: ${err}`);
    }
  }

  /**
   * Removes the most recently added worker registration.
   */
  private async removeWorker() {
    if (this.activeWorkers.length <= this.config.min) return;
    const workerId = this.activeWorkers.pop();

    try {
      if (workerId) {
        await boss.offWork(this.queueName, { id: workerId });
        logger.info(`[Scaler] ${this.queueName} scaled DOWN: ${this.activeWorkers.length} workers.`);
      }
    } catch (err) {
      logger.error(`[Scaler] ${this.queueName} failed to remove worker: ${err}`);
    }
  }

  /**
   * Starts the initial workers and the monitoring loop.
   */
  public async init() {
    logger.info(`[Scaler] Initializing ${this.queueName} with ${this.config.min} workers.`);
    for (let i = 0; i < this.config.min; i++) {
      await this.addWorker();
    }

    // --- SCALING MONITORING LOOP ---
    // Runs periodically to adjust worker power based on current queue depth.
    setInterval(async () => {
      // 1. Prevent overlapping scaling operations
      if (this.isScaling) return;
      this.isScaling = true;

      try {
        // 2. Fetch current Queue Pressure
        const stats = await boss.getQueueStats(this.queueName);
        const waitingJobs = stats.queuedCount;
        const currentWorkerCount = this.activeWorkers.length;

        // 3. SCALE UP LOGIC:
        // If waiting jobs exceed threshold, calculate how many workers are needed.
        if (waitingJobs > this.config.scaleUpThreshold && currentWorkerCount < this.config.max) {
          const targetCount = Math.min(
            this.config.max,
            Math.ceil(waitingJobs / this.config.scaleUpThreshold)
          );
          
          const toAdd = targetCount - currentWorkerCount;
          if (toAdd > 0) {
            logger.info(`[Scaler] ${this.queueName} pressure high (${waitingJobs} jobs). Scaling to ${targetCount} workers.`);
            for (let i = 0; i < toAdd; i++) {
              await this.addWorker();
            }
          }
        } 
        // 4. SCALE DOWN LOGIC:
        // If queue is empty, reduce back to minimum workers to save resources.
        else if (waitingJobs === 0 && currentWorkerCount > this.config.min) {
          logger.info(`[Scaler] ${this.queueName} idle. Scaling down to ${this.config.min} workers.`);
          while (this.activeWorkers.length > this.config.min) {
            await this.removeWorker();
          }
        }
      } catch (err) {
        logger.error(`[Scaler] ${this.queueName} scaling monitor failed: ${err}`);
      } finally {
        this.isScaling = false;
      }
    }, this.config.scalerCheckIntervalMs);
  }
}
