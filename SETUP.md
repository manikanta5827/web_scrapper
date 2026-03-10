# Setup & Installation

Follow these steps to set up and run the Web Scraper project on your local machine.

## Prerequisites

- **Bun Runtime:** Install from [bun.sh](https://bun.sh/).
- **PostgreSQL Database:** A local or remote PostgreSQL instance is required.
- **Node.js (Optional):** Used for some configuration scripts if needed.

## Installation

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd web-scrapper
    ```

2.  **Install Dependencies:**
    ```bash
    bun install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and add your PostgreSQL connection string:
    ```bash
    DATABASE_URL=postgres://user:password@localhost:5432/scraper
    ```

## Database Setup

1.  **Generate Migrations:**
    ```bash
    bun run db:generate
    ```

2.  **Push Schema to Database:**
    ```bash
    bun run db:push
    ```

## Running the Project

The project is designed to run in three separate processes:

1.  **Start API Server:** Handles incoming scraping requests.
    ```bash
    bun run dev:server
    ```

2.  **Start Sitemap Worker:** Processes XML sitemaps and nested indices.
    ```bash
    bun run dev:worker:sitemap
    ```

3.  **Start Page Worker:** Scrapes and cleans textual content from HTML pages.
    ```bash
    bun run dev:worker:page
    ```

### Running with PM2 (Optional)
For production environments, you can use PM2 to manage these processes.

## Configuration Options

You can modify behavior by editing `src/utils/config.ts`. Key options include:

- `siteMapQueueConcurrency`: How many sitemaps to process at once (Default: 10).
- `pageQueueConcurrency`: How many pages to scrape at once (Default: 5).
- `userAgent`: The custom user-agent string used for scraping.
- `timeout`: Maximum request timeout in milliseconds.

## Troubleshooting

- **Database Connection Errors:** Ensure `DATABASE_URL` is correctly formatted and that your PostgreSQL instance is running.
- **Too Many Clients:** If you see "too many clients" errors, adjust the `dbMaxConnections` and `bossMaxConnections` in `src/utils/config.ts`.
- **Worker Hangs:** Check logs (`app.log`) for any unhandled exceptions or connection timeouts.
