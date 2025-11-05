#!/bin/bash

# Enhanced Universal Logging Platform Startup Script

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                Enhanced Universal Logging Platform           ║"
echo "║                  Enterprise Grade Log Management             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed or not in PATH${NC}"
    echo -e "${YELLOW}📥 Please install Node.js from: https://nodejs.org/${NC}"
    echo ""
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo -e "${YELLOW}⚠️  Node.js version $NODE_VERSION detected. Recommended: v14 or higher${NC}"
fi

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
    echo ""
fi

# Make sure the script is executable
chmod +x start.js
chmod +x initial-setup-server.js
chmod +x server.js

# Start the universal launcher
echo -e "${BLUE}🚀 Starting Enhanced Universal Logging Platform...${NC}"
echo ""
node start.js