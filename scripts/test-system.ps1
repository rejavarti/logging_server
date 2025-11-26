#!/usr/bin/env pwsh

# Enhanced Universal Logging Platform - Comprehensive System Test
# Tests all components after database fix

Write-Host "Starting comprehensive system test..."

# Wait for container startup
Start-Sleep 25

# Test 1: Container Status
Write-Host "`n1. Container Status:"
docker ps --filter "name=enhanced-logging-container" --format "{{.Names}} - {{.Status}}"

# Test 2: Health Check
Write-Host "`n2. Health Check:"
try {
    $health = Invoke-RestMethod -Uri "http://localhost:10180/health" -Method GET
    Write-Host "Status: $($health.status)"
    Write-Host "Version: $($health.version)"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}

# Test 3: Authentication
Write-Host "`n3. Authentication Test:"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
if (-not $env:AUTH_PASSWORD) { throw "AUTH_PASSWORD must be set" }
$loginData = @{ username="admin"; password=$env:AUTH_PASSWORD } | ConvertTo-Json
try {
    $loginResp = Invoke-RestMethod -Uri "http://localhost:10180/api/auth/login" -Method POST -Body $loginData -ContentType "application/json" -WebSession $session
    Write-Host "Login: $($loginResp.success)"
    Write-Host "User: $($loginResp.user.username)"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}

# Test 4: API Endpoints
Write-Host "`n4. API Endpoints:"

# Public endpoint
try {
    $analytics = Invoke-RestMethod -Uri "http://localhost:10180/analytics-advanced" -Method GET
    Write-Host "Analytics: $($analytics.status)"
} catch {
    Write-Host "Analytics: FAILED"
}

# Protected endpoints
$endpoints = @("ingestion/status", "tracing/status", "tracing/dependencies")
foreach ($endpoint in $endpoints) {
    try {
        Invoke-RestMethod -Uri "http://localhost:10180/api/$endpoint" -Method GET -WebSession $session | Out-Null
        Write-Host "${endpoint}: OK"
    } catch {
        Write-Host "${endpoint}: FAILED"
    }
}

# Test 5: Database Operations
Write-Host "`n5. Database Operations:"
try {
    $logs = Invoke-RestMethod -Uri "http://localhost:10180/api/logs" -Method GET -WebSession $session
    Write-Host "Database Query: OK"
} catch {
    Write-Host "Database Query: FAILED"
}

# Test 6: Web Interface
Write-Host "`n6. Web Interface:"
try {
    $dashboard = Invoke-WebRequest -Uri "http://localhost:10180/dashboard" -WebSession $session -UseBasicParsing
    Write-Host "Dashboard: $($dashboard.StatusCode) - $($dashboard.Content.Length) bytes"
} catch {
    Write-Host "Dashboard: FAILED"
}

# Test 7: Check for Database Errors
Write-Host "`n7. Database Error Check:"
$logs = docker logs enhanced-logging-container 2>&1
$errors = $logs | Select-String -Pattern "SQLITE_ERROR"
if ($errors.Count -eq 0) {
    Write-Host "No SQLite errors found"
} else {
    Write-Host "Found $($errors.Count) SQLite errors"
}

# Test 8: System Components
Write-Host "`n8. System Components:"
$componentLogs = docker logs enhanced-logging-container | Select-String -Pattern "initialized successfully|Server running" | Select-Object -Last 5
foreach ($log in $componentLogs) {
    Write-Host $log.Line.Trim()
}

# Test 9: Resource Usage
Write-Host "`n9. Resource Usage:"
docker stats enhanced-logging-container --no-stream --format "CPU: {{.CPUPerc}} | Memory: {{.MemUsage}}"

Write-Host "`nTest complete."