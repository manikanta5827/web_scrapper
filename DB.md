# Database Schema

The system uses a lean PostgreSQL schema designed for high-performance traversal and archival.

## Tables

### 1. `sitemaps`
Stores the metadata and hierarchy of XML sitemaps.
- **`id`**: Unique identifier.
- **`parentId`**: Tracks nested sitemaps (Index -> Sub-Sitemap).
- **`rootId`**: Points to the original sitemap that started the crawl. Essential for tracking an entire job.
- **`sitemapUrl`**: The unique URL of the XML file.
- **`lastMod`**: The timestamp provided by the XML itself. Used to detect if the sitemap needs re-processing.
- **`totalUrlsFound`**: Count of items found in this specific XML.
- **`status`**: Current state (`active`, `processing`, `failed`).
- **`createdAt` / `updatedAt`**: Standard record lifecycle timestamps.

### 2. `urls`
Stores the extracted content and metadata of individual pages.
- **`sitemapId`**: FK to the immediate parent sitemap.
- **`rootId`**: FK to the original root sitemap. Used for one-query status reports.
- **`url`**: The unique page URL.
- **`lastMod`**: Timestamp from the sitemap entry. Used for **Conditional Re-scraping** (only scrape if newer).
- **`s3Url`**: Link to the raw HTML file archived in S3.
- **`status`**: Current state (`queued`, `scraping`, `done`, `failed`).
- **`rawContent`**: The cleaned, extracted content in **Markdown** format.
- **`lastScrapedAt`**: The actual time the worker successfully finished scraping the page.

## Key Design Decisions

- **Hierarchy via `rootId`**: Instead of expensive recursive joins, every record stores the ID of the "Origin" sitemap. This makes it possible to get a status report for a million-page crawl with a single `WHERE root_id = X` query.
- **LastMod Optimization**: We compare the XML's `lastmod` with our stored `lastMod`. If the XML timestamp is older or missing, we skip the re-scrape, saving bandwidth and compute.
- **Markdown over HTML**: We store clean Markdown in the DB. This reduces storage size by 70-90% compared to raw HTML while remaining perfectly structured for LLMs.
