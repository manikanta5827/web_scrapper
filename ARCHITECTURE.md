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

## Dynamic Scaling Strategy

The system implements a custom `DynamicScaler` to manage worker lifecycle based on real-time queue pressure. This allows for horizontal scaling within a single process.

### Multi-Registration Loop
Instead of a single worker with high concurrency, the `DynamicScaler` creates multiple independent `pg-boss.work()` registrations (polling loops), each with `localConcurrency: 1`.

- **Scaling Up:** When `Queued Jobs / Scale Threshold > Active Workers`, the scaler initiates new `boss.work()` registrations.
- **Scaling Down:** When pressure drops, the scaler calls `boss.offWork({ id })` on the oldest registrations.
- **Graceful Retirement:** `pg-boss` ensures that `offWork` only stops *fetching* new jobs. If a loop is currently processing a job, it is allowed to complete before the registration is destroyed.

### Coordination via Database
Since workers and the API server run in separate processes, the active worker count is synchronized via the `health_checks` table.
- **Workers:** Update their `concurrency` count in the DB whenever they scale.
- **API Server:** Reads from the `health_checks` table to display live worker status on the dashboard.
