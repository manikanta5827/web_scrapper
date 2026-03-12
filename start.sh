#!/bin/bash
set -e

echo "--- STARTING DOCKER CONTAINER ---"

# 1. Sync Database Schema
# drizzle-kit push needs DATABASE_URL to be set in the shell
echo "[1/2] Syncing database schema with Drizzle Kit..."
bunx drizzle-kit push || echo "Migration check failed or not needed."

# 2. Start the Unified Service (API + Workers)
echo "[2/2] Launching combined application..."
exec bun ./app.js
