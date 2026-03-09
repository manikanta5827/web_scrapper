if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is missing');
  process.exit(1);
}

export const config = {
  // 1. Connection string for your local or remote PostgreSQL database
  databaseUrl: process.env.DATABASE_URL as string,

  // 2. The identity string sent to websites so they know who is scraping them
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',

  // 3. Maximum time (in milliseconds) to wait for a website to respond (10 seconds)
  timeout: 10000,

  // 4. How many URLs to scrape at the exact same time within ONE worker process
  concurrency: 10,

  // 5. How many times to try scraping a URL again if it fails (network error, timeout, etc.)
  retryLimit: 1,

  // 6. How many seconds to wait before trying a failed job again
  retryDelay: 5,

  // 7. Politeness delay: How many milliseconds to wait BEFORE making each request (3 seconds)
  requestDelay: 3000,

  // 8. The maximum number of text characters to save in the database per page (to save space)
  maxContentLength: 50000,

  // 9. When reading a sitemap, how many URLs to process in one internal batch for DB efficiency
  batchSize: 100,

  // 10. The environment mode: 'development' shows more logs, 'production' saves them to a file
  env: process.env.NODE_ENV || 'development',

  // 11. The filename where all system logs are stored
  logFile: 'app.log',
  
  // Connection Pool Settings
  // Limiting each pool to 5-10 connections prevents "too many clients" errors
  dbMaxConnections: 10,
  bossMaxConnections: 10,
} as const;
