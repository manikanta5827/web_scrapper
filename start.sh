#!/bin/bash
# Exit on any error
set -e

echo "Starting Scraper Multi-Process Service..."

# 1. Validate DATABASE_URL isn't a placeholder
if [[ "$DATABASE_URL" == *"replace-with-your-supabase-url"* ]]; then
  echo "ERROR: DATABASE_URL is still a placeholder! Please update it in the Render Env Var Group."
  exit 1
fi

# 1. Validate QUEUE_DATABASE_URL isn't a placeholder
if [[ "$QUEUE_DATABASE_URL" == *"replace-with-your-supabase-queue-url"* ]]; then
  echo "ERROR: QUEUE_DATABASE_URL is still a placeholder! Please update it in the Render Env Var Group."
  exit 1
fi

# 2. Run database migrations/sync
echo "Running database sync..."
bun run db:push

# 3. Start the Sitemap Worker in the background
echo "Starting Sitemap Worker..."
bun run start:worker:sitemap &

# 4. Start the Page Worker in the background
echo "Starting Page Worker..."
bun run start:worker:page &

# 5. Start the API Server in the foreground
# (This must be the last command so the container stays alive)
echo "Starting API Server on port $PORT..."
bun run start:server
