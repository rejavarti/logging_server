#!/usr/bin/env pwsh
<#
.SYNOPSIS
Comprehensive testing suite for logging-server
.DESCRIPTION
Tests static code analysis, Docker health, API endpoints, HTML rendering, and more
.PARAMETER Verbose
Enable detailed output
.PARAMETER SkipBrowserTests
Skip browser automation tests (requires Puppeteer)
#>

param(
    [switch]$Verbose,
    [switch]$SkipBrowserTests
)

$ErrorActionPreference = "Continue"
$TestResults = @{
    Passed = @()
    Failed = @()
    Warnings = @()
}

function Write-TestResult {
    param(
        [string]$Name,
        [ValidateSet("PASS", "FAIL", "WARN")]$Status,
        [string]$Message,
        [string]$Details
    )
    
    $result = @{
        Name = $Name
        Status = $Status
        Message = $Message
        Details = $Details
        Timestamp = (Get-Date -Format "o")
    }
    
    switch ($Status) {
        "PASS" {
            $TestResults.Passed += $result
            Write-Host "✅ PASS: $Name" -ForegroundColor Green
            if ($Verbose -and $Message) { Write-Host "   $Message" -ForegroundColor Gray }
        }
        "FAIL" {
            $TestResults.Failed += $result
            Write-Host "❌ FAIL: $Name" -ForegroundColor Red
            Write-Host "   $Message" -ForegroundColor Yellow
            if ($Details) { Write-Host "   Details: $Details" -ForegroundColor Gray }
        }
        "WARN" {
            $TestResults.Warnings += $result
            Write-Host "⚠️  WARN: $Name" -ForegroundColor Yellow
            if ($Message) { Write-Host "   $Message" -ForegroundColor Gray }
        }
    }
}

Write-Host "`n🧪 COMPREHENSIVE TEST SUITE" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Cyan

# ============================================================================
# PHASE 1: SOURCE CODE STATIC ANALYSIS
# ============================================================================
Write-Host "`n📂 PHASE 1: Source Code Static Analysis" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray

Write-Host "`n[1.1] Checking dashboard.js syntax..."
$dashboardPath = ".\routes\dashboard.js"
if (Test-Path $dashboardPath) {
    $content = Get-Content $dashboardPath -Raw
    
    # Test 1.1: Check for escaped single quotes in onclick handlers
    Write-Host "[1.2] Detecting escaped quote issues..."
    $badEscapesOnclick = Select-String -Path $dashboardPath -Pattern "onclick=`"[^`"]*\\\'[^`"]*`"" -AllMatches
    if ($badEscapesOnclick.Matches.Count -eq 0) {
        Write-TestResult -Name "Static: Onclick Escaping" -Status "PASS" `
            -Message "No escaped single quotes in onclick handlers"
    } else {
        Write-TestResult -Name "Static: Onclick Escaping" -Status "FAIL" `
            -Message "Found $($badEscapesOnclick.Matches.Count) onclick handlers with escaped quotes"
    }
    
    # Test 1.2: Check onkeypress handlers
    $badEscapesKeypress = Select-String -Path $dashboardPath -Pattern "onkeypress=`"[^`"]*\\\'[^`"]*`"" -AllMatches
    if ($badEscapesKeypress.Matches.Count -eq 0) {
        Write-TestResult -Name "Static: Onkeypress Escaping" -Status "PASS" `
            -Message "No escaped single quotes in onkeypress handlers"
    } else {
        Write-TestResult -Name "Static: Onkeypress Escaping" -Status "FAIL" `
            -Message "Found $($badEscapesKeypress.Matches.Count) onkeypress handlers with escaped quotes"
    }
    
    # Test 1.3: Check for function definitions
    Write-Host "[1.3] Verifying function definitions..."
    $requiredFunctions = @(
        'initializeWidgetData',
        'testWebhookFromWidget',
        'executeCustomQuery',
        'calculateMetricFormula',
        'applyDataTransform',
        'applyBookmarkQuery'
    )
    
    foreach ($func in $requiredFunctions) {
        if ($content -match "function\s+$func\s*\(") {
            Write-TestResult -Name "Static: Function '$func' Definition" -Status "PASS" `
                -Message "Function defined in code"
        } else {
            Write-TestResult -Name "Static: Function '$func' Definition" -Status "FAIL" `
                -Message "Function not found in code"
        }
    }
    
    # Test 1.4: Check for window object exposures
    Write-Host "[1.4] Verifying window object exposures..."
    foreach ($func in $requiredFunctions) {
        if ($content -match "window\.$func\s*=") {
            Write-TestResult -Name "Static: Function '$func' Exposed" -Status "PASS" `
                -Message "Function exposed on window object"
        } else {
            Write-TestResult -Name "Static: Function '$func' Exposed" -Status "FAIL" `
                -Message "Function not exposed on window object"
        }
    }
    
    # Test 1.5: Check line count (truncation detection)
    $lineCount = ($content -split "`n").Count
    if ($lineCount -gt 3000) {
        Write-TestResult -Name "Static: File Integrity" -Status "PASS" `
            -Message "dashboard.js has $lineCount lines (expected > 3000)"
    } else {
        Write-TestResult -Name "Static: File Integrity" -Status "FAIL" `
            -Message "dashboard.js only has $lineCount lines (possible truncation)"
    }
    
} else {
    Write-TestResult -Name "Static: File Existence" -Status "FAIL" `
        -Message "dashboard.js not found at $dashboardPath"
}

# ============================================================================
# PHASE 2: DOCKER CONTAINER HEALTH
# ============================================================================
Write-Host "`n🐋 PHASE 2: Docker Container Health" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray

Write-Host "`n[2.1] Checking container status..."
$containerName = "Rejavarti-Logging-Server"
$containerInfo = docker ps -a --filter "name=$containerName" --format "{{.Names}}|{{.Status}}|{{.Ports}}" | Select-Object -First 1

if ($containerInfo) {
    $parts = $containerInfo -split '\|'
    $status = $parts[1]
    
    if ($status -match "Up") {
        Write-TestResult -Name "Docker: Container Running" -Status "PASS" `
            -Message "Container is running: $status"
    } else {
        Write-TestResult -Name "Docker: Container Running" -Status "FAIL" `
            -Message "Container not running: $status"
    }
} else {
    Write-TestResult -Name "Docker: Container Exists" -Status "FAIL" `
        -Message "Container '$containerName' not found"
}

Write-Host "`n[2.2] Checking container logs..."
$logs = docker logs $containerName --tail 100 2>&1 | Out-String

# Test 2.2: Check for success markers
$routesConfigured = $logs -match "All routes configured successfully"
$serverRunning = $logs -match "HTTP Server running on port"

if ($routesConfigured -and $serverRunning) {
    Write-TestResult -Name "Docker: Startup Success" -Status "PASS" `
        -Message "Both success markers found in logs"
} elseif ($routesConfigured) {
    Write-TestResult -Name "Docker: Startup Success" -Status "WARN" `
        -Message "Routes configured but server marker missing"
} elseif ($serverRunning) {
    Write-TestResult -Name "Docker: Startup Success" -Status "WARN" `
        -Message "Server running but routes marker missing"
} else {
    Write-TestResult -Name "Docker: Startup Success" -Status "FAIL" `
        -Message "Neither success marker found in logs"
}

# Test 2.3: Check for errors in logs
$errorPatterns = @("Error:", "Exception:", "ECONNREFUSED", "SQLITE_ERROR")
$foundErrors = @()
foreach ($pattern in $errorPatterns) {
    if ($logs -match $pattern) {
        $foundErrors += $pattern
    }
}

if ($foundErrors.Count -eq 0) {
    Write-TestResult -Name "Docker: Log Errors" -Status "PASS" `
        -Message "No error patterns found in recent logs"
} else {
    Write-TestResult -Name "Docker: Log Errors" -Status "FAIL" `
        -Message "Found error patterns: $($foundErrors -join ', ')"
}

# ============================================================================
# PHASE 3: API ENDPOINT VALIDATION
# ============================================================================
Write-Host "`n🌐 PHASE 3: API Endpoint Validation" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray

$baseUrl = "http://localhost:10180"

Write-Host "`n[3.1] Testing health endpoint..."
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -TimeoutSec 5
    if ($health.status -eq "healthy") {
        Write-TestResult -Name "API: Health Endpoint" -Status "PASS" `
            -Message "Server reports healthy status"
    } else {
        Write-TestResult -Name "API: Health Endpoint" -Status "WARN" `
            -Message "Server status: $($health.status)"
    }
} catch {
    Write-TestResult -Name "API: Health Endpoint" -Status "FAIL" `
        -Message "Health check failed: $($_.Exception.Message)"
}

Write-Host "`n[3.2] Testing analytics endpoints..."
$analyticsEndpoints = @(
    @{Path = "/api/analytics/geolocation"; Name = "Geolocation Data"},
    @{Path = "/api/logs/stats?groupBy=level"; Name = "Log Stats by Level"},
    @{Path = "/api/system/metrics"; Name = "System Metrics"}
)

foreach ($endpoint in $analyticsEndpoints) {
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl$($endpoint.Path)" -Method GET -TimeoutSec 5
        if ($response) {
            Write-TestResult -Name "API: $($endpoint.Name)" -Status "PASS" `
                -Message "Endpoint returned data"
        } else {
            Write-TestResult -Name "API: $($endpoint.Name)" -Status "WARN" `
                -Message "Endpoint returned null/empty response"
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-TestResult -Name "API: $($endpoint.Name)" -Status "WARN" `
                -Message "Requires authentication (401)"
        } else {
            Write-TestResult -Name "API: $($endpoint.Name)" -Status "FAIL" `
                -Message "Request failed: $($_.Exception.Message)"
        }
    }
}

# ============================================================================
# PHASE 4: HTML RENDERING ANALYSIS
# ============================================================================
Write-Host "`n📄 PHASE 4: HTML Rendering Analysis" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray

Write-Host "`n[4.1] Fetching rendered dashboard HTML..."
try {
    $htmlResponse = Invoke-WebRequest -Uri "$baseUrl/" -Method GET -TimeoutSec 10 -UseBasicParsing
    $htmlContent = $htmlResponse.Content
    
    Write-TestResult -Name "HTML: Dashboard Load" -Status "PASS" `
        -Message "Dashboard HTML fetched successfully ($($htmlContent.Length) bytes)"
    
    # Test 4.2: Check for critical elements
    Write-Host "[4.2] Verifying HTML elements..."
    $elements = @{
        'id="chart-geolocation-map"' = "Geolocation Map Container"
        'class="dashboard-grid"' = "Dashboard Grid Container"
        'window.grid =' = "Muuri Grid Assignment"
        'window.initializeWidgetData' = "Widget Initializer Exposure"
    }
    
    foreach ($pattern in $elements.Keys) {
        if ($htmlContent -match [regex]::Escape($pattern)) {
            Write-TestResult -Name "HTML: $($elements[$pattern])" -Status "PASS" `
                -Message "Element found in rendered HTML"
        } else {
            Write-TestResult -Name "HTML: $($elements[$pattern])" -Status "FAIL" `
                -Message "Required element not found"
        }
    }
    
    # Test 4.3: Count script blocks
    $scriptBlocks = ([regex]::Matches($htmlContent, '<script[^>]*>(?!</script>)')).Count
    Write-Host "[4.3] Found $scriptBlocks script blocks"
    Write-TestResult -Name "HTML: Script Blocks" -Status "PASS" `
        -Message "Found $scriptBlocks script blocks"
    
} catch {
    Write-TestResult -Name "HTML: Dashboard Load" -Status "FAIL" `
        -Message "Failed to fetch HTML: $($_.Exception.Message)"
}

# ============================================================================
# PHASE 5: BROWSER RUNTIME TESTING (Node.js + Puppeteer)
# ============================================================================
if (-not $SkipBrowserTests) {
    Write-Host "`n🌐 PHASE 5: Browser Runtime Testing" -ForegroundColor Cyan
    Write-Host ("-" * 80) -ForegroundColor Gray
    
    Write-Host "`n[5.1] Checking for Node.js and Puppeteer..."
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    $testScriptPath = ".\test-browser-runtime.js"
    
    if ($nodePath -and (Test-Path $testScriptPath)) {
        Write-Host "[5.2] Running browser runtime tests..."
        try {
            $browserTestOutput = node $testScriptPath --url=$baseUrl 2>&1 | Out-String
            Write-Host $browserTestOutput
            
            if ($LASTEXITCODE -eq 0) {
                Write-TestResult -Name "Browser: Runtime Tests" -Status "PASS" `
                    -Message "All browser tests passed"
            } else {
                Write-TestResult -Name "Browser: Runtime Tests" -Status "FAIL" `
                    -Message "Browser tests failed (exit code: $LASTEXITCODE)"
            }
        } catch {
            Write-TestResult -Name "Browser: Runtime Tests" -Status "FAIL" `
                -Message "Browser test execution failed: $($_.Exception.Message)"
        }
    } else {
        Write-TestResult -Name "Browser: Runtime Tests" -Status "WARN" `
            -Message "Skipped: Node.js or test-browser-runtime.js not found"
    }
} else {
    Write-Host "`n🌐 PHASE 5: Browser Runtime Testing (SKIPPED)" -ForegroundColor Yellow
}

# ============================================================================
# PHASE 6: DATABASE INTEGRITY
# ============================================================================
Write-Host "`n💾 PHASE 6: Database Integrity" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray

Write-Host "`n[6.1] Checking database file..."
$dbPath = ".\data\logging.db"
if (Test-Path $dbPath) {
    $dbSize = (Get-Item $dbPath).Length / 1KB
    Write-TestResult -Name "Database: File Exists" -Status "PASS" `
        -Message "Database file found ($([math]::Round($dbSize, 2)) KB)"
} else {
    Write-TestResult -Name "Database: File Exists" -Status "WARN" `
        -Message "Database file not found at $dbPath (may be inside container)"
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================
$duration = (Get-Date) - (Get-Date).AddSeconds(-1)
Write-Host "`n" + ("=" * 80) -ForegroundColor Cyan
Write-Host "📊 TEST SUMMARY REPORT" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Cyan

Write-Host "`n✅ PASSED: $($TestResults.Passed.Count)" -ForegroundColor Green
Write-Host "❌ FAILED: $($TestResults.Failed.Count)" -ForegroundColor Red
Write-Host "⚠️  WARNINGS: $($TestResults.Warnings.Count)" -ForegroundColor Yellow
Write-Host "📋 TOTAL: $($TestResults.Passed.Count + $TestResults.Failed.Count + $TestResults.Warnings.Count)" -ForegroundColor Cyan

if ($TestResults.Failed.Count -gt 0) {
    Write-Host "`n❌ CRITICAL FAILURES:" -ForegroundColor Red
    foreach ($failure in $TestResults.Failed) {
        Write-Host "   • $($failure.Name): $($failure.Message)" -ForegroundColor Yellow
    }
}

# Save report
$reportFile = "test-report-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
$TestResults | ConvertTo-Json -Depth 10 | Out-File $reportFile
Write-Host "`n📄 Detailed report saved: $reportFile" -ForegroundColor Gray

# Exit with appropriate code
if ($TestResults.Failed.Count -gt 0) {
    Write-Host "`n❌ TEST SUITE FAILED`n" -ForegroundColor Red
    exit 1
} elseif ($TestResults.Warnings.Count -gt 5) {
    Write-Host "`n⚠️  TEST SUITE PASSED WITH WARNINGS`n" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "`n✅ TEST SUITE PASSED`n" -ForegroundColor Green
    exit 0
}
