# Stage 1: Build & Bundle
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy configuration and dependency files
COPY package.json bun.lock ./
RUN bun install

# Copy source code
COPY . .

# Bundle the API and Worker entry points
# This inlines most dependencies, drastically reducing node_modules size
RUN bun build ./server-init.ts --outdir ./dist --target node
RUN bun build ./worker-init.ts --outdir ./dist --target node

# Stage 2: Production Dependencies (only the ones that can't be bundled easily)
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# We keep drizzle-kit for the 'db:push' command in start.sh
RUN bun install --production

# Stage 3: Final Minimal Runtime
FROM oven/bun:1-slim
WORKDIR /app

# Copy bundles
COPY --from=builder /app/dist ./dist

# Copy production node_modules (required for drizzle-kit and native drivers)
COPY --from=deps /app/node_modules ./node_modules

# Copy only essential metadata and config
COPY package.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db/schema.ts ./src/db/schema.ts
COPY start.sh ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Make the start script executable and prepare logs directory
USER root
RUN mkdir -p logs && chown -R bun:bun /app && chmod +x start.sh

# Security: Run as non-root user
USER bun

EXPOSE 10000
CMD ["./start.sh"]
