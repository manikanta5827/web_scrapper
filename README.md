# Distributed Web Scraper

High-performance, async sitemap and page content scraper built with Bun, TypeScript, and PostgreSQL.

### Core Features
- **Async & Non-Blocking:** Fully event-driven using `pg-boss` (Postgres) as the queue engine.
- **S3 Archival:** Automatically uploads raw HTML to S3 for permanent storage and auditing.
- **Markdown Conversion:** Transforms complex HTML into clean, structured Markdown, preserving document hierarchy for better LLM ingestion.
- **Smart Re-Scraping:** Uses `lastmod` tracking to only re-process updated pages, saving bandwidth.
- **Zero Duplicates:** Strict `ON CONFLICT` logic ensures no redundant sitemap or URL records.
- **Hierarchical Tracking:** Uses `root_id` to instantly track progress of any top-level sitemap request.
- **Dual-Queue System:** Separate queues for Sitemaps and Pages to manage concurrency independently.
- **Recursion Safety:** Configurable `depth` limit to prevent infinite sitemap loops.
- **Status CLI:** Built-in tool to track URL discovery and scraping progress in real-time.

### Documentation
- [Architecture](ARCHITECTURE.md) | [Setup](SETUP.md) | [Database](DB.md) | [API](API.md)
