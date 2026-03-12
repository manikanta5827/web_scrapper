#!/bin/bash
set -e

echo "--- STARTING DOCKER CONTAINER ---"

# 1. Fetch SSM Parameters into the current shell
# This provides DATABASE_URL and other secrets for the commands below
if [ -f "fetch-ssm-vars.ts" ]; then
  echo "[1/3] Fetching environment secrets from AWS SSM..."
  eval $(bun run fetch-ssm-vars.ts)
  echo "      SSM secrets loaded."
else
  echo "[SKIP] fetch-ssm-vars.ts not found. Using current env."
fi

# 2. Sync Database Schema
# drizzle-kit push needs DATABASE_URL to be set in the shell
echo "[2/3] Syncing database schema with Drizzle Kit..."
bunx drizzle-kit push || echo "Migration check failed or not needed."

# 3. Start the Unified Service (API + Workers)
echo "[3/3] Launching combined application..."
exec bun run app.js
