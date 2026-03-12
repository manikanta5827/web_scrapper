if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is missing');
  process.exit(1);
}

export const config = {
  // Database connection string
  databaseUrl: (process.env.DATABASE_URL as string).replace(/\\\$/g, '$'),

  // Dedicated Queue Database (Project B)
  queueDatabaseUrl: (process.env.QUEUE_DATABASE_URL || process.env.DATABASE_URL) as string,

  // Identity string for the scraper
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',

  // Timeout for HTTP requests (30 seconds)
  timeout: 30000,

  // Sitemap worker scaling parameters
  sitemapConcurrency: {
    min: 1,
    max: 5,
    scaleUpThreshold: 10,
    scalerCheckIntervalMs: 30000, // How often to scale up/down
    batchSize: 1,
    workerFetchIntervalSeconds: 15, // How often to check for new jobs when idle
  },
  
  // Page worker scaling parameters (Optimized for Batch-Buffered)
  pageConcurrency: {
    min: 1,
    max: 15,
    scaleUpThreshold: 100,
    scalerCheckIntervalMs: 20000,   // How often to scale up/down
    batchSize: 100,
    workerFetchIntervalSeconds: 10, // How often to check for new jobs when idle
  },

  // Max retry attempts for failed jobs
  retryLimit: 3,

  // Delay between retries in seconds
  retryDelay: 30,

  // Max characters to extract per page
  maxContentLength: 100000,

  // Number of items to process in a single DB batch
  batchSize: 500,

  // Runtime environment (development/production)
  env: process.env.NODE_ENV || 'development',

  // Log output filename
  logFile: 'logs/app.log',
  
  // S3 storage configuration
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.AWS_BUCKET_NAME || 'web-scraper-raw-html',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },

  // Database connection pool settings (Optimized for Single-Process 512MB RAM)
  dbMaxConnections: 10, 
  bossMaxConnections: 15, 
  dbConnectionTimeout: 60000,
  dbIdleTimeout: 30000,
} as const;
