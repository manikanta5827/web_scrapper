# Stage 1: Build & Bundle
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NODE_ENV=production

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Bundle everything into a single file
RUN bun build ./combined-init.ts --outfile ./dist/app.js --target node

# Stage 2: Production Dependencies (needed for drizzle-kit push)
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production

# Stage 3: Final Minimal Runtime
FROM oven/bun:1-slim
WORKDIR /app

# Copy the bundle
COPY --from=builder /app/dist/app.js ./app.js

# Copy essential files for drizzle-kit push in start.sh
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db/schema.ts ./src/db/schema.ts
COPY src/api/*.html ./src/api/
COPY start.sh ./

# Set environment
ENV NODE_ENV=production
ENV PORT=10000

# Permissions
USER root
RUN chmod +x start.sh && mkdir -p logs && chown -R bun:bun /app
USER bun

EXPOSE 10000
CMD ["./start.sh"]
