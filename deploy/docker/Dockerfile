# ComfyUI-MCP Server Dockerfile
# Multi-stage build for production deployment (Monorepo)
# Build context should be the monorepo root directory

# Stage 1: Dependencies stage
FROM node:22-alpine AS dependencies

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Set working directory
WORKDIR /app

# Copy package files from monorepo root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Install all dependencies (including dev dependencies for build)
# This layer will be cached if package.json files don't change
RUN pnpm install --frozen-lockfile

# Stage 2: Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Set working directory
WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=dependencies /app/packages/server/node_modules ./packages/server/node_modules

# Copy package files and source code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/src ./packages/shared/src
COPY packages/server/src ./packages/server/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/server/tsconfig.json ./packages/server/
COPY tsconfig.json ./
COPY config*.json ./

# Build shared package first, then server
RUN set -x && \
    pnpm --filter @comfyui-mcp/shared build && \
    pnpm --filter @comfyui-mcp/server build && \
    echo "✅ Build completed successfully"

# Stage 3: Production stage
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S comfyui && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G comfyui -g comfyui comfyui

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=comfyui:comfyui package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=comfyui:comfyui packages/shared/package.json ./packages/shared/
COPY --chown=comfyui:comfyui packages/server/package.json ./packages/server/

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy compiled JavaScript from builder stage
COPY --from=builder --chown=comfyui:comfyui /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=comfyui:comfyui /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=comfyui:comfyui /app/config*.json ./

# Create logs directory with proper permissions
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

# Start the server using compiled JavaScript from workspace package
CMD ["node", "packages/server/dist/index.js"]
