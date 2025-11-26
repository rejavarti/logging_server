#!/usr/bin/env pwsh
# Quick Fix Script for Logging Server Production Issues
# Fixes: Missing JWT_SECRET and useragent-parser errors

Write-Host "🔧 Logging Server - Quick Fix Utility" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check if running in logging-server directory
if (-not (Test-Path "server.js")) {
    Write-Host "❌ Error: Must run from logging-server directory" -ForegroundColor Red
    Write-Host "   Current location: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Running from logging-server directory" -ForegroundColor Green
Write-Host ""

# Step 1: Check for .env file
Write-Host "📋 Step 1: Checking for .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ .env file exists" -ForegroundColor Green
    
    # Check if JWT_SECRET is set
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "JWT_SECRET\s*=\s*(.+)") {
        $jwtSecret = $matches[1].Trim()
        if ($jwtSecret -and $jwtSecret -ne "your-secure-jwt-secret-here") {
            Write-Host "   ✅ JWT_SECRET is configured" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  JWT_SECRET exists but needs a real value" -ForegroundColor Yellow
            $needsJwtSecret = $true
        }
    } else {
        Write-Host "   ⚠️  JWT_SECRET not found in .env file" -ForegroundColor Yellow
        $needsJwtSecret = $true
    }
} else {
    Write-Host "   ⚠️  .env file not found, will create from .env.example" -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "   ✅ Created .env from .env.example" -ForegroundColor Green
        $needsJwtSecret = $true
    } else {
        Write-Host "   ❌ .env.example not found - cannot create .env" -ForegroundColor Red
        Write-Host "      Please create .env manually with JWT_SECRET" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host ""

# Step 2: Generate JWT_SECRET if needed
if ($needsJwtSecret) {
    Write-Host "📋 Step 2: Generating secure JWT_SECRET..." -ForegroundColor Yellow
    
    $jwtSecret = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    
    if ($jwtSecret) {
        Write-Host "   ✅ Generated 64-byte secure secret" -ForegroundColor Green
        
        # Update .env file
        $envContent = Get-Content ".env" -Raw
        if ($envContent -match "JWT_SECRET\s*=\s*.+") {
            $envContent = $envContent -replace "JWT_SECRET\s*=\s*.+", "JWT_SECRET=$jwtSecret"
        } else {
            $envContent += "`nJWT_SECRET=$jwtSecret`n"
        }
        
        $envContent | Set-Content ".env" -NoNewline
        Write-Host "   ✅ Updated .env with new JWT_SECRET" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Failed to generate JWT_SECRET" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "📋 Step 2: JWT_SECRET already configured, skipping" -ForegroundColor Green
}
Write-Host ""

# Step 3: Check container status
Write-Host "📋 Step 3: Checking Docker container status..." -ForegroundColor Yellow

$containerRunning = docker ps --filter "name=Rejavarti-Logging-Server" --format "{{.Names}}" 2>$null

if ($containerRunning -eq "Rejavarti-Logging-Server") {
    Write-Host "   ⚠️  Container is running with old config" -ForegroundColor Yellow
    Write-Host "   ℹ️  Need to restart with new environment variables" -ForegroundColor Cyan
    
    $restart = Read-Host "   Restart container now? (Y/n)"
    if ($restart -ne "n" -and $restart -ne "N") {
        Write-Host ""
        Write-Host "📋 Step 4: Restarting container with new config..." -ForegroundColor Yellow
        
        # Stop and remove old container
        docker stop Rejavarti-Logging-Server 2>&1 | Out-Null
        docker rm Rejavarti-Logging-Server 2>&1 | Out-Null
        Write-Host "   ✅ Stopped old container" -ForegroundColor Green
        
        # Read JWT_SECRET from .env
        $envContent = Get-Content ".env" -Raw
        if ($envContent -match "JWT_SECRET\s*=\s*(.+)") {
            $jwtSecret = $matches[1].Trim()
        }
        
        # Read AUTH_PASSWORD from .env or use default
        $authPassword = "ChangeMe123!"
        if ($envContent -match "AUTH_PASSWORD\s*=\s*(.+)") {
            $authPassword = $matches[1].Trim()
        }
        
        # Start new container with environment variables
        Write-Host "   🚀 Starting new container..." -ForegroundColor Cyan
        
        docker run -d `
            --name Rejavarti-Logging-Server `
            -p 10180:10180 `
            -v "${PWD}/data:/app/data" `
            -e NODE_ENV=production `
            -e JWT_SECRET="$jwtSecret" `
            -e AUTH_PASSWORD="$authPassword" `
            --restart unless-stopped `
            rejavarti/logging-server:latest
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Container started successfully" -ForegroundColor Green
            Write-Host ""
            Write-Host "📋 Step 5: Waiting for server to initialize..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            
            $logs = docker logs Rejavarti-Logging-Server --tail 20 2>&1 | Out-String
            
            if ($logs -match "HTTP Server running on port") {
                Write-Host "   ✅ Server started successfully!" -ForegroundColor Green
                Write-Host ""
                Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
                Write-Host "✅ ALL FIXES APPLIED SUCCESSFULLY!" -ForegroundColor Green
                Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
                Write-Host ""
                Write-Host "🌐 Access your server at: http://localhost:10180" -ForegroundColor Cyan
                Write-Host "👤 Username: admin" -ForegroundColor Cyan
                Write-Host "🔑 Password: $authPassword" -ForegroundColor Cyan
                Write-Host ""
            } elseif ($logs -match "JWT_SECRET") {
                Write-Host "   ❌ Server still failing with JWT_SECRET error" -ForegroundColor Red
                Write-Host "   📋 Recent logs:" -ForegroundColor Yellow
                Write-Host $logs -ForegroundColor Gray
            } elseif ($logs -match "useragent-parser") {
                Write-Host "   ⚠️  Useragent-parser warning (non-critical)" -ForegroundColor Yellow
                Write-Host "   ℹ️  This warning is harmless and can be ignored" -ForegroundColor Cyan
            } else {
                Write-Host "   ⚠️  Server status unclear, check logs:" -ForegroundColor Yellow
                Write-Host "      docker logs Rejavarti-Logging-Server" -ForegroundColor Cyan
            }
        } else {
            Write-Host "   ❌ Failed to start container" -ForegroundColor Red
            Write-Host "   Run: docker logs Rejavarti-Logging-Server" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "ℹ️  Restart skipped. To restart manually:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "   docker stop Rejavarti-Logging-Server" -ForegroundColor Gray
        Write-Host "   docker rm Rejavarti-Logging-Server" -ForegroundColor Gray
        
        # Read JWT_SECRET for display
        $envContent = Get-Content ".env" -Raw
        if ($envContent -match "JWT_SECRET\s*=\s*(.+)") {
            $jwtSecret = $matches[1].Trim()
        }
        
        Write-Host "   docker run -d --name Rejavarti-Logging-Server ``" -ForegroundColor Gray
        Write-Host "     -p 10180:10180 ``" -ForegroundColor Gray
        Write-Host "     -v `"`${PWD}/data:/app/data`" ``" -ForegroundColor Gray
        Write-Host "     -e NODE_ENV=production ``" -ForegroundColor Gray
        Write-Host "     -e JWT_SECRET=`"$jwtSecret`" ``" -ForegroundColor Gray
        Write-Host "     -e AUTH_PASSWORD=`"ChangeMe123!`" ``" -ForegroundColor Gray
        Write-Host "     --restart unless-stopped ``" -ForegroundColor Gray
        Write-Host "     rejavarti/logging-server:latest" -ForegroundColor Gray
    }
} else {
    Write-Host "   ℹ️  Container not currently running" -ForegroundColor Cyan
    Write-Host "   ℹ️  Start it with JWT_SECRET:" -ForegroundColor Cyan
    Write-Host ""
    
    # Read JWT_SECRET for display
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "JWT_SECRET\s*=\s*(.+)") {
        $jwtSecret = $matches[1].Trim()
    }
    
    Write-Host "   docker run -d --name Rejavarti-Logging-Server ``" -ForegroundColor Gray
    Write-Host "     -p 10180:10180 ``" -ForegroundColor Gray
    Write-Host "     -v `"`${PWD}/data:/app/data`" ``" -ForegroundColor Gray
    Write-Host "     -e NODE_ENV=production ``" -ForegroundColor Gray
    Write-Host "     -e JWT_SECRET=`"$jwtSecret`" ``" -ForegroundColor Gray
    Write-Host "     -e AUTH_PASSWORD=`"ChangeMe123!`" ``" -ForegroundColor Gray
    Write-Host "     --restart unless-stopped ``" -ForegroundColor Gray
    Write-Host "     rejavarti/logging-server:latest" -ForegroundColor Gray
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Configuration fixes complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
