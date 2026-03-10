if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is missing');
  process.exit(1);
}

export const config = {
  // 1. Connection string for your local or remote PostgreSQL database
  databaseUrl: (process.env.DATABASE_URL as string).replace(/\\\$/g, '$'),

  // 2. The identity string sent to websites so they know who is scraping them
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',

  // 3. Maximum time (in milliseconds) to wait for a website to respond (30 seconds)
  timeout: 30000,

  // 4. Concurrency settings for the unified worker engine
  workerConcurrency: {
    min: 1,
    max: 150,
    scaleUpThreshold: 5, // total jobs per worker to trigger scale up
    pollInterval: 5000,    // check every 5 seconds for fast response
  },

  // 5. How many times to try scraping a URL again if it fails (network error, timeout, etc.)
  retryLimit: 1,

  // 6. How many seconds to wait before trying a failed job again
  retryDelay: 5,

  // 8. The maximum number of text characters to save in the database per page (to save space)
  maxContentLength: 50000,

  // 9. When reading a sitemap, how many URLs to process in one internal batch for DB efficiency
  batchSize: 100,

  // 10. The environment mode: 'development' shows more logs, 'production' saves them to a file
  env: process.env.NODE_ENV || 'development',

  // 11. The filename where all system logs are stored
  logFile: 'app.log',
  
  // 12. S3 Storage for raw HTML
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.AWS_BUCKET_NAME || 'web-scraper-raw-html',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },

  // Connection Pool Settings
  // Limiting each pool to 5-10 connections prevents "too many clients" errors
  dbMaxConnections: 20,
  bossMaxConnections: 20,
} as const;
