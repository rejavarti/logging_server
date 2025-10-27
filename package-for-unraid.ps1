#!/usr/bin/env pwsh
# ============================================================
# Unraid Deployment Package Creator
# ============================================================
# Creates a clean deployment package excluding development files
# and runtime data for deployment to Unraid Docker container
# ============================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   Unraid Deployment Package Creator" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Configuration
$PackageName = "logging-server-deployment-$(Get-Date -Format 'yyyy-MM-dd-HHmm')"
$PackageDir = ".\deploy-package"
$ZipFile = ".\$PackageName.zip"

# Files and directories to include
$IncludeItems = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "Dockerfile",
    "docker-compose.yml",
    "README.md",
    ".gitignore",
    "public",
    "scripts"
)

# Files and directories to exclude
$ExcludePatterns = @(
    "node_modules",
    "logs",
    "data",
    "*.log",
    "*.db",
    "*.sqlite",
    "*.backup",
    ".env*",
    "startup-test.log",
    "server-output.log",
    "*.bak",
    "*.ps1"  # Exclude all PowerShell scripts except this one
)

Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow

# Step 1: Clean up existing package directory
if (Test-Path $PackageDir) {
    Write-Host "   Removing old package directory..." -ForegroundColor Gray
    Remove-Item -Path $PackageDir -Recurse -Force
}

# Step 2: Create fresh package directory
Write-Host "   Creating package directory..." -ForegroundColor Gray
New-Item -ItemType Directory -Path $PackageDir -Force | Out-Null

# Step 3: Copy included files and directories
Write-Host "`n📂 Copying files..." -ForegroundColor Yellow
foreach ($item in $IncludeItems) {
    if (Test-Path $item) {
        $destination = Join-Path $PackageDir $item
        if (Test-Path $item -PathType Container) {
            Write-Host "   ✓ Directory: $item" -ForegroundColor Green
            Copy-Item -Path $item -Destination $destination -Recurse -Force
        } else {
            Write-Host "   ✓ File: $item" -ForegroundColor Green
            Copy-Item -Path $item -Destination $destination -Force
        }
    } else {
        Write-Host "   ⚠ Not found: $item" -ForegroundColor Yellow
    }
}

# Step 4: Create empty directories for Docker volumes
Write-Host "`n📁 Creating empty runtime directories..." -ForegroundColor Yellow
$RuntimeDirs = @("data/databases", "data/backups", "data/sessions", "logs")
foreach ($dir in $RuntimeDirs) {
    $fullPath = Join-Path $PackageDir $dir
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    Write-Host "   ✓ Created: $dir" -ForegroundColor Green
    
    # Create .gitkeep to preserve directory structure
    New-Item -ItemType File -Path (Join-Path $fullPath ".gitkeep") -Force | Out-Null
}

# Step 5: Create deployment instructions file
Write-Host "`n📝 Creating deployment instructions..." -ForegroundColor Yellow
$DeployInstructions = @"
# Logging Server - Unraid Deployment Instructions
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

## 🚀 Quick Deployment Steps

### 1. Transfer Files to Unraid
``````bash
# Option A: Upload via Unraid web interface
# Upload $PackageName.zip to /mnt/user/appdata/

# Option B: Use SCP/SFTP
scp $PackageName.zip root@192.168.222.3:/mnt/user/appdata/
``````

### 2. Extract on Unraid Server
``````bash
# SSH into Unraid
ssh root@192.168.222.3

# Extract package
cd /mnt/user/appdata/
unzip $PackageName.zip
mv deploy-package logging-server
cd logging-server
``````

### 3. Build and Deploy Docker Container
``````bash
# Build the Docker image with PM2 support
docker-compose build

# Start the container
docker-compose up -d

# Verify deployment
docker ps | grep dsc-universal-logger
curl http://192.168.222.3:10180/health
``````

### 4. First-Time Setup
``````bash
# Check logs
docker logs dsc-universal-logger

# Access web interface
# URL: http://192.168.222.3:10180
# Default credentials: dsc_logger / SecureLog2025!

# Create admin account
# Navigate to /register and create your admin user
``````

### 5. Verify Features
- ✅ Login page: http://192.168.222.3:10180
- ✅ Dashboard: http://192.168.222.3:10180/dashboard
- ✅ Integrations: http://192.168.222.3:10180/integrations
- ✅ Webhooks: http://192.168.222.3:10180/webhooks
- ✅ Settings: http://192.168.222.3:10180/settings
- ✅ Health check: http://192.168.222.3:10180/health

### 6. Optional: Update Environment Variables
Edit docker-compose.yml if you want to change:
- PORT (default: 10180)
- AUTH_USERNAME (default: dsc_logger)
- AUTH_PASSWORD (default: SecureLog2025!)
- TZ (timezone, default: America/Denver)

After changes:
``````bash
docker-compose down
docker-compose up -d
``````

## 🔄 Restart Functionality
The container includes PM2 for automatic restarts:
- Manual restart: Use "Restart Server" button in Settings page
- Automatic restart: PM2 handles crashes and restarts
- Docker restart policy: Container restarts automatically on failure

## 📊 Monitoring
``````bash
# View logs
docker logs -f dsc-universal-logger

# Check health
curl http://192.168.222.3:10180/health

# Check container stats
docker stats dsc-universal-logger
``````

## 🗄️ Data Persistence
All data is stored in Docker volumes:
- /mnt/user/appdata/logging-server/data/databases - SQLite databases
- /mnt/user/appdata/logging-server/data/backups - Automatic backups (2 AM daily, keeps 10)
- /mnt/user/appdata/logging-server/data/sessions - User sessions
- /mnt/user/appdata/logging-server/logs - Categorized log files

## 🔧 Troubleshooting
``````bash
# Container won't start
docker logs dsc-universal-logger

# Permission issues
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server/data
chown -R 1001:1001 /mnt/user/appdata/logging-server/logs

# Rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Reset everything
docker-compose down -v
rm -rf data/databases/* data/sessions/* logs/*
docker-compose up -d
``````

## 📦 Package Contents
- server.js - Main application
- package.json - Dependencies
- Dockerfile - Container configuration with PM2
- docker-compose.yml - Unraid deployment config
- public/ - Static web assets
- scripts/ - Utility scripts
- Empty runtime directories (data/, logs/)

## 🎯 Production Ready Features
✅ PM2 process management for auto-restart
✅ Enterprise authentication with RBAC
✅ Integration management (MQTT, WebSocket, UniFi, Home Assistant)
✅ Webhook system for event notifications
✅ Automatic daily backups (2 AM, keeps 10)
✅ Health monitoring endpoints
✅ Session management
✅ Activity logging and audit trails
✅ Real-time WebSocket updates
✅ Ocean Blue themed UI

## 🔐 Security Notes
- Change default AUTH_PASSWORD before production use
- First user registered becomes admin
- Use HTTPS reverse proxy (Nginx Proxy Manager recommended)
- Regularly check /settings/audit for access logs
- Backups are automatic but verify they're working

## 📞 Support
If you encounter issues:
1. Check docker logs: docker logs dsc-universal-logger
2. Verify health endpoint: curl http://192.168.222.3:10180/health
3. Check container status: docker ps -a
4. Review deployment logs above

---
Deployment Package Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Version: 2.1.0-stable-enhanced
"@

$DeployInstructions | Out-File -FilePath (Join-Path $PackageDir "DEPLOYMENT_GUIDE.md") -Encoding UTF8
Write-Host "   ✓ DEPLOYMENT_GUIDE.md created" -ForegroundColor Green

# Step 6: Create .dockerignore for optimal builds
Write-Host "`n📝 Creating .dockerignore..." -ForegroundColor Yellow
$DockerIgnore = @"
# Ignore development and runtime files during Docker build
node_modules/
npm-debug.log
logs/
*.log
data/
*.db
*.sqlite
.env
.env.*
.git/
.gitignore
*.md
!README.md
*.ps1
*.backup
*.bak
startup-test.log
server-output.log
deploy-package/
*.zip
"@

$DockerIgnore | Out-File -FilePath (Join-Path $PackageDir ".dockerignore") -Encoding UTF8
Write-Host "   ✓ .dockerignore created" -ForegroundColor Green

# Step 7: Create quick-deploy script for Unraid
Write-Host "`n📝 Creating Unraid deployment script..." -ForegroundColor Yellow
$UnraidScript = @"
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
"@

$UnraidScript | Out-File -FilePath (Join-Path $PackageDir "deploy-unraid.sh") -Encoding UTF8
# Make executable (won't work on Windows, but will be set on Linux)
Write-Host "   ✓ deploy-unraid.sh created" -ForegroundColor Green

# Step 8: Create ZIP archive
Write-Host "`n📦 Creating ZIP archive..." -ForegroundColor Yellow
if (Test-Path $ZipFile) {
    Remove-Item $ZipFile -Force
}

# Use Compress-Archive (built-in PowerShell)
Compress-Archive -Path "$PackageDir\*" -DestinationPath $ZipFile -Force

$zipSize = (Get-Item $ZipFile).Length / 1MB
Write-Host "   ✓ Created: $ZipFile ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

# Step 9: Display summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   ✅ DEPLOYMENT PACKAGE READY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Package: $ZipFile" -ForegroundColor Yellow
Write-Host "📏 Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Transfer $ZipFile to Unraid server" -ForegroundColor White
Write-Host "   2. Extract to /mnt/user/appdata/logging-server" -ForegroundColor White
Write-Host "   3. Run: cd /mnt/user/appdata/logging-server && bash deploy-unraid.sh" -ForegroundColor White
Write-Host ""
Write-Host "📖 Full instructions in: DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
Write-Host "🎯 Unraid Target: 192.168.222.3:10180" -ForegroundColor Green
Write-Host ""

# Optional: Open deployment guide
$openGuide = Read-Host "Open DEPLOYMENT_GUIDE.md? (y/n)"
if ($openGuide -eq 'y' -or $openGuide -eq 'Y') {
    Start-Process (Join-Path $PackageDir "DEPLOYMENT_GUIDE.md")
}

Write-Host "`n✨ Package creation complete!`n" -ForegroundColor Green
