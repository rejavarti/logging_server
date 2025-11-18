#!/bin/bash
# ============================================================
# Rejavarti's Logging Server - Unraid Quick Install
# ============================================================
# This script creates directories and starts the container
# ============================================================

echo "=========================================="
echo "  Rejavarti's Logging Server Installer"
echo "=========================================="
echo ""

# Configuration
CONTAINER_NAME="rejavarti-logging-server"
IMAGE="rejavarti/rejavartis_logging_server:latest"
PORT="10180"
DATA_PATH="/mnt/user/appdata/logging-server/data"
LOGS_PATH="/mnt/user/appdata/logging-server/logs"
TZ="America/Denver"

# Prompt for password
echo "📝 Configuration:"
read -p "Enter admin password (default: admin): " AUTH_USERNAME
AUTH_USERNAME=${AUTH_USERNAME:-admin}

read -sp "Enter secure password: " AUTH_PASSWORD
echo ""

if [ -z "$AUTH_PASSWORD" ]; then
    echo "❌ Password is required!"
    exit 1
fi

# Create directories
echo ""
echo "📁 Creating directories..."
mkdir -p "$DATA_PATH"/{databases,backups,sessions}
mkdir -p "$LOGS_PATH"
echo "✓ Created: $DATA_PATH"
echo "✓ Created: $LOGS_PATH"

# Set permissions
echo ""
echo "🔐 Setting permissions..."
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 "$DATA_PATH" "$LOGS_PATH" 2>/dev/null || echo "⚠️  Running as root, skipping chown"
echo "✓ Permissions set"

# Pull image
echo ""
echo "🐳 Pulling Docker image..."
docker pull "$IMAGE"

# Stop existing container
echo ""
echo "🛑 Stopping existing container (if any)..."
docker stop "$CONTAINER_NAME" 2>/dev/null
docker rm "$CONTAINER_NAME" 2>/dev/null

# Start container
echo ""
echo "🚀 Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$PORT:10180" \
  -v "$DATA_PATH:/app/data" \
  -v "$LOGS_PATH:/app/logs" \
  -e NODE_ENV=production \
  -e PORT=10180 \
  -e TZ="$TZ" \
  -e AUTH_USERNAME="$AUTH_USERNAME" \
  -e AUTH_PASSWORD="$AUTH_PASSWORD" \
  "$IMAGE"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "  ✅ Installation Complete!"
    echo "=========================================="
    echo ""
    echo "🌐 Access your server at:"
    echo "   http://$(hostname -I | awk '{print $1}'):$PORT"
    echo "   or"
    echo "   http://192.168.222.3:$PORT"
    echo ""
    echo "🔐 Login credentials:"
    echo "   Username: $AUTH_USERNAME"
    echo "   Password: (what you entered)"
    echo ""
    echo "📊 Next steps:"
    echo "   1. Access the web interface"
    echo "   2. Login with credentials above"
    echo "   3. Go to /register to create admin account"
    echo "   4. Configure integrations in /integrations"
    echo ""
    echo "🔧 Manage container:"
    echo "   View logs:    docker logs -f $CONTAINER_NAME"
    echo "   Stop:         docker stop $CONTAINER_NAME"
    echo "   Start:        docker start $CONTAINER_NAME"
    echo "   Restart:      docker restart $CONTAINER_NAME"
    echo ""
else
    echo ""
    echo "❌ Installation failed!"
    echo "Check logs: docker logs $CONTAINER_NAME"
    exit 1
fi
