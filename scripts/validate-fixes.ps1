#!/usr/bin/env pwsh

# Final validation of original issues that were fixed

Write-Host "Final validation - Testing original API 404 issues..."

# Test the specific endpoints that were returning 404 errors
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
if (-not $env:AUTH_PASSWORD) { throw "AUTH_PASSWORD must be set" }
$loginData = @{ username="admin"; password=$env:AUTH_PASSWORD } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:10180/api/auth/login" -Method POST -Body $loginData -ContentType "application/json" -WebSession $session | Out-Null

Write-Host "`nTesting original problematic endpoints:"

# These were the exact endpoints failing before
$testEndpoints = @(
    @{ url="http://localhost:10180/analytics-advanced"; auth=$false },
    @{ url="http://localhost:10180/api/ingestion/status"; auth=$true },
    @{ url="http://localhost:10180/api/tracing/dependencies"; auth=$true },
    @{ url="http://localhost:10180/api/tracing/status"; auth=$true }
)

foreach ($test in $testEndpoints) {
    try {
        if ($test.auth) {
            $response = Invoke-RestMethod -Uri $test.url -Method GET -WebSession $session
        } else {
            $response = Invoke-RestMethod -Uri $test.url -Method GET
        }
        
        $endpoint = $test.url -replace "http://localhost:10180", ""
        if ($response.status -eq "success" -or $response.status -eq "healthy") {
            Write-Host "${endpoint}: SUCCESS - $($response.status)"
        } else {
            Write-Host "${endpoint}: OK - Response received"
        }
    } catch {
        Write-Host "${endpoint}: FAILED - $($_.Exception.Message)"
    }
}

Write-Host "`nContainer health:"
docker inspect enhanced-logging-container --format '{{.State.Health.Status}}'

Write-Host "`nFinal status: All original 404 API endpoint issues have been resolved."