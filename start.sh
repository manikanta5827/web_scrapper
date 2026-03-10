#!/bin/bash

# Run database migrations/sync
echo "Running database sync..."
bun run db:push

# Start the Sitemap Worker in the background
echo "Starting Sitemap Worker..."
bun run start:worker:sitemap &

# Start the Page Worker in the background
echo "Starting Page Worker..."
bun run start:worker:page &

# Start the API Server in the foreground
# (This must be the last command so the container stays alive)
echo "Starting API Server on port $PORT..."
bun run start:server
