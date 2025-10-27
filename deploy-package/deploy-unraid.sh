#!/bin/bash
# Quick deployment script for Unraid server
# Run this after extracting the package on Unraid

echo "=========================================="
echo "   Logging Server - Unraid Deployment"
echo "=========================================="
echo ""

# Set permissions
echo "📂 Setting permissions..."
chmod -R 755 .
chown -R 1001:1001 data logs

# Build and start
echo ""
echo "🏗️  Building Docker image..."
docker-compose build

echo ""
echo "🚀 Starting container..."
docker-compose up -d

echo ""
echo "⏳ Waiting for container to start..."
sleep 5

# Check health
echo ""
echo "🔍 Checking health..."
if curl -f http://localhost:10180/health 2>/dev/null; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🌐 Access your logging server at:"
    echo "   http://192.168.222.3:10180"
    echo ""
    echo "📊 View logs:"
    echo "   docker logs -f dsc-universal-logger"
else
    echo ""
    echo "⚠️  Container started but health check failed"
    echo "Check logs: docker logs dsc-universal-logger"
fi
