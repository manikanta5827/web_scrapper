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

  // 4. Concurrency settings for specialized workers
  sitemapConcurrency: {
    min: 1,
    max: 10,
    scaleUpThreshold: 5,
    pollInterval: 10000,
  },
  pageConcurrency: {
    min: 1,
    max: 50,
    scaleUpThreshold: 20,
    pollInterval: 5000,
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

  // Connection Pool Settings (Optimized for Supabase Free Tier)
  // Supabase Pooler (Port 6543) allows 200 client connections.
  // The backend database allows 20 connections.
  // We have 3 processes (Server, Sitemap Worker, Page Worker).
  // Total client connections = 3 * (5 + 10) = 45 (Safe)
  dbMaxConnections: 5,
  bossMaxConnections: 10,
  dbConnectionTimeout: 60000, // 60 seconds
  dbIdleTimeout: 30000,       // 30 seconds
} as const;
