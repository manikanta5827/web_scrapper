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

## Performance Optimizations

### Bulk Database & Queue Operations
To prevent database connection throttling (especially on managed services like Supabase), the system uses bulk operations for sitemap discovery:
- **Bulk Insert:** Instead of individual inserts, discovered sitemaps and URLs are gathered into arrays and inserted in a single `db.insert().values()` call.
- **Bulk Queueing:** Uses `pg-boss.insert()` to queue multiple jobs in a single transaction, reducing the number of round-trips to the database.
- **Reduced Overhead:** This optimization reduces the database connection load from $O(N)$ to $O(1)$ per processed sitemap.

### Parallel I/O & S3 Reliability
The Page Worker is optimized for high-throughput scraping:
- **Parallel Uploads:** Uses `Promise.allSettled` to upload raw HTML and cleaned Markdown to S3 simultaneously, significantly reducing the "busy" time per worker.
- **Partial Success Handling:** If one upload fails (e.g., Markdown extraction error), the system still saves the successful upload URL (e.g., raw HTML) to the database.
- **Exponential Backoff Retries:** All S3 operations are wrapped in a retry mechanism with exponential backoff (up to 3 attempts) to handle transient network issues or S3 API limits.

### Connection Management
- **Stateless Workers:** Workers do not hold persistent connections longer than necessary.
- **Rate Limiting via Concurrency:** Instead of complex rate-limiting logic, the system relies on the `DynamicScaler` and `localConcurrency` to control the number of simultaneous outbound requests.

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
