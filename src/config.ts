if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is missing');
  process.exit(1);
}

export const config = {
  databaseUrl: process.env.DATABASE_URL as string,
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',
  timeout: 10000,
  concurrency: 3,
  retryLimit: 3,
  retryDelay: 5,
  requestDelay: 3000,
  maxContentLength: 50000,
  maxSitemapDepth: 3,
  batchSize: 100,
} as const;
