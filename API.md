# API Reference

The Web Scraper provides a simple REST-like API to trigger and monitor scraping jobs.

## Base URL
The default API server runs on: `http://localhost:3003`

## Authentication
Currently, no authentication is required. For production use, consider adding an API key middleware.

---

### POST `/scrape`
Submit a new sitemap URL to the scraping engine.

#### Request Body
```json
{
  "url": "https://example.com/sitemap.xml"
}
```

#### Response (Success - 202 Accepted)
```json
{
  "message": "Accepted",
  "id": 1,
  "rootId": 1
}
```
- `id`: The unique ID of the newly created sitemap record.
- `rootId`: The root ID used to track all sub-sitemaps and URLs related to this request.

#### Errors
- **400 Bad Request:** Missing `url` in the request body.
- **500 Internal Server Error:** Database or queue initialization failure.

---

### GET Tracking (via SQL or Helper Script)
While there isn't a direct GET endpoint for status yet, you can monitor the progress using the included CLI script.

#### Command
```bash
bun run db:status <rootId>
```

#### Output Example
```text
Status Report for Root Sitemap ID: 1
┌─────────┬────────┬───────┐
│ (index) │ status │ count │
├─────────┼────────┼───────┤
│    0    │ 'done' │  150  │
│    1    │'queued'│  50   │
└─────────┴────────┴───────┘
Total URLs Found: 200
```

## Error Codes

| Code | Meaning |
|------|---------|
| 202  | **Accepted:** The job has been successfully enqueued. |
| 400  | **Bad Request:** Missing or invalid sitemap URL. |
| 404  | **Not Found:** The endpoint does not exist. |
| 500  | **Server Error:** Internal failure (e.g., database connection). |
