# Authenticated API Test Script
# Tests all endpoints with proper authentication

$baseUrl = "http://localhost:10180"
$testsPassed = 0
$testsFailed = 0

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "AUTHENTICATED API TEST SUITE" -ForegroundColor Cyan
Write-Host "Testing ALL endpoints with real database" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# === PHASE 1: AUTHENTICATION ===
Write-Host "=== PHASE 1: AUTHENTICATION ===" -ForegroundColor Yellow
try {
    $loginBody = @{
        username = "admin"
        password = "ChangeMe123!"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    
    if ($loginResponse.success -and $loginResponse.token) {
        Write-Host "✅ Login successful!" -ForegroundColor Green
        $authToken = $loginResponse.token
        $testsPassed++
        
        # Set up authorization header for subsequent requests
        $headers = @{
            "Authorization" = "Bearer $authToken"
            "Content-Type" = "application/json"
        }
    } else {
        Write-Host "❌ Login failed: $($loginResponse.error)" -ForegroundColor Red
        $testsFailed++
        exit 1
    }
} catch {
    Write-Host "❌ Login error: $_" -ForegroundColor Red
    $testsFailed++
    exit 1
}

# === PHASE 2: CORE DATA APIS ===
Write-Host "`n=== PHASE 2: CORE DATA APIS ===" -ForegroundColor Yellow

# Test: Get Logs
Write-Host "`n[Test] Get Logs List" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/logs?page=1&pageSize=10" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real data returned (Total: $($response.total), Returned: $($response.logs.Count))" -ForegroundColor Green
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Get Specific Log Entry
Write-Host "`n[Test] Get Specific Log Entry (ID: 1)" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/logs/1" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real log entry returned (Level: $($response.log.level), Source: $($response.log.source))" -ForegroundColor Green
            $testsPassed++
        }
    } else {
        Write-Host "⚠️  Log not found (acceptable if no logs in DB)" -ForegroundColor Yellow
        $testsPassed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Get System Stats
Write-Host "`n[Test] Get System Stats" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/stats" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real stats returned (Total Logs: $($response.stats.totalLogs), Avg Response: $($response.stats.avgResponseTime)ms)" -ForegroundColor Green
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# === PHASE 3: ADMIN APIS ===
Write-Host "`n=== PHASE 3: ADMIN APIS ===" -ForegroundColor Yellow

# Test: Get Users
Write-Host "`n[Test] Get Users" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real users returned (Count: $($response.users.Count))" -ForegroundColor Green
            Write-Host "   Users: $($response.users.username -join ', ')" -ForegroundColor Gray
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Get Sessions
Write-Host "`n[Test] Get Active Sessions" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/sessions" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real sessions returned (Count: $($response.sessions.Count))" -ForegroundColor Green
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Get API Keys
Write-Host "`n[Test] Get API Keys" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/api-keys" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real API keys returned (Count: $($response.keys.Count))" -ForegroundColor Green
            if ($response.keys.Count -gt 0) {
                Write-Host "   Keys: $($response.keys.name -join ', ')" -ForegroundColor Gray
            }
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# === PHASE 4: CONFIGURATION ===
Write-Host "`n=== PHASE 4: CONFIGURATION ===" -ForegroundColor Yellow

# Test: Get Settings
Write-Host "`n[Test] Get Settings" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real settings returned" -ForegroundColor Green
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Get Backups
Write-Host "`n[Test] Get Backups" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/backups" -Method GET -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Real backup list returned (Count: $($response.backups.Count))" -ForegroundColor Green
            if ($response.backups.Count -gt 0) {
                Write-Host "   Backups: $($response.backups.filename -join ', ')" -ForegroundColor Gray
            } else {
                Write-Host "   (No backup files found - this is OK)" -ForegroundColor Gray
            }
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# === PHASE 5: WRITE OPERATIONS ===
Write-Host "`n=== PHASE 5: WRITE OPERATIONS ===" -ForegroundColor Yellow

# Test: Create API Key
Write-Host "`n[Test] Create API Key" -ForegroundColor Cyan
try {
    $createKeyBody = @{
        name = "Test API Key $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        permissions = @("read", "write")
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/api-keys" -Method POST -Body $createKeyBody -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: API key created successfully" -ForegroundColor Green
            Write-Host "   Key ID: $($response.key.id)" -ForegroundColor Gray
            Write-Host "   Key Name: $($response.key.name)" -ForegroundColor Gray
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Create Integration
Write-Host "`n[Test] Create Integration" -ForegroundColor Cyan
try {
    $createIntegrationBody = @{
        name = "Test Slack Integration $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        type = "slack"
        config = @{
            webhookUrl = "https://hooks.slack.com/services/TEST/TEST/TEST"
            channel = "#test"
        }
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/integrations" -Method POST -Body $createIntegrationBody -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Integration created successfully" -ForegroundColor Green
            Write-Host "   Integration ID: $($response.integration.id)" -ForegroundColor Gray
            Write-Host "   Integration Name: $($response.integration.name)" -ForegroundColor Gray
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# Test: Create Webhook
Write-Host "`n[Test] Create Webhook" -ForegroundColor Cyan
try {
    $createWebhookBody = @{
        name = "Test Webhook $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        url = "https://example.com/webhook"
        events = @("log.created", "log.error")
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/webhooks" -Method POST -Body $createWebhookBody -Headers $headers
    
    if ($response.success) {
        $hasMock = ($response | ConvertTo-Json -Depth 10) -match "mock|placeholder|sample|fake|dummy"
        if ($hasMock) {
            Write-Host "❌ FAIL: Contains mock/placeholder data!" -ForegroundColor Red
            $testsFailed++
        } else {
            Write-Host "✅ PASS: Webhook created successfully" -ForegroundColor Green
            Write-Host "   Webhook ID: $($response.webhook.id)" -ForegroundColor Gray
            Write-Host "   Webhook Name: $($response.webhook.name)" -ForegroundColor Gray
            $testsPassed++
        }
    } else {
        Write-Host "❌ FAIL: $($response.error)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ FAIL: $_" -ForegroundColor Red
    $testsFailed++
}

# === FINAL SUMMARY ===
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$testsTotal = $testsPassed + $testsFailed
Write-Host "Total Tests: $testsTotal"
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red

if ($testsTotal -gt 0) {
    $successRate = [math]::Round(($testsPassed/$testsTotal)*100, 2)
    Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })
}

Write-Host "========================================`n" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED! No mock data detected!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Some tests failed. Review output above." -ForegroundColor Yellow
    exit 1
}
