#!/bin/bash

# Universal Home Logging Platform - Unraid Deployment Script
# Tom Nelson - 2025
# Target Server: 192.168.222.3 (50TB Unraid)

echo "🏠 Universal Home Logging Platform - Deployment Script"
echo "=================================================="

# Configuration
UNRAID_IP="192.168.222.3"
CONTAINER_NAME="dsc-universal-logger"
APP_DIR="/mnt/user/appdata/dsc-logger"
PORT="10180"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on Unraid
check_environment() {
    print_status "Checking environment..."
    
    if [ ! -d "/mnt/user" ]; then
        print_error "This script is designed for Unraid servers"
        print_error "/mnt/user directory not found"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    print_status "Environment check passed ✓"
}

# Create directory structure
create_directories() {
    print_status "Creating directory structure..."
    
    # Create main app directory
    mkdir -p "$APP_DIR"/{data/databases,logs}
    
    # Set proper permissions
    chmod -R 755 "$APP_DIR"
    chown -R nobody:users "$APP_DIR" 2>/dev/null || print_warning "Could not set ownership to nobody:users"
    
    print_status "Directories created ✓"
    ls -la "$APP_DIR"
}

# Deploy application files
deploy_files() {
    print_status "Deploying application files..."
    
    # Note: In real deployment, these files would be copied from development machine
    # For now, we'll create them directly or assume they're already in place
    
    if [ ! -f "$APP_DIR/package.json" ]; then
        print_error "Application files not found in $APP_DIR"
        print_error "Please copy the logging-server files to $APP_DIR first"
        exit 1
    fi
    
    print_status "Application files ready ✓"
}

# Stop existing container
stop_existing() {
    print_status "Checking for existing container..."
    
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        print_warning "Stopping existing container..."
        docker stop "$CONTAINER_NAME"
        docker rm "$CONTAINER_NAME"
    fi
    
    # Remove existing image to force rebuild
    if docker images -q dsc-logging-server | grep -q .; then
        print_status "Removing existing image for rebuild..."
        docker rmi dsc-logging-server
    fi
}

# Build and start container
start_container() {
    print_status "Building and starting container..."
    
    cd "$APP_DIR"
    
    # Build and start using docker-compose
    if command -v docker-compose &> /dev/null; then
        docker-compose down 2>/dev/null || true
        docker-compose build --no-cache
        docker-compose up -d
    else
        # Fallback to docker build/run if docker-compose not available
        docker build -t dsc-logging-server .
        docker run -d \
            --name "$CONTAINER_NAME" \
            --restart unless-stopped \
            -p "$PORT:$PORT" \
            -v "$APP_DIR/data:/app/data" \
            -v "$APP_DIR/logs:/app/logs" \
            -e NODE_ENV=production \
            -e TZ=America/Denver \
            -e AUTH_USERNAME=dsc_logger \
            -e AUTH_PASSWORD=SecureLog2025! \
            dsc-logging-server
    fi
    
    print_status "Container started ✓"
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Wait for container to start
    sleep 10
    
    # Check container status
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        print_error "Container is not running"
        docker logs "$CONTAINER_NAME"
        exit 1
    fi
    
    # Test health endpoint
    print_status "Testing health endpoint..."
    
    local health_response
    health_response=$(curl -s -w "%{http_code}" -o /tmp/health_check "http://localhost:$PORT/health" 2>/dev/null || echo "000")
    
    if [ "$health_response" = "200" ]; then
        print_status "Health check passed ✓"
        cat /tmp/health_check | python -m json.tool 2>/dev/null || cat /tmp/health_check
    else
        print_warning "Health check failed (HTTP $health_response)"
        print_warning "Container may still be starting up..."
    fi
    
    # Show container logs
    print_status "Recent container logs:"
    docker logs --tail 20 "$CONTAINER_NAME"
}

# Display deployment information
show_info() {
    echo ""
    echo "🎉 Deployment Complete!"
    echo "======================="
    echo "Container Name: $CONTAINER_NAME"
    echo "Server URL: http://$UNRAID_IP:$PORT"
    echo "Health Check: http://$UNRAID_IP:$PORT/health"
    echo "Data Directory: $APP_DIR/data"
    echo "Logs Directory: $APP_DIR/logs"
    echo ""
    echo "📡 ESP32 Configuration:"
    echo "HTTP_LOG_SERVER_IP: \"$UNRAID_IP\""
    echo "HTTP_LOG_SERVER_PORT: $PORT"
    echo "HTTP_LOG_USERNAME: \"dsc_logger\""
    echo "HTTP_LOG_PASSWORD: \"SecureLog2025!\""
    echo ""
    echo "🔧 Management Commands:"
    echo "docker logs $CONTAINER_NAME          # View logs"
    echo "docker restart $CONTAINER_NAME       # Restart container"
    echo "docker exec -it $CONTAINER_NAME sh   # Shell access"
    echo ""
    echo "📊 Test Logging:"
    echo "curl -X POST http://$UNRAID_IP:$PORT/log \\"
    echo "  -H \"Content-Type: application/json\" \\"
    echo "  -u dsc_logger:SecureLog2025! \\"
    echo "  -d '{\"event_type\":\"test\",\"message\":\"Hello from deployment script\"}'"
}

# Main execution
main() {
    check_environment
    create_directories
    deploy_files
    stop_existing
    start_container
    verify_deployment
    show_info
}

# Handle script interruption
trap 'print_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"