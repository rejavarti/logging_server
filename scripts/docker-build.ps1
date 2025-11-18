#!/usr/bin/env pwsh
# Enhanced Universal Logging Platform v2.2.0 - Docker Build Script
# Builds updated Docker image with all security fixes and file reorganization

Write-Host "🐳 Building Enhanced Universal Logging Platform Docker Image..." -ForegroundColor Green
Write-Host "Version: 2.2.0-security-hardened" -ForegroundColor Yellow

# Change to docker-files directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$dockerFilesPath = Join-Path $projectRoot "docker-files"

Write-Host "📁 Project Root: $projectRoot" -ForegroundColor Cyan
Write-Host "📁 Docker Files: $dockerFilesPath" -ForegroundColor Cyan

# Verify Dockerfile exists
$dockerfilePath = Join-Path $dockerFilesPath "Dockerfile"
if (-not (Test-Path $dockerfilePath)) {
    Write-Host "❌ Error: Dockerfile not found at $dockerfilePath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dockerfile found" -ForegroundColor Green

# Build the Docker image
Write-Host "`n🔨 Building Docker image..." -ForegroundColor Yellow
Set-Location $projectRoot

try {
    # Build with proper context (from project root, using docker-files/Dockerfile)
    docker build -f docker-files/Dockerfile -t enhanced-logging-platform:2.2.0-security-hardened .
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Docker image built successfully!" -ForegroundColor Green
        Write-Host "🏷️  Image: enhanced-logging-platform:2.2.0-security-hardened" -ForegroundColor Cyan
        
        Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
        Write-Host "1. Copy docker-files/docker-compose.yml to your deployment directory" -ForegroundColor White
        Write-Host "2. Copy configs/docker.env.template to .env and configure secrets" -ForegroundColor White
        Write-Host "3. Run: docker-compose up -d" -ForegroundColor White
        Write-Host "4. Access: http://localhost:10180/dashboard" -ForegroundColor White
        
        Write-Host "`n🔒 Security Notes:" -ForegroundColor Red
        Write-Host "- Set AUTH_PASSWORD environment variable" -ForegroundColor White
        Write-Host "- Set JWT_SECRET environment variable" -ForegroundColor White
        Write-Host "- All hardcoded passwords have been removed" -ForegroundColor White
        Write-Host "- Template paths updated for file reorganization" -ForegroundColor White
        
    } else {
        Write-Host "`n❌ Docker build failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n❌ Error during build: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 Build completed successfully!" -ForegroundColor Green