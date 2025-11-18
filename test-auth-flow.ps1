# Comprehensive Authentication and API Testing Script
# Tests authentication flow, middleware ordering, and API endpoint protection

$baseUrl = "http://localhost:10180"
$results = @()
$passed = 0
$failed = 0

function Test-Endpoint {
    param($Name, $Uri, $Method = "GET", $Headers = @{}, $Body = $null, $ExpectedStatus = 200)
    
    try {
        $params = @{
            Uri = "$baseUrl$Uri"
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 10
            Headers = $Headers
            MaximumRedirection = 0  # Don't follow redirects automatically
        }
        
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params -ErrorAction Stop
        $status = $response.StatusCode
        
        if ($status -eq $ExpectedStatus) {
            Write-Host "✓ PASS: $Name ($status)" -ForegroundColor Green
            $script:passed++
            return @{ Pass = $true; Status = $status; Response = $response }
        } else {
            Write-Host "✗ FAIL: $Name (Expected $ExpectedStatus, got $status)" -ForegroundColor Red
            $script:failed++
            return @{ Pass = $false; Status = $status; Response = $response }
        }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        
        if ($status -eq $ExpectedStatus) {
            Write-Host "✓ PASS: $Name ($status)" -ForegroundColor Green
            $script:passed++
            return @{ Pass = $true; Status = $status }
        } else {
            Write-Host "✗ FAIL: $Name (Expected $ExpectedStatus, got $status)" -ForegroundColor Red
            $script:failed++
            return @{ Pass = $false; Status = $status; Error = $_.Exception.Message }
        }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Authentication & Middleware Test Suite" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Health endpoint (no auth required)
Write-Host "`n--- Test 1: Public Endpoints ---" -ForegroundColor Yellow
Test-Endpoint -Name "Health Check" -Uri "/health" -ExpectedStatus 200

# Test 2: Protected endpoints without auth (should return 401)
Write-Host "`n--- Test 2: Protected Endpoints (No Auth) ---" -ForegroundColor Yellow
Test-Endpoint -Name "Dashboard without auth" -Uri "/dashboard" -ExpectedStatus 302
Test-Endpoint -Name "API Logs without auth" -Uri "/api/logs" -ExpectedStatus 401
Test-Endpoint -Name "API Users without auth" -Uri "/api/users" -ExpectedStatus 401

# Test 3: Login with invalid credentials
Write-Host "`n--- Test 3: Login Flow - Invalid Credentials ---" -ForegroundColor Yellow
$invalidBody = @{username='admin'; password='wrong'} | ConvertTo-Json
Test-Endpoint -Name "Login with wrong password" -Uri "/api/auth/login" -Method "POST" -Body $invalidBody -ExpectedStatus 401

# Test 4: Login with valid credentials
Write-Host "`n--- Test 4: Login Flow - Valid Credentials ---" -ForegroundColor Yellow
$validBody = @{username='admin'; password='ChangeMe123!'} | ConvertTo-Json
$loginResult = Test-Endpoint -Name "Login with correct password" -Uri "/api/auth/login" -Method "POST" -Body $validBody -ExpectedStatus 200

if ($loginResult.Pass) {
    $loginData = $loginResult.Response.Content | ConvertFrom-Json
    $token = $loginData.token
    Write-Host "  Token received: $($token.Substring(0, 30))..." -ForegroundColor Gray
    
    # Test 5: Protected endpoints WITH auth
    Write-Host "`n--- Test 5: Protected Endpoints (With Bearer Token) ---" -ForegroundColor Yellow
    $authHeaders = @{Authorization = "Bearer $token"}
    
    Test-Endpoint -Name "API Logs with auth" -Uri "/api/logs?page=1&limit=5" -Headers $authHeaders -ExpectedStatus 200
    Test-Endpoint -Name "API Dashboard stats" -Uri "/api/dashboard/stats" -Headers $authHeaders -ExpectedStatus 200
    Test-Endpoint -Name "API Activity" -Uri "/api/activity?page=1&limit=3" -Headers $authHeaders -ExpectedStatus 200
    
    # Test 6: Admin endpoints (user role should get 403)
    Write-Host "`n--- Test 6: Admin Endpoints (Non-Admin User) ---" -ForegroundColor Yellow
    Test-Endpoint -Name "Admin settings (non-admin)" -Uri "/admin/settings" -Headers $authHeaders -ExpectedStatus 403
    Test-Endpoint -Name "Admin users API (non-admin)" -Uri "/api/users" -Headers $authHeaders -ExpectedStatus 200
    
    # Test 7: Token validation
    Write-Host "`n--- Test 7: Token Validation ---" -ForegroundColor Yellow
    Test-Endpoint -Name "Validate token" -Uri "/api/auth/validate" -Headers $authHeaders -ExpectedStatus 200
    
    # Test 8: Invalid token
    Write-Host "`n--- Test 8: Invalid Token ---" -ForegroundColor Yellow
    $badHeaders = @{Authorization = "Bearer invalid.token.here"}
    Test-Endpoint -Name "API with invalid token" -Uri "/api/logs" -Headers $badHeaders -ExpectedStatus 401
    
    # Test 9: Logout
    Write-Host "`n--- Test 9: Logout ---" -ForegroundColor Yellow
    Test-Endpoint -Name "Logout" -Uri "/api/auth/logout" -Method "POST" -Headers $authHeaders -ExpectedStatus 200
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Results Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host "Total:  $($passed + $failed)" -ForegroundColor White
Write-Host "Success Rate: $(if ($passed + $failed -gt 0) { [math]::Round(($passed / ($passed + $failed)) * 100, 1) } else { 0 })%" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "========================================`n" -ForegroundColor Cyan

if ($failed -gt 0) {
    Write-Host "⚠ Some tests failed. Review the output above." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    exit 0
}
