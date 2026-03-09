# Web Scraper System

A modular, high-performance web scraping system built with Bun, TypeScript, and pg-boss.

## Features
- Modular Architecture: Clean separation of concerns (DB, Queue, Scraper, API).
- Sitemap Processing: Automatically crawls root sitemaps and nested indices.
- REST API: POST endpoint to trigger new sitemap scraping.
- Resilient Queue: Powered by pg-boss with automatic retries and concurrency control.
- SQL-first: Type-safe database operations using Drizzle ORM.

## Project Structure
- src/config.ts - Configuration and env validation
- src/db/schema.ts - Database table definitions
- src/db/client.ts - DB connection and migrations
- src/queue/boss.ts - pg-boss initialization
- src/scraper/extractor.ts - HTML text extraction (Cheerio)
- src/scraper/processor.ts - Sitemap XML parsing & enqueuing
- src/scraper/worker.ts - Job queue worker implementation
- src/api/server.ts - Bun.serve API implementation
- src/main.ts - System entry point

## API Usage
### Trigger Scraping
`POST /scrape`
```json
{
  "url": "https://example.com/sitemap.xml"
}
```
**Response (202 Accepted):**
```json
{
  "message": "Accepted",
  "id": 1
}
```

## How to Install and Run
1. Install dependencies: `bun install`
2. Set up environment: `cp .env.example .env` and edit `DATABASE_URL`
3. Generate migrations: `bun run generate`
4. Run the system: `bun run dev`

## Worker and Processing Information
- Workers: Processes up to 3 URLs concurrently.
- Isolation: Each URL is a separate job; one failure does not stop others.
- Delay: A 3-second delay is enforced between requests.
- Sitemap Hash: Skips processing if the sitemap XML has not changed.
