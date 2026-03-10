# API Reference

Direct interaction with the scraping system.

### Base URL: `http://localhost:3003` (Local) or `https://your-app.onrender.com` (Production)

---

### POST `/scrape`
Submit a sitemap to begin the recursive scraping process.

- **Request:**
  ```json
  { "url": "https://example.com/sitemap.xml" }
  ```
- **Response (202):**
  ```json
  { 
    "message": "Accepted", 
    "id": 1, 
    "rootId": 1 
  }
  ```
  *Note: Use the `rootId` to track the progress of the entire crawl.*

---

### GET `/status/:rootId`
Get a real-time progress report for a specific crawl by its `rootId`.

- **Endpoint:** `/status/1`
- **Response (200):**
  ```json
  {
    "rootId": 1,
    "total": 475,
    "breakdown": [
      { "status": "completed", "count": 450 },
      { "status": "active", "count": 20 },
      { "status": "failed", "count": 5 }
    ]
  }
  ```

---

### Data Storage
- **Database:** PostgreSQL (Metadata, Sitemap hierarchy, URL status)
- **Files:** AWS S3 (Raw HTML stored as `.html` files)
- **Queue:** pg-boss (Background job processing)
