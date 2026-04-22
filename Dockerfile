# SLAVI Trading Bot - Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose dashboard port
EXPOSE 3333

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV DASHBOARD_PORT=3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3333/ || exit 1

# Run the bot
CMD ["npx", "ts-node", "src/ProductionGridBot.ts"]
