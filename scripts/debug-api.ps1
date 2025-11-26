#!/usr/bin/env pwsh

# Debug API endpoints and responses

Write-Host "Checking API endpoint responses..."

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
if (-not $env:AUTH_PASSWORD) { throw "AUTH_PASSWORD must be set" }
$loginData = @{ username="admin"; password=$env:AUTH_PASSWORD } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:10180/api/auth/login" -Method POST -Body $loginData -ContentType "application/json" -WebSession $session | Out-Null

# Check what endpoints exist vs what dashboard expects
$expectedEndpoints = @(
    "/api/logs",
    "/api/dashboards/widget-types", 
    "/api/users",
    "/admin/users",
    "/api/settings"
)

foreach ($endpoint in $expectedEndpoints) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:10180$endpoint" -Method GET -WebSession $session -UseBasicParsing
        Write-Host "$endpoint`: $($response.StatusCode)"
    } catch {
        Write-Host "$endpoint`: $($_.Exception.Response.StatusCode)"
    }
}

Write-Host "`nChecking logs API response format:"
try {
    $logs = Invoke-RestMethod -Uri "http://localhost:10180/api/logs" -Method GET -WebSession $session
    Write-Host "Logs response type: $($logs.GetType().Name)"
    if ($logs.logs) {
        Write-Host "Has logs property: Yes"
    } else {
        Write-Host "Has logs property: No - Dashboard expects logs array"
    }
} catch {
    Write-Host "Logs API failed"
}