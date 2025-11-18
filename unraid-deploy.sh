#!/bin/bash
#######################################################################
# Enterprise Logging Server - Unraid Quick Deploy Script
# 
# This script automates the deployment of the Enterprise Logging
# Platform on Unraid servers.
#
# Usage: 
#   bash unraid-deploy.sh
#
# Author: Tom Nelson
# Version: 1.0.0
#######################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="enterprise-logging-server"
IMAGE_NAME="rejavarti/logging-server:latest"
APPDATA_PATH="/mnt/user/appdata/logging-server"
WEB_PORT=10180
WS_PORT=8081
STREAM_PORT=8082

# Logging functions
log_info() { echo -e "${BLUE}ℹ ${NC}$1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Header
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Enterprise Logging Server - Unraid Deployment          ║"
echo "║   Version 2.2.0                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    log_error "Please run as root (sudo bash unraid-deploy.sh)"
    exit 1
fi

log_info "Starting deployment process..."

# Step 1: Check if Docker is running
log_info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running"
    exit 1
fi
log_success "Docker is running"

# Step 2: Check for existing container
log_info "Checking for existing installation..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_warning "Container '${CONTAINER_NAME}' already exists"
    read -p "Do you want to remove and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping and removing existing container..."
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
        log_success "Removed existing container"
    else
        log_error "Deployment cancelled"
        exit 1
    fi
fi

# Step 3: Create appdata directories
log_info "Creating appdata directories..."
mkdir -p "${APPDATA_PATH}/data/databases"
mkdir -p "${APPDATA_PATH}/data/backups"
mkdir -p "${APPDATA_PATH}/data/sessions"
mkdir -p "${APPDATA_PATH}/data/config"
mkdir -p "${APPDATA_PATH}/logs"
log_success "Directories created"

# Step 4: Set permissions
log_info "Setting permissions (PUID=99, PGID=100)..."
chown -R 99:100 "${APPDATA_PATH}"
chmod -R 755 "${APPDATA_PATH}"
log_success "Permissions set"

# Step 5: Get configuration from user
echo ""
log_info "Configuration Setup"
echo "-------------------"

# Admin password
read -sp "Enter admin password (min 12 chars): " ADMIN_PASSWORD
echo
if [ ${#ADMIN_PASSWORD} -lt 12 ]; then
    log_error "Password must be at least 12 characters"
    exit 1
fi

# JWT Secret
log_info "Generating JWT secret..."
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64)
log_success "JWT secret generated"

# Timezone
read -p "Enter timezone (default: America/Denver): " TZ_INPUT
TZ="${TZ_INPUT:-America/Denver}"

# Step 6: Check for port conflicts
log_info "Checking for port conflicts..."
PORTS_IN_USE=""
for port in ${WEB_PORT} ${WS_PORT} ${STREAM_PORT} 514 601 12201 12202 5044 9880; do
    if netstat -tuln 2>/dev/null | grep -q ":${port} " || ss -tuln 2>/dev/null | grep -q ":${port} "; then
        PORTS_IN_USE="${PORTS_IN_USE} ${port}"
    fi
done

if [ -n "$PORTS_IN_USE" ]; then
    log_warning "The following ports are already in use:${PORTS_IN_USE}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Deployment cancelled"
        exit 1
    fi
fi
log_success "Port check complete"

# Step 7: Check if image exists locally
log_info "Checking for Docker image..."
if ! docker image inspect ${IMAGE_NAME} &> /dev/null; then
    log_warning "Image '${IMAGE_NAME}' not found locally"
    echo "Options:"
    echo "  1) Pull from Docker Hub (if published)"
    echo "  2) Build from Dockerfile"
    echo "  3) Load from tar file"
    read -p "Select option (1/2/3): " -n 1 -r IMAGE_OPTION
    echo
    
    case $IMAGE_OPTION in
        1)
            log_info "Pulling image from Docker Hub..."
            docker pull ${IMAGE_NAME} || {
                log_error "Failed to pull image"
                exit 1
            }
            ;;
        2)
            log_info "Building image from Dockerfile..."
            if [ ! -f "Dockerfile" ]; then
                log_error "Dockerfile not found in current directory"
                exit 1
            fi
            docker build -t ${IMAGE_NAME} . || {
                log_error "Failed to build image"
                exit 1
            }
            ;;
        3)
            read -p "Enter path to tar file: " TAR_PATH
            if [ ! -f "$TAR_PATH" ]; then
                log_error "Tar file not found: $TAR_PATH"
                exit 1
            fi
            log_info "Loading image from tar..."
            docker load -i "$TAR_PATH" || {
                log_error "Failed to load image"
                exit 1
            }
            ;;
        *)
            log_error "Invalid option"
            exit 1
            ;;
    esac
fi
log_success "Docker image ready"

# Step 8: Deploy container
log_info "Deploying container..."

docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  --network bridge \
  -p ${WEB_PORT}:10180 \
  -p ${WS_PORT}:8081 \
  -p ${STREAM_PORT}:8082 \
  -p 514:514/udp \
  -p 601:601 \
  -p 12201:12201/udp \
  -p 12202:12202 \
  -p 5044:5044 \
  -p 9880:9880 \
  -v "${APPDATA_PATH}/data:/app/data" \
  -v "${APPDATA_PATH}/logs:/app/logs" \
  -e NODE_ENV=production \
  -e PORT=10180 \
  -e WS_PORT=8081 \
  -e STREAM_PORT=8082 \
  -e TZ="${TZ}" \
  -e AUTH_PASSWORD="${ADMIN_PASSWORD}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e PUID=99 \
  -e PGID=100 \
  --health-cmd="wget --spider -q http://localhost:10180/health || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  --health-start-period=15s \
  ${IMAGE_NAME}

if [ $? -eq 0 ]; then
    log_success "Container deployed successfully"
else
    log_error "Failed to deploy container"
    exit 1
fi

# Step 9: Wait for container to be healthy
log_info "Waiting for container to become healthy..."
WAIT_TIME=0
MAX_WAIT=60

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME} 2>/dev/null || echo "unknown")
    
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        log_success "Container is healthy"
        break
    elif [ "$HEALTH_STATUS" = "unhealthy" ]; then
        log_error "Container health check failed"
        log_info "Viewing last 50 lines of logs:"
        docker logs ${CONTAINER_NAME} --tail 50
        exit 1
    fi
    
    echo -n "."
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
done
echo ""

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    log_warning "Health check timeout, but container is running"
fi

# Step 10: Verify deployment
log_info "Verifying deployment..."

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_success "Container is running"
else
    log_error "Container is not running"
    exit 1
fi

# Get container IP
CONTAINER_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${CONTAINER_NAME})

# Try to access health endpoint
sleep 5
if curl -s -f "http://localhost:${WEB_PORT}/api/system/health" > /dev/null 2>&1; then
    log_success "Web server is responding"
else
    log_warning "Web server not responding yet (may need more time to start)"
fi

# Display deployment summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Deployment Successful! 🎉                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Container Details:"
echo "  Name:          ${CONTAINER_NAME}"
echo "  Image:         ${IMAGE_NAME}"
echo "  Container IP:  ${CONTAINER_IP}"
echo "  Status:        $(docker inspect --format='{{.State.Status}}' ${CONTAINER_NAME})"
echo ""
echo "Access URLs:"
echo "  Web UI:        http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"
echo "  Health Check:  http://$(hostname -I | awk '{print $1}'):${WEB_PORT}/api/system/health"
echo ""
echo "Credentials:"
echo "  Username:      admin"
echo "  Password:      (as entered during setup)"
echo ""
echo "Data Locations:"
echo "  AppData:       ${APPDATA_PATH}"
echo "  Database:      ${APPDATA_PATH}/data/logging.db"
echo "  Backups:       ${APPDATA_PATH}/data/backups"
echo "  Logs:          ${APPDATA_PATH}/logs"
echo ""
echo "Management Commands:"
echo "  View logs:     docker logs ${CONTAINER_NAME} -f"
echo "  Shell access:  docker exec -it ${CONTAINER_NAME} sh"
echo "  Restart:       docker restart ${CONTAINER_NAME}"
echo "  Stop:          docker stop ${CONTAINER_NAME}"
echo "  Start:         docker start ${CONTAINER_NAME}"
echo ""
echo "Next Steps:"
echo "  1. Open Web UI in your browser"
echo "  2. Login with admin credentials"
echo "  3. Configure ingestion sources"
echo "  4. Set up automated backups"
echo "  5. Create monitoring dashboards"
echo ""
log_success "Setup complete!"
