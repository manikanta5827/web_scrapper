# Architecture

Distributed, event-driven system using Bun, Drizzle ORM, and pg-boss.

## Flow
1. **API Server:** Receives `/scrape` request, creates `root_id`.
2. **Sitemap Worker:** Recursively fetches sitemaps (depth limit: 5).
3. **Page Worker:** Scrapes HTML, strips non-text elements (scripts/styles).
4. **Database:** Postgres stores sitemaps, extracted text, and the job queue.

## Folder Map
- `src/api/`: POST endpoint for scraping.
- `src/db/`: Schema & client (Drizzle).
- `src/queue/`: `pg-boss` (Postgres-backed queue).
- `src/scraper/`: Extraction logic & workers.
- `src/utils/`: Logger, config, & status CLI.

## Key Design Specs
- **Postgres as Queue:** No Redis required. Single DB for storage and orchestration.
- **Async & Retryable:** `pg-boss` handles exponential backoff and job retries.
- **rootId Pattern:** Every discovered URL inherits the `rootId` from its top-level sitemap.
- **Duplicate Prevention:** Upsert logic (`onConflictDoUpdate`) prevents re-inserting URLs.
- **Depth Protection:** Prevents infinite circular sitemaps from crashing the system.
