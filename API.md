# API Reference

Direct interaction with the scraping system.

### Base URL: `http://localhost:3003`

---

### POST `/scrape`
Submit a sitemap. Returns `rootId` for status tracking.

- **Request:**
  ```json
  { "url": "https://example.com/sitemap.xml" }
  ```
- **Response (202):**
  ```json
  { "message": "Accepted", "id": 1, "rootId": 1 }
  ```

---

### Tracking Status (CLI Tool)
The system uses `rootId` to group all related sitemaps and URLs.

- **Run:** `bun run db:status <rootId>`

- **Output Example:**
  | status | count |
  |--------|-------|
  | done   | 450   |
  | queued | 20    |
  | failed | 5     |
  Total URLs: 475
