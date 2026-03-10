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

# Make the start script executable during the build phase
RUN chmod +x start.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Expose the API port
EXPOSE 10000

# Use the start script as the entry point
CMD ["./start.sh"]
