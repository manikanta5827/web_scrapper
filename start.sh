#!/bin/bash
# Exit on any error
set -e

echo "Starting Optimized Multi-Service App..."

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

# 2. Run database sync
echo "Running database sync..."
bun run db:push

# 3. Start the combined application in the foreground
echo "Starting Combined API and Workers..."
bun run app.js
