#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Fast Docker build with aggressive caching for slow internet connections
.DESCRIPTION
    Uses Docker BuildKit cache mounts to avoid re-downloading npm packages
    Caches are stored in Docker volumes and persist between builds
    Perfect for slow internet (2 Mbps down) - dependencies only download once
.EXAMPLE
    .\docker-build-cached.ps1
.EXAMPLE
    .\docker-build-cached.ps1 -NoBuildKit  # Fallback to regular caching
#>

param(
    [switch]$NoBuildKit,
    [switch]$NoCache,
    [string]$Tag = "rejavarti/logging-server:latest"
)

Write-Host "`n🚀 Docker Build with Aggressive Caching" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Enable BuildKit for cache mount support
if (-not $NoBuildKit) {
    $env:DOCKER_BUILDKIT = 1
    Write-Host "✅ Docker BuildKit enabled (cache mount support)" -ForegroundColor Green
} else {
    $env:DOCKER_BUILDKIT = 0
    Write-Host "⚠️  BuildKit disabled - using standard caching" -ForegroundColor Yellow
}

# Create npm cache directory if it doesn't exist
$npmCacheDir = "$PSScriptRoot\.docker-cache\npm"
if (-not (Test-Path $npmCacheDir)) {
    New-Item -ItemType Directory -Path $npmCacheDir -Force | Out-Null
    Write-Host "📦 Created local npm cache directory: $npmCacheDir" -ForegroundColor Green
}

# Build arguments
$buildArgs = @(
    "build"
    "-t", $Tag
)

if ($NoCache) {
    $buildArgs += "--no-cache"
    Write-Host "🔄 Building WITHOUT cache (fresh build)" -ForegroundColor Yellow
} else {
    Write-Host "📦 Building WITH cache (fast incremental build)" -ForegroundColor Green
}

# Add BuildKit progress mode
$buildArgs += @(
    "--progress=plain"
    "."
)

Write-Host "`n🔨 Building Docker image..." -ForegroundColor Cyan
Write-Host "Command: docker $($buildArgs -join ' ')" -ForegroundColor Gray

# Execute build
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
docker @buildArgs

$stopwatch.Stop()

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Build completed successfully in $($stopwatch.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Green
    Write-Host "📦 Image tagged as: $Tag" -ForegroundColor Cyan
    
    # Show image size
    $imageInfo = docker images $Tag --format "{{.Size}}" 2>$null
    if ($imageInfo) {
        Write-Host "💾 Image size: $imageInfo" -ForegroundColor Cyan
    }
} else {
    Write-Host "`n❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n💡 Tips for slow internet:" -ForegroundColor Yellow
Write-Host "  • Cached builds reuse downloaded dependencies (10-30 seconds)" -ForegroundColor Gray
Write-Host "  • Only use -NoCache when truly needed" -ForegroundColor Gray
Write-Host "  • BuildKit cache persists in Docker volumes" -ForegroundColor Gray
Write-Host "  • Local npm cache: $npmCacheDir" -ForegroundColor Gray
