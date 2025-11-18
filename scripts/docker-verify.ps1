#!/usr/bin/env pwsh
# Enhanced Universal Logging Platform v2.2.0 - Docker Deployment Verification
# Verifies all security changes are properly deployed in Docker container

Write-Host "🔍 Enhanced Universal Logging Platform - Deployment Verification" -ForegroundColor Green
Write-Host "Checking Docker deployment for security hardening..." -ForegroundColor Yellow

# Function to check if container is running
function Test-ContainerRunning {
    param([string]$ContainerName)
    
    $result = docker ps --filter "name=$ContainerName" --format "{{.Names}}" 2>$null
    return $result -eq $ContainerName
}

# Function to exec command in container
function Invoke-ContainerCommand {
    param([string]$ContainerName, [string]$Command)
    
    try {
        $result = docker exec $ContainerName sh -c $Command 2>$null
        return $result
    } catch {
        return $null
    }
}

$containerName = "rejavarti-logging-server"

Write-Host "`n📋 Deployment Checklist:" -ForegroundColor Cyan

# 1. Check if container is running
Write-Host "1. Container Status: " -NoNewline -ForegroundColor White
if (Test-ContainerRunning $containerName) {
    Write-Host "✅ Running" -ForegroundColor Green
} else {
    Write-Host "❌ Not Running" -ForegroundColor Red
    Write-Host "   Start with: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# 2. Check if templates directory exists in container
Write-Host "2. Template Structure: " -NoNewline -ForegroundColor White
$templatesCheck = Invoke-ContainerCommand $containerName "ls -la /app/configs/templates/base.js"
if ($templatesCheck) {
    Write-Host "✅ Found" -ForegroundColor Green
} else {
    Write-Host "❌ Missing configs/templates" -ForegroundColor Red
}

# 3. Check if database migrations exist
Write-Host "3. Database Migrations: " -NoNewline -ForegroundColor White  
$migrationCheck = Invoke-ContainerCommand $containerName "ls -la /app/archive/migrations/database-migration.js"
if ($migrationCheck) {
    Write-Host "✅ Found" -ForegroundColor Green
} else {
    Write-Host "❌ Missing archive/migrations" -ForegroundColor Red
}

# 4. Check environment variables
Write-Host "4. Security Environment: " -NoNewline -ForegroundColor White
$envCheck = Invoke-ContainerCommand $containerName "printenv AUTH_PASSWORD"
if ($envCheck -and $envCheck -ne "admin123" -and $envCheck -ne "password123") {
    Write-Host "✅ Secure AUTH_PASSWORD set" -ForegroundColor Green
} else {
    Write-Host "⚠️  Weak/Missing AUTH_PASSWORD" -ForegroundColor Yellow
}

# 5. Check JWT Secret
Write-Host "5. JWT Configuration: " -NoNewline -ForegroundColor White
$jwtCheck = Invoke-ContainerCommand $containerName "printenv JWT_SECRET"
if ($jwtCheck -and $jwtCheck.Length -gt 32) {
    Write-Host "✅ Strong JWT_SECRET set" -ForegroundColor Green
} else {
    Write-Host "⚠️  Weak/Missing JWT_SECRET" -ForegroundColor Yellow
}

# 6. Check server accessibility
Write-Host "6. Server Accessibility: " -NoNewline -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri "http://localhost:10180/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Server responding" -ForegroundColor Green
} catch {
    Write-Host "❌ Server not accessible" -ForegroundColor Red
}

# 7. Check for hardcoded passwords in container
Write-Host "7. Security Scan: " -NoNewline -ForegroundColor White
$securityScan = Invoke-ContainerCommand $containerName "grep -r 'password123\|admin123' /app --exclude-dir=node_modules 2>/dev/null || echo 'CLEAN'"
if ($securityScan -eq "CLEAN" -or $securityScan -eq $null) {
    Write-Host "✅ No hardcoded passwords found" -ForegroundColor Green
} else {
    Write-Host "⚠️  Possible security issues detected" -ForegroundColor Yellow
}

Write-Host "`n🔗 Access Information:" -ForegroundColor Cyan
Write-Host "Dashboard: http://localhost:10180/dashboard" -ForegroundColor White
Write-Host "Health Check: http://localhost:10180/health" -ForegroundColor White
Write-Host "API Docs: http://localhost:10180/api/" -ForegroundColor White

Write-Host "`n📊 Container Logs (last 10 lines):" -ForegroundColor Cyan
docker logs $containerName --tail 10 2>$null

Write-Host "`n✅ Verification completed!" -ForegroundColor Green