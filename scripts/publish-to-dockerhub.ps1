# ============================================================
# Docker Hub Publishing Script
# ============================================================
# Builds and publishes the logging server to Docker Hub
# ============================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DockerUsername = "rejavarti",
    
    [Parameter(Mandatory=$false)]
    [string]$ImageName = "logging-server",
    
    [Parameter(Mandatory=$false)]
    [string]$Version = "1.0.0",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipLogin
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   Docker Hub Publishing Tool" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$FullImageName = "$DockerUsername/$ImageName"
$Tags = @(
    "${FullImageName}:${Version}",
    "${FullImageName}:latest"
)

Write-Host "📦 Configuration:" -ForegroundColor Yellow
Write-Host "   Docker Hub User: $DockerUsername" -ForegroundColor White
Write-Host "   Image Name: $ImageName" -ForegroundColor White
Write-Host "   Version: $Version" -ForegroundColor White
Write-Host "   Full Image: $FullImageName" -ForegroundColor White
Write-Host ""

# Step 1: Login to Docker Hub
if (-not $SkipLogin) {
    Write-Host "🔐 Step 1: Docker Hub Login" -ForegroundColor Yellow
    Write-Host "   Please enter your Docker Hub credentials..." -ForegroundColor Gray
    
    docker login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Docker login failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⏭️  Skipping login (already logged in)" -ForegroundColor Gray
    Write-Host ""
}

# Step 2: Build Docker image
if (-not $SkipBuild) {
    Write-Host "🏗️  Step 2: Building Docker Image" -ForegroundColor Yellow
    Write-Host "   Building multi-platform image with PM2..." -ForegroundColor Gray
    
    docker build -t "${FullImageName}:${Version}" -t "${FullImageName}:latest" .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Docker build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "   ✓ Build successful" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⏭️  Skipping build (using existing image)" -ForegroundColor Gray
    Write-Host ""
}

# Step 3: Verify image
Write-Host "🔍 Step 3: Verifying Image" -ForegroundColor Yellow
docker images | Select-String -Pattern $ImageName | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
Write-Host ""

# Step 4: Test image locally (optional)
Write-Host "🧪 Step 4: Test Image Locally? (Optional)" -ForegroundColor Yellow
$testLocal = Read-Host "   Run a quick local test before publishing? (y/n)"

if ($testLocal -eq 'y' -or $testLocal -eq 'Y') {
    Write-Host "   Starting test container..." -ForegroundColor Gray
    
    # Stop any existing test container
    docker stop logging-server-test 2>$null
    docker rm logging-server-test 2>$null
    
    # Run test container
    docker run -d `
        --name logging-server-test `
        -p 10181:10180 `
        -e NODE_ENV=production `
        -e TZ=America/Denver `
        "${FullImageName}:${Version}"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ⚠️  Test container failed to start" -ForegroundColor Yellow
    } else {
        Write-Host "   ✓ Test container started on port 10181" -ForegroundColor Green
        Write-Host "   Waiting 5 seconds for startup..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
        
        # Test health endpoint
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:10181/health" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✓ Health check passed!" -ForegroundColor Green
                Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "   ⚠️  Health check failed: $_" -ForegroundColor Yellow
        }
        
        Write-Host "   Stopping test container..." -ForegroundColor Gray
        docker stop logging-server-test | Out-Null
        docker rm logging-server-test | Out-Null
    }
    Write-Host ""
}

# Step 5: Push to Docker Hub
Write-Host "🚀 Step 5: Publishing to Docker Hub" -ForegroundColor Yellow
$confirmPush = Read-Host "   Ready to push to Docker Hub? (y/n)"

if ($confirmPush -ne 'y' -and $confirmPush -ne 'Y') {
    Write-Host "`n⚠️  Publish cancelled by user" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
foreach ($tag in $Tags) {
    Write-Host "   Pushing: $tag" -ForegroundColor Cyan
    docker push $tag
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Failed to push $tag" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "   ✓ Successfully pushed: $tag" -ForegroundColor Green
}

# Step 6: Verify on Docker Hub
Write-Host "`n🎉 Step 6: Publish Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Published Tags:" -ForegroundColor Yellow
foreach ($tag in $Tags) {
    Write-Host "   • $tag" -ForegroundColor Green
}
Write-Host ""
Write-Host "🌐 Docker Hub Links:" -ForegroundColor Yellow
Write-Host "   Repository: https://hub.docker.com/r/$DockerUsername/$ImageName" -ForegroundColor Cyan
Write-Host "   Tags: https://hub.docker.com/r/$DockerUsername/$ImageName/tags" -ForegroundColor Cyan
Write-Host ""

# Step 7: Update instructions
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Verify image on Docker Hub (open link above)" -ForegroundColor White
Write-Host "   2. Users can now pull with:" -ForegroundColor White
Write-Host "      docker pull ${FullImageName}:latest" -ForegroundColor Cyan
Write-Host "   3. Unraid users can use the GUI template (unraid-template.xml)" -ForegroundColor White
Write-Host "   4. Update README.md with Docker Hub installation instructions" -ForegroundColor White
Write-Host ""

# Step 8: Generate quick install command
Write-Host "💡 Quick Install Command for Users:" -ForegroundColor Yellow
Write-Host ""
Write-Host "docker run -d \\" -ForegroundColor Cyan
Write-Host "  --name rejavarti-logging-server \\" -ForegroundColor Cyan
Write-Host "  --restart unless-stopped \\" -ForegroundColor Cyan
Write-Host "  -p 10180:10180 \\" -ForegroundColor Cyan
Write-Host "  -v /path/to/data:/app/data \\" -ForegroundColor Cyan
Write-Host "  -v /path/to/logs:/app/logs \\" -ForegroundColor Cyan
Write-Host "  -e NODE_ENV=production \\" -ForegroundColor Cyan
Write-Host "  -e TZ=America/Denver \\" -ForegroundColor Cyan
Write-Host "  -e AUTH_USERNAME=admin \\" -ForegroundColor Cyan
Write-Host "  -e AUTH_PASSWORD=\$AUTH_PASSWORD \\" -ForegroundColor Cyan
Write-Host "  ${FullImageName}:latest" -ForegroundColor Cyan
Write-Host ""

Write-Host "✨ Publishing complete!`n" -ForegroundColor Green

# Optional: Clean up local images
$cleanup = Read-Host "Clean up local test images? (y/n)"
if ($cleanup -eq 'y' -or $cleanup -eq 'Y') {
    Write-Host "   Cleaning up..." -ForegroundColor Gray
    docker image prune -f | Out-Null
    Write-Host "   ✓ Cleanup complete" -ForegroundColor Green
}
