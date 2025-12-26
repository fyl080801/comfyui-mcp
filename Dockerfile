# ComfyUI-MCP Server Dockerfile
# Multi-stage build for production deployment

# Stage 1: Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and config
COPY src ./src
COPY config*.json ./

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production stage
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S comfyui && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G comfyui -g comfyui comfyui

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=comfyui:comfyui package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder --chown=comfyui:comfyui /app/dist ./dist
COPY --from=builder --chown=comfyui:comfyui /app/config*.json ./

# Create logs directory with proper permissions before switching user
RUN mkdir -p /app/logs && \
    chown -R comfyui:comfyui /app/logs

# Switch to non-root user
USER comfyui

# Expose ports
EXPOSE 8080 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/mcp', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment defaults
ENV NODE_ENV=production \
    PORT=8080 \
    EXPRESS_PORT=3000

# Run with dumb-init
ENTRYPOINT ["dumb-init", "--"]

# Start the server using compiled JavaScript
CMD ["node", "dist/index.js"]
