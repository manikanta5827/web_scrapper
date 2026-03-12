# Setup

Distributed Web Scraper requires Bun and PostgreSQL.

## Prerequisites
- **Bun:** [bun.sh](https://bun.sh/)
- **PostgreSQL:** Running instance.

## Installation
1. `bun install`
2. Create `.env`: `DATABASE_URL=postgres://user:pass@localhost:5432/db`

## Database Init
1. `bun run db:generate`
2. `bun run db:push`

## Running
Run in 3 separate terminals:
1. `bun run dev:server` (API)
2. `bun run dev:worker:sitemap` (Sitemap traversal)
3. `bun run dev:worker:page` (Content scraping)

## Utilities
- **Check Status:** `bun run db:status <rootId>`
- **Clear Everything:** `bun run system:clear`
