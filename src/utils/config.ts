import { logger } from './logger';

// Standard Environment Variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || '10000';
const DATABASE_URL = process.env.DATABASE_URL || '';
const QUEUE_DATABASE_URL = process.env.QUEUE_DATABASE_URL || DATABASE_URL;

// AWS S3 Configuration
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || '';

logger.info(`[Config] Initializing for environment: ${NODE_ENV}`);

// Helper to parse numeric env vars with defaults
const parseNum = (val: string | undefined, fallback: number): number => {
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

// Helper to parse boolean env vars
const parseBool = (val: string | undefined, fallback: boolean): boolean => {
  if (val === undefined) return fallback;
  return val.toLowerCase() === 'true';
};

export const config = {
  env: NODE_ENV,
  port: PORT,
  databaseUrl: DATABASE_URL,
  queueDatabaseUrl: QUEUE_DATABASE_URL,
  
  s3: {
    region: AWS_REGION,
    bucket: AWS_BUCKET_NAME, 
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  },

  // General Settings
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (compatible; WebScraper/1.0)',
  timeout: parseNum(process.env.HTTP_REQUEST_TIMEOUT_MS, 30000),
  enableS3Upload: parseBool(process.env.ENABLE_S3_UPLOAD, NODE_ENV === 'production'), 
  
  sitemapConcurrency: {
    min: parseNum(process.env.SITEMAP_MIN_WORKERS, 1),
    max: parseNum(process.env.SITEMAP_MAX_WORKERS, 5),
    scaleUpThreshold: parseNum(process.env.SITEMAP_AUTOSCALE_THRESHOLD, 10),
    scalerCheckIntervalMs: parseNum(process.env.SITEMAP_AUTOSCALE_INTERVAL_MS, 30000),
    batchSize: parseNum(process.env.SITEMAP_JOB_BATCH_SIZE, 1),
    workerFetchIntervalSeconds: parseNum(process.env.SITEMAP_WORKER_POLL_INTERVAL_SECONDS, 15),
  },
  
  pageConcurrency: {
    min: parseNum(process.env.PAGE_MIN_WORKERS, 1),
    max: parseNum(process.env.PAGE_MAX_WORKERS, 15),
    scaleUpThreshold: parseNum(process.env.PAGE_AUTOSCALE_THRESHOLD, 50),
    scalerCheckIntervalMs: parseNum(process.env.PAGE_AUTOSCALE_INTERVAL_MS, 20000),
    batchSize: parseNum(process.env.PAGE_JOB_BATCH_SIZE, 25),
    workerFetchIntervalSeconds: parseNum(process.env.PAGE_WORKER_POLL_INTERVAL_SECONDS, 10),
    internalLimit: parseNum(process.env.PAGE_CONCURRENT_REQUESTS_LIMIT, 5),
    batchTimeoutMs: parseNum(process.env.PAGE_WORKER_TIMEOUT_MS, 8 * 60 * 1000),
    jobExpireSeconds: parseNum(process.env.PAGE_JOB_EXPIRATION_SECONDS, 10 * 60),
  },

  ghostBuster: {
    stallThresholdMs: parseNum(process.env.STALLED_URL_THRESHOLD_MS, 10 * 60 * 1000),
    checkIntervalMs: parseNum(process.env.STALLED_URL_CLEANUP_INTERVAL_MS, 5 * 60 * 1000),
  },

  retryLimit: parseNum(process.env.RETRY_LIMIT, 3),
  retryDelay: parseNum(process.env.RETRY_DELAY, 30),
  maxContentLength: parseNum(process.env.MAX_HTTP_CONTENT_LENGTH, 100000),
  batchSize: parseNum(process.env.DATABASE_BATCH_SIZE, 500),
  dbMaxConnections: parseNum(process.env.DB_MAX_CONNECTIONS, 10),
  bossMaxConnections: parseNum(process.env.BOSS_MAX_CONNECTIONS, 15),
  dbConnectionTimeout: parseNum(process.env.DB_CONNECTION_TIMEOUT_MS, 60000),
  dbIdleTimeout: parseNum(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  logFile: process.env.LOG_FILE || 'logs/app.log',
};
