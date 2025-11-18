# Enterprise Logging Platform - MODULAR ARCHITECTURE
# Multi-Source Infrastructure Monitoring
# Docker Configuration for Unraid Server with Enterprise Features

FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ sqlite

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies for build (use npm install since package-lock may be out of sync)
RUN npm install && npm cache clean --force

# Copy MODULAR application files
COPY server.js ./
COPY database-access-layer.js ./
COPY dual-database-manager.js ./
COPY log-parser-engine.js ./
COPY encryption-system.js ./
COPY universal-sqlite-adapter.js ./
COPY seed-logs.sql ./
COPY start.js ./

# Copy modular directories
COPY routes/ ./routes/
COPY api/ ./api/
COPY engines/ ./engines/
COPY managers/ ./managers/
COPY middleware/ ./middleware/
COPY configs/ ./configs/
COPY scripts/ ./scripts/
COPY public/ ./public/
COPY archive/ ./archive/
COPY utils/ ./utils/

# Remove development files
RUN rm -rf .git .gitignore README.md *.md 2>/dev/null || true

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies including PM2
RUN apk add --no-cache sqlite tzdata tini && \
    npm install -g pm2@latest

# Set timezone to Mountain Time
ENV TZ=America/Denver
ENV NODE_ENV=production

# Create app user for security
RUN addgroup -g 1001 -S logger && \
    adduser -S logger -u 1001 -G logger

# Set working directory
WORKDIR /app

# Copy application from builder
COPY --from=builder --chown=logger:logger /app .

# Create data directories with proper permissions
RUN mkdir -p data/databases data/backups data/sessions logs && \
    chown -R logger:logger /app && \
    chmod -R 755 /app

# Switch to non-root user for security
USER logger

# Expose port 10180 for Unraid configuration
EXPOSE 10180

# Health check for enterprise monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:10180/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start with PM2 for automatic restarts and process management
CMD ["pm2-runtime", "start", "server.js", "--name", "logging-server"]

# Labels for better container management
LABEL maintainer="Tom Nelson" \
      description="Enterprise Logging Platform - Multi-Source Infrastructure Monitoring (MODULAR)" \
      version="2.1.0-stable-enhanced" \
      org.opencontainers.image.title="Enterprise Logging Platform" \
      org.opencontainers.image.description="Universal infrastructure monitoring with enterprise authentication" \
      org.opencontainers.image.version="2.1.0"
