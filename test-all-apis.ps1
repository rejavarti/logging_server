# Comprehensive API Test Suite - Tests EVERY endpoint with real requests
# No mock data, no placeholders - only real database responses

$baseUrl = "http://localhost:10180"
$token = ""  # Will be populated after login

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "COMPREHENSIVE API TEST SUITE" -ForegroundColor Cyan
Write-Host "Testing ALL endpoints for real data" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test counter
$testsPassed = 0
$testsFailed = 0
$testsTotal = 0

function Test-API {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Endpoint,
        [object]$Body = $null,
        [string]$ExpectedField = $null
    )
    
    $global:testsTotal++
    Write-Host "[$global:testsTotal] Testing: $Name" -ForegroundColor Yellow
    Write-Host "    $Method $Endpoint" -ForegroundColor Gray
    
    try {
        $headers = @{ "Content-Type" = "application/json" }
        if ($global:token) {
            $headers["Authorization"] = "Bearer $global:token"
        }
        
        $params = @{
            Uri = "$baseUrl$Endpoint"
            Method = $Method
            Headers = $headers
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        
        # Check for mock data indicators
        if ($response -match "mock|placeholder|sample|fake|dummy") {
            Write-Host "    ❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            Write-Host "    Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor DarkRed
            $global:testsFailed++
            return $false
        }
        
        # Check for expected field
        if ($ExpectedField -and -not ($response.PSObject.Properties.Name -contains $ExpectedField)) {
            Write-Host "    ❌ FAIL: Missing expected field '$ExpectedField'" -ForegroundColor Red
            $global:testsFailed++
            return $false
        }
        
        Write-Host "    ✅ PASS" -ForegroundColor Green
        $global:testsPassed++
        return $true
    }
    catch {
        Write-Host "    ❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $global:testsFailed++
        return $false
    }
}

# Phase 1: Authentication
Write-Host "`n=== PHASE 1: AUTHENTICATION ===" -ForegroundColor Magenta
Test-API -Name "Login" -Method "POST" -Endpoint "/api/auth/login" -Body @{username="admin";password="admin123"} -ExpectedField "token"

# Phase 2: Core Data APIs
Write-Host "`n=== PHASE 2: CORE DATA APIS ===" -ForegroundColor Magenta
Test-API -Name "Get Logs" -Endpoint "/api/logs" -ExpectedField "logs"
Test-API -Name "Get System Stats" -Endpoint "/api/stats" -ExpectedField "stats"
Test-API -Name "Get Dashboard Data" -Endpoint "/dashboard" -ExpectedField "success"

# Phase 3: Admin APIs
Write-Host "`n=== PHASE 3: ADMIN APIS ===" -ForegroundColor Magenta
Test-API -Name "Get Users" -Endpoint "/api/admin/users" -ExpectedField "users"
Test-API -Name "Get Sessions" -Endpoint "/api/admin/sessions" -ExpectedField "sessions"
Test-API -Name "Get API Keys" -Endpoint "/api/api-keys" -ExpectedField "keys"

# Phase 4: Configuration APIs
Write-Host "`n=== PHASE 4: CONFIGURATION ===" -ForegroundColor Magenta
Test-API -Name "Get Settings" -Endpoint "/api/settings" -ExpectedField "settings"
Test-API -Name "Get Themes" -Endpoint "/api/themes/current" -ExpectedField "theme"
Test-API -Name "Get Backups" -Endpoint "/api/backups" -ExpectedField "backups"

# Phase 5: Analytics APIs
Write-Host "`n=== PHASE 5: ANALYTICS ===" -ForegroundColor Magenta
Test-API -Name "Analytics Stats" -Endpoint "/api/analytics/stats" -ExpectedField "stats"
Test-API -Name "Analytics Severities" -Endpoint "/api/analytics/severities" -ExpectedField "severities"
Test-API -Name "Analytics Categories" -Endpoint "/api/analytics/categories" -ExpectedField "categories"

# Phase 6: Write Operations
Write-Host "`n=== PHASE 6: WRITE OPERATIONS ===" -ForegroundColor Magenta
Test-API -Name "Create API Key" -Method "POST" -Endpoint "/api/api-keys" -Body @{name="Test Key";description="Automated test"} -ExpectedField "key"
Test-API -Name "Create Integration" -Method "POST" -Endpoint "/api/integrations" -Body @{name="Test Integration";type="webhook";config=@{url="http://test.local"}} -ExpectedField "integration"
Test-API -Name "Create Webhook" -Method "POST" -Endpoint "/api/webhooks" -Body @{name="Test Webhook";url="http://test.local/hook"} -ExpectedField "webhook"

# Final Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total Tests: $testsTotal" -ForegroundColor White
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red
Write-Host "Success Rate: $([math]::Round(($testsPassed/$testsTotal)*100, 2))%" -ForegroundColor $(if ($testsFailed -eq 0) { "Green" } else { "Yellow" })
Write-Host "========================================`n" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED - NO MOCK DATA DETECTED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  SOME TESTS FAILED - CHECK ABOVE FOR DETAILS" -ForegroundColor Red
    exit 1
}
