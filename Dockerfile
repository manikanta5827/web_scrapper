# Use the official Bun image
FROM oven/bun:latest

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy the rest of the application code
COPY . .

# Set environment variables (these will be overridden by Render)
ENV NODE_ENV=production
ENV PORT=3003

# Expose the API port
EXPOSE 3003

# Default start command (can be overridden in render.yaml)
CMD ["bun", "run", "start:server"]
