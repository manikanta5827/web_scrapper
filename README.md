# Distributed Web Scraper

High-performance, async sitemap and page content scraper built with Bun, TypeScript, and PostgreSQL.

### Core Features

#### Async & Non-Blocking Architecture
The system is fully event-driven, leveraging `pg-boss` to use PostgreSQL as a high-performance job queue. This ensures that the API remains responsive while workers handle heavy tasks in the background without blocking the main event loop.

#### Dynamic Worker Scaling
The system features an intelligent auto-scaling mechanism that adjusts the number of active workers based on current queue pressure. It automatically "hires" or "retires" worker loops, scaling from a single worker to 50+ parallel scrapes instantly, then shrinking back down gracefully once the queue is empty.

#### S3 Archival & Data Integrity
Every page scraped is automatically archived in its raw HTML format to AWS S3. This provides a permanent audit trail and ensures that the original source data is preserved for future re-processing or auditing, even if your extraction logic changes.

#### Markdown Extraction for LLMs
The system converts complex HTML into clean, structured Markdown. By stripping out scripts, styles, and navigation boilerplate, it produces high-quality, hierarchy-preserving text that is perfectly optimized for LLM ingestion and RAG applications.

#### Smart Re-Scraping (Delta Updates)
Bandwidth and time are saved by utilizing `lastmod` tracking from sitemaps. The scraper intelligently identifies which pages have been modified since the last run and only re-processes updated content, making subsequent crawls significantly faster.

#### Zero-Duplicate Engine
Strict database-level `ON CONFLICT` logic prevents the creation of redundant records. Whether it's a nested sitemap index or a specific page URL, the system maintains a single source of truth and prevents duplicate scraping efforts.

#### Hierarchical Progress Tracking
Every crawl is assigned a unique `root_id`. This allows you to instantly track the progress of an entire top-level sitemap request—from initial discovery to final archival—across thousands of nested links in real-time.

#### Dual-Queue Concurrency Control
Independent queues for Sitemaps and Pages allow you to manage processing speeds separately. You can traverse sitemaps cautiously to avoid triggering security blocks while scaling page scraping to maximum velocity.

#### Recursion & Depth Safety
To prevent "infinite loops" and accidental "crawling the entire internet," the system includes a configurable depth limit (default: 5). This ensures the sitemap worker stays focused on the intended domain and avoids circular link traps.

#### Real-time Monitoring CLI
Includes a built-in status tool that provides a live snapshot of your crawl's health. Monitor discovery counts, scraping success rates, and queue pressure directly from your terminal with a single command.

### Dynamic Worker Scaling

The system features an intelligent auto-scaling mechanism that adjusts the number of active workers based on current queue pressure. This ensures maximum throughput during large crawls while saving resources during idle periods.

#### Configuration (`src/utils/config.ts`)

```typescript
pageQueueConcurrency: {
  min: 5,                // Minimum active workers (baseline)
  max: 50,               // Maximum workers (CPU/RAM ceiling)
  scaleUpThreshold: 100, // Trigger: Add 1 worker for every 100 queued URLs
  pollInterval: 10000    // Check queue pressure every 10 seconds
}
```

#### How it works:
1. **Pressure Detection:** Every 10 seconds, the system calculates `Target = Queued Jobs / Threshold`. If you have 2,000 URLs waiting and a threshold of 100, the system targets **20 workers**.
2. **Horizontal Scaling:** Instead of one large worker, it starts 20 independent "worker loops" in the same process.
3. **Graceful Exit:** When scaling down, workers are not killed instantly. They finish their current job before retiring, ensuring zero data loss.
4. **Visibility:** Live worker counts are displayed on both the main and detailed dashboards.

### Visual Overview

#### 1. API Server Initialization
![API Server Start](screenshots/api_server_start_ss.png)
*The API server initializes the database connection and the pg-boss queue.*

#### 2. Triggering a Scrape (Postman)
![Postman Request](screenshots/postman_ss.png)
*Submit any sitemap URL to the `/scrape` endpoint to start the distributed process.*

#### 3. Sitemap Worker in Action
![Sitemap Worker](screenshots/sitemap_worker_ss.png)
*The sitemap worker recursively traverses nested indices and enqueues discovery jobs.*

#### 4. Page Scraper Worker
![Page Worker](screenshots/page_worker_ss.png)
*Individual page workers download, archive to S3, and convert HTML to clean Markdown.*

#### 5. S3 Archival Storage
![AWS S3 Archival](screenshots/aws_s3_page_html_ss.png)
*Raw HTML is stored in S3 for permanent auditing and data integrity.*

#### 6. Database Status (Sitemaps)
![Sitemaps DB](screenshots/sitemaps_db_ss.png)
*Tracking sitemap processing status and total discovery counts.*

#### 7. Database Status (URLs)
![URLs DB](screenshots/urls_db_ss.png)
*The final state of scraped URLs including S3 links and content status.*

#### 8. Progress Tracking CLI
![URL Progress Count](screenshots/db_urls_count_ss.png)
*Instantly monitor the progress of a specific root sitemap discovery.*

### Documentation
- [Architecture](ARCHITECTURE.md) | [Setup](SETUP.md) | [Database](DB.md) | [API](API.md)
