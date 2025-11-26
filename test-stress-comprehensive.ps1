<#
.SYNOPSIS
    Comprehensive Stress Test for Rejavarti Logging Server
    
.DESCRIPTION
    Multi-phase stress testing suite that validates system performance under various load conditions:
    - Phase 1: Sustained Load Test (requests per second over duration)
    - Phase 2: Database Ingestion Stress (bulk log creation)
    - Phase 3: Memory Leak Detection (long-running monitoring)
    - Phase 4: WebSocket Connection Stress (concurrent connections)
    - Phase 5: Combined Load Test (all operations simultaneously)
    
.PARAMETER ServerUrl
    The base URL of the logging server (default: http://localhost:10180)
    
.PARAMETER Username
    Admin username for authentication (default: admin)
    
.PARAMETER SecurePassword
    SecureString password for authentication
    
.PARAMETER Duration
    Duration for sustained load test in seconds (default: 300 = 5 minutes)
    
.PARAMETER RequestsPerSecond
    Target requests per second for sustained load (default: 50)
    
.PARAMETER BulkLogCount
    Number of logs to create in ingestion test (default: 10000)
    
.PARAMETER WebSocketConnections
    Number of concurrent WebSocket connections (default: 100)
    
.PARAMETER MemoryMonitorDuration
    Duration for memory leak detection in seconds (default: 600 = 10 minutes)
    
.PARAMETER CombinedLoadDuration
    Duration for combined load test in seconds (default: 180 = 3 minutes)
    
.PARAMETER SkipPhases
    Comma-separated list of phases to skip (e.g., "3,4")
    
.PARAMETER OutputPath
    Path to save detailed results JSON file (default: ./stress-test-results.json)
    
.EXAMPLE
    .\test-stress-comprehensive.ps1 -SecurePassword (ConvertTo-SecureString "ChangeMe123!" -AsPlainText -Force)
    
.EXAMPLE
    .\test-stress-comprehensive.ps1 -Duration 600 -RequestsPerSecond 100 -BulkLogCount 50000 -SecurePassword $pwd
    
.EXAMPLE
    .\test-stress-comprehensive.ps1 -SkipPhases "3,4" -SecurePassword $pwd
#>

[CmdletBinding()]
param(
    [string]$ServerUrl = "http://localhost:10180",
    [string]$Username = "admin",
    [Parameter(Mandatory=$true)]
    [SecureString]$SecurePassword,
    [int]$Duration = 300,
    [int]$RequestsPerSecond = 50,
    [int]$BulkLogCount = 10000,
    [int]$WebSocketConnections = 100,
    [int]$MemoryMonitorDuration = 600,
    [int]$CombinedLoadDuration = 180,
    [string]$SkipPhases = "",
    [string]$OutputPath = "./stress-test-results.json"
)

# Convert SecureString to plain text for API calls
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
$AuthSecretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Check if server is running locally and needs restart with DISABLE_RATE_LIMIT
Write-Host "Checking if server needs to be restarted with rate limiting disabled..." -ForegroundColor Yellow
$containerName = "Rejavarti-Logging-Server"
$containerRunning = docker ps --filter "name=$containerName" --format "{{.Names}}" 2>$null

if ($containerRunning -eq $containerName) {
    Write-Host "Server container is running. Restarting with DISABLE_RATE_LIMIT=true..." -ForegroundColor Yellow
    
    # Stop and remove existing container
    docker stop $containerName 2>&1 | Out-Null
    docker rm $containerName 2>&1 | Out-Null
    
    # Get current directory for volume mount
    $dataPath = Join-Path $PSScriptRoot "data"
    
    # Generate JWT secret if not exists
    $jwtSecret = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { 
        # Generate a secure random secret
        -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    }
    
    # Start container with rate limiting disabled
    docker run -d --name $containerName `
        -p 10180:10180 `
        -v "${dataPath}:/app/data" `
        -e NODE_ENV=production `
        -e DISABLE_RATE_LIMIT=true `
        -e JWT_SECRET=$jwtSecret `
        -e AUTH_PASSWORD=ChangeMe123! `
        --restart unless-stopped `
        rejavarti/logging-server:latest 2>&1 | Out-Null
    
    Write-Host "Waiting for server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 8
    
    # Verify server started
    try {
        $health = Invoke-RestMethod -Uri "$ServerUrl/health" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "✓ Server restarted with rate limiting disabled" -ForegroundColor Green
    } catch {
        Write-Host "✗ Server failed to start. Check logs: docker logs $containerName" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Server not running in Docker. Please ensure DISABLE_RATE_LIMIT=true is set." -ForegroundColor Yellow
}

# Global test results
$script:TestResults = @{
    StartTime = Get-Date
    ServerUrl = $ServerUrl
    Phases = @()
    Summary = @{}
}

# Helper: Write colored output
function Write-TestHeader {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Write-TestResult {
    param([string]$Message, [string]$Status)
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
        "INFO" { "White" }
        default { "White" }
    }
    Write-Host "[$Status] $Message" -ForegroundColor $color
}

# Helper: Authenticate and get token
function Get-AuthToken {
    try {
        $loginBody = @{ username = $Username; password = $AuthSecretPlain } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$ServerUrl/api/auth/login" -Method POST -Body $loginBody -ContentType 'application/json' -ErrorAction Stop
        return $response.token
    } catch {
        Write-TestResult "Authentication failed: $_" "FAIL"
        return $null
    }
}

# Helper: Get current memory usage
function Get-ServerMemoryUsage {
    param([string]$Token)
    try {
        $metrics = Invoke-RestMethod -Uri "$ServerUrl/api/system/metrics" -Headers @{Authorization="Bearer $Token"} -ErrorAction Stop
        return [math]::Round($metrics.memoryUsage, 2)
    } catch {
        return $null
    }
}

# Helper: Get database size
function Get-DatabaseSize {
    try {
        $dbPath = Join-Path $PSScriptRoot "data\databases\enterprise_logs.db"
        if (Test-Path $dbPath) {
            $sizeBytes = (Get-Item $dbPath).Length
            return [math]::Round($sizeBytes / 1MB, 2)
        }
        return $null
    } catch {
        return $null
    }
}

# Parse skip phases
$skipPhasesList = @()
if ($SkipPhases) {
    $skipPhasesList = $SkipPhases -split ',' | ForEach-Object { [int]$_.Trim() }
}

# ============================================================
# PHASE 1: SUSTAINED LOAD TEST
# ============================================================
if (1 -notin $skipPhasesList) {
    Write-TestHeader "PHASE 1: SUSTAINED LOAD TEST ($Duration seconds @ $RequestsPerSecond req/s)"
    
    $phase1Results = @{
        Phase = 1
        Name = "Sustained Load Test"
        Duration = $Duration
        TargetRPS = $RequestsPerSecond
        StartTime = Get-Date
        Requests = @()
        Success = 0
        Failures = 0
        TotalRequests = 0
        AvgResponseTime = 0
        MaxResponseTime = 0
        MinResponseTime = [int]::MaxValue
        ErrorRate = 0
    }
    
    $token = Get-AuthToken
    if (-not $token) {
        Write-TestResult "Skipping Phase 1 - Authentication failed" "FAIL"
        $script:TestResults.Phases += $phase1Results
    } else {
        $startTime = Get-Date
        $endTime = $startTime.AddSeconds($Duration)
        $intervalMs = [math]::Floor(1000 / $RequestsPerSecond)
        
        $endpoints = @(
            "/api/dashboard/widgets",
            "/api/logs?limit=50",
            "/api/logs/stats?groupBy=level",
            "/api/logs/stats?groupBy=source",
            "/api/system/metrics",
            "/api/integrations"
        )
        
        Write-TestResult "Starting sustained load for $Duration seconds..." "INFO"
        Write-TestResult "Target: $RequestsPerSecond requests/second" "INFO"
        
        $progressCount = 0
        while ((Get-Date) -lt $endTime) {
            $endpoint = $endpoints | Get-Random
            $requestStart = Get-Date
            
            try {
                $response = Invoke-RestMethod -Uri "$ServerUrl$endpoint" -Headers @{Authorization="Bearer $token"} -TimeoutSec 5 -ErrorAction Stop
                $requestEnd = Get-Date
                $responseTime = ($requestEnd - $requestStart).TotalMilliseconds
                
                $phase1Results.Success++
                $phase1Results.Requests += @{
                    Endpoint = $endpoint
                    ResponseTime = $responseTime
                    Status = "Success"
                }
                
                if ($responseTime -gt $phase1Results.MaxResponseTime) {
                    $phase1Results.MaxResponseTime = $responseTime
                }
                if ($responseTime -lt $phase1Results.MinResponseTime) {
                    $phase1Results.MinResponseTime = $responseTime
                }
            } catch {
                $phase1Results.Failures++
                $phase1Results.Requests += @{
                    Endpoint = $endpoint
                    Status = "Failed"
                    Error = $_.Exception.Message
                }
            }
            
            $phase1Results.TotalRequests++
            $progressCount++
            
            # Progress update every 100 requests
            if ($progressCount % 100 -eq 0) {
                $elapsed = ((Get-Date) - $startTime).TotalSeconds
                $currentRPS = [math]::Round($progressCount / $elapsed, 2)
                Write-Host "." -NoNewline
                if ($progressCount % 1000 -eq 0) {
                    Write-Host " [$progressCount requests, $currentRPS RPS]"
                }
            }
            
            Start-Sleep -Milliseconds $intervalMs
        }
        
        Write-Host ""
        $phase1Results.EndTime = Get-Date
        $totalDuration = ($phase1Results.EndTime - $phase1Results.StartTime).TotalSeconds
        $actualRPS = [math]::Round($phase1Results.TotalRequests / $totalDuration, 2)
        $phase1Results.ActualRPS = $actualRPS
        $phase1Results.ErrorRate = [math]::Round(($phase1Results.Failures / $phase1Results.TotalRequests) * 100, 2)
        
        if ($phase1Results.Success -gt 0) {
            $successfulRequests = $phase1Results.Requests | Where-Object { $_.Status -eq "Success" }
            $totalResponseTime = ($successfulRequests | Measure-Object -Property ResponseTime -Sum).Sum
            $phase1Results.AvgResponseTime = [math]::Round($totalResponseTime / $phase1Results.Success, 2)
        }
        
        Write-TestResult "Total Requests: $($phase1Results.TotalRequests)" "INFO"
        Write-TestResult "Successful: $($phase1Results.Success)" "INFO"
        Write-TestResult "Failed: $($phase1Results.Failures)" "INFO"
        Write-TestResult "Actual RPS: $actualRPS (target: $RequestsPerSecond)" $(if ($actualRPS -ge ($RequestsPerSecond * 0.9)) { "PASS" } else { "WARN" })
        Write-TestResult "Avg Response Time: $($phase1Results.AvgResponseTime)ms" $(if ($phase1Results.AvgResponseTime -lt 100) { "PASS" } else { "WARN" })
        Write-TestResult "Max Response Time: $($phase1Results.MaxResponseTime)ms" "INFO"
        Write-TestResult "Min Response Time: $($phase1Results.MinResponseTime)ms" "INFO"
        Write-TestResult "Error Rate: $($phase1Results.ErrorRate)%" $(if ($phase1Results.ErrorRate -lt 1) { "PASS" } elseif ($phase1Results.ErrorRate -lt 10) { "WARN" } else { "FAIL" })
        
        $script:TestResults.Phases += $phase1Results
    }
}

# ============================================================
# PHASE 2: DATABASE INGESTION STRESS
# ============================================================
if (2 -notin $skipPhasesList) {
    Write-TestHeader "PHASE 2: DATABASE INGESTION STRESS ($BulkLogCount logs)"
    
    $phase2Results = @{
        Phase = 2
        Name = "Database Ingestion Stress"
        TargetLogs = $BulkLogCount
        StartTime = Get-Date
        LogsCreated = 0
        Failures = 0
        AvgInsertTime = 0
        MaxInsertTime = 0
        MinInsertTime = [int]::MaxValue
        InitialDbSize = 0
        FinalDbSize = 0
        DbGrowth = 0
        InitialMemory = 0
        FinalMemory = 0
        MemoryGrowth = 0
    }
    
    $token = Get-AuthToken
    if (-not $token) {
        Write-TestResult "Skipping Phase 2 - Authentication failed" "FAIL"
        $script:TestResults.Phases += $phase2Results
    } else {
        $phase2Results.InitialDbSize = Get-DatabaseSize
        $phase2Results.InitialMemory = Get-ServerMemoryUsage -Token $token
        
        Write-TestResult "Initial Database Size: $($phase2Results.InitialDbSize) MB" "INFO"
        Write-TestResult "Initial Memory Usage: $($phase2Results.InitialMemory) MB" "INFO"
        Write-TestResult "Creating $BulkLogCount logs..." "INFO"
        
        $levels = @("info", "warn", "error", "debug")
        $sources = @("stress-test", "bulk-ingestion", "load-test", "performance-test")
        $insertTimes = @()
        
        $batchSize = 100
        $batches = [math]::Ceiling($BulkLogCount / $batchSize)
        
        for ($batch = 0; $batch -lt $batches; $batch++) {
            $currentBatchSize = [math]::Min($batchSize, $BulkLogCount - ($batch * $batchSize))
            
            for ($i = 0; $i -lt $currentBatchSize; $i++) {
                $logEntry = @{
                    level = $levels | Get-Random
                    message = "Stress test log entry #$(($batch * $batchSize) + $i + 1) - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')"
                    source = $sources | Get-Random
                    metadata = @{
                        batch = $batch
                        index = $i
                        testType = "ingestion-stress"
                    }
                } | ConvertTo-Json -Compress
                
                $insertStart = Get-Date
                try {
                    $response = Invoke-RestMethod -Uri "$ServerUrl/api/logs" -Method POST -Headers @{Authorization="Bearer $token"} -Body $logEntry -ContentType 'application/json' -ErrorAction Stop
                    $insertEnd = Get-Date
                    $insertTime = ($insertEnd - $insertStart).TotalMilliseconds
                    $insertTimes += $insertTime
                    
                    $phase2Results.LogsCreated++
                    
                    if ($insertTime -gt $phase2Results.MaxInsertTime) {
                        $phase2Results.MaxInsertTime = $insertTime
                    }
                    if ($insertTime -lt $phase2Results.MinInsertTime) {
                        $phase2Results.MinInsertTime = $insertTime
                    }
                } catch {
                    $phase2Results.Failures++
                }
            }
            
            # Progress update
            $progress = [math]::Round((($batch + 1) / $batches) * 100, 0)
            Write-Host "." -NoNewline
            if (($batch + 1) % 10 -eq 0) {
                Write-Host " [$progress% - $($phase2Results.LogsCreated) logs created]"
            }
        }
        
        Write-Host ""
        $phase2Results.EndTime = Get-Date
        $totalDuration = ($phase2Results.EndTime - $phase2Results.StartTime).TotalSeconds
        $phase2Results.Duration = $totalDuration
        $phase2Results.LogsPerSecond = [math]::Round($phase2Results.LogsCreated / $totalDuration, 2)
        
        if ($insertTimes.Count -gt 0) {
            $phase2Results.AvgInsertTime = [math]::Round(($insertTimes | Measure-Object -Average).Average, 2)
        }
        
        Start-Sleep -Seconds 2  # Allow DB to flush
        $phase2Results.FinalDbSize = Get-DatabaseSize
        $phase2Results.FinalMemory = Get-ServerMemoryUsage -Token $token
        $phase2Results.DbGrowth = [math]::Round($phase2Results.FinalDbSize - $phase2Results.InitialDbSize, 2)
        $phase2Results.MemoryGrowth = [math]::Round($phase2Results.FinalMemory - $phase2Results.InitialMemory, 2)
        
        Write-TestResult "Logs Created: $($phase2Results.LogsCreated) / $BulkLogCount" $(if ($phase2Results.LogsCreated -eq $BulkLogCount) { "PASS" } else { "FAIL" })
        Write-TestResult "Failures: $($phase2Results.Failures)" $(if ($phase2Results.Failures -eq 0) { "PASS" } else { "WARN" })
        Write-TestResult "Duration: $totalDuration seconds" "INFO"
        Write-TestResult "Logs per Second: $($phase2Results.LogsPerSecond)" "INFO"
        Write-TestResult "Avg Insert Time: $($phase2Results.AvgInsertTime)ms" $(if ($phase2Results.AvgInsertTime -lt 50) { "PASS" } else { "WARN" })
        Write-TestResult "Max Insert Time: $($phase2Results.MaxInsertTime)ms" "INFO"
        Write-TestResult "Min Insert Time: $($phase2Results.MinInsertTime)ms" "INFO"
        Write-TestResult "Database Growth: $($phase2Results.DbGrowth) MB" "INFO"
        Write-TestResult "Memory Growth: $($phase2Results.MemoryGrowth) MB" $(if ($phase2Results.MemoryGrowth -lt 100) { "PASS" } else { "WARN" })
        
        $script:TestResults.Phases += $phase2Results
    }
}

# ============================================================
# PHASE 3: MEMORY LEAK DETECTION
# ============================================================
if (3 -notin $skipPhasesList) {
    Write-TestHeader "PHASE 3: MEMORY LEAK DETECTION ($MemoryMonitorDuration seconds)"
    
    $phase3Results = @{
        Phase = 3
        Name = "Memory Leak Detection"
        Duration = $MemoryMonitorDuration
        StartTime = Get-Date
        Samples = @()
        InitialMemory = 0
        FinalMemory = 0
        PeakMemory = 0
        MemoryGrowth = 0
        MemoryGrowthPerHour = 0
        LeakDetected = $false
    }
    
    $token = Get-AuthToken
    if (-not $token) {
        Write-TestResult "Skipping Phase 3 - Authentication failed" "FAIL"
        $script:TestResults.Phases += $phase3Results
    } else {
        Write-TestResult "Monitoring memory usage for $MemoryMonitorDuration seconds..." "INFO"
        Write-TestResult "Making continuous requests while monitoring..." "INFO"
        
        $startTime = Get-Date
        $endTime = $startTime.AddSeconds($MemoryMonitorDuration)
        $sampleInterval = 10  # Sample every 10 seconds
        $requestInterval = 0.5  # Make requests every 500ms
        
        $endpoints = @(
            "/api/logs?limit=50",
            "/api/dashboard/widgets",
            "/api/system/metrics",
            "/api/logs/analytics"
        )
        
        $lastSampleTime = $startTime
        $requestCount = 0
        
        while ((Get-Date) -lt $endTime) {
            # Make continuous requests
            $endpoint = $endpoints | Get-Random
            try {
                $response = Invoke-RestMethod -Uri "$ServerUrl$endpoint" -Headers @{Authorization="Bearer $token"} -TimeoutSec 5 -ErrorAction SilentlyContinue
                $requestCount++
            } catch {
                # Ignore request failures in this phase
            }
            
            # Sample memory at intervals
            $now = Get-Date
            if (($now - $lastSampleTime).TotalSeconds -ge $sampleInterval) {
                $currentMemory = Get-ServerMemoryUsage -Token $token
                if ($currentMemory) {
                    $sample = @{
                        Timestamp = $now
                        Memory = $currentMemory
                        ElapsedSeconds = ($now - $startTime).TotalSeconds
                    }
                    $phase3Results.Samples += $sample
                    
                    if ($phase3Results.InitialMemory -eq 0) {
                        $phase3Results.InitialMemory = $currentMemory
                    }
                    if ($currentMemory -gt $phase3Results.PeakMemory) {
                        $phase3Results.PeakMemory = $currentMemory
                    }
                    
                    Write-Host "." -NoNewline
                    if ($phase3Results.Samples.Count % 6 -eq 0) {
                        $elapsed = [math]::Round(($now - $startTime).TotalSeconds, 0)
                        Write-Host " [$elapsed s - Memory: $currentMemory MB - Requests: $requestCount]"
                    }
                }
                $lastSampleTime = $now
            }
            
            Start-Sleep -Milliseconds ($requestInterval * 1000)
        }
        
        Write-Host ""
        $phase3Results.EndTime = Get-Date
        $phase3Results.FinalMemory = Get-ServerMemoryUsage -Token $token
        $phase3Results.RequestCount = $requestCount
        
        # Calculate memory growth
        $phase3Results.MemoryGrowth = [math]::Round($phase3Results.FinalMemory - $phase3Results.InitialMemory, 2)
        $actualDuration = ($phase3Results.EndTime - $phase3Results.StartTime).TotalHours
        $phase3Results.MemoryGrowthPerHour = [math]::Round($phase3Results.MemoryGrowth / $actualDuration, 2)
        
        # Detect leak: >20% absolute growth OR >100 MB/hour growth is concerning
        # This allows normal GC cycles and legitimate caching while catching real leaks
        $growthPercentage = ($phase3Results.MemoryGrowth / $phase3Results.InitialMemory) * 100
        $phase3Results.LeakDetected = ($growthPercentage -gt 20) -or ($phase3Results.MemoryGrowthPerHour -gt 100)
        
        Write-TestResult "Initial Memory: $($phase3Results.InitialMemory) MB" "INFO"
        Write-TestResult "Final Memory: $($phase3Results.FinalMemory) MB" "INFO"
        Write-TestResult "Peak Memory: $($phase3Results.PeakMemory) MB" "INFO"
        Write-TestResult "Memory Growth: $($phase3Results.MemoryGrowth) MB ($([math]::Round($growthPercentage, 2))%)" $(if ($phase3Results.MemoryGrowth -lt 50) { "PASS" } else { "WARN" })
        Write-TestResult "Memory Growth/Hour: $($phase3Results.MemoryGrowthPerHour) MB/hour" $(if (-not $phase3Results.LeakDetected) { "PASS" } else { "FAIL" })
        Write-TestResult "Requests Made: $requestCount" "INFO"
        Write-TestResult "Leak Detected: $($phase3Results.LeakDetected)" $(if (-not $phase3Results.LeakDetected) { "PASS" } else { "FAIL" })
        
        $script:TestResults.Phases += $phase3Results
    }
}

# ============================================================
# PHASE 4: WEBSOCKET CONNECTION STRESS
# ============================================================
if (4 -notin $skipPhasesList) {
    Write-TestHeader "PHASE 4: WEBSOCKET CONNECTION STRESS ($WebSocketConnections connections)"
    
    $phase4Results = @{
        Phase = 4
        Name = "WebSocket Connection Stress"
        TargetConnections = $WebSocketConnections
        StartTime = Get-Date
        ConnectionsEstablished = 0
        ConnectionsFailed = 0
        MessagesReceived = 0
        AvgConnectionTime = 0
        Success = $false
    }
    
    Write-TestResult "Creating Node.js WebSocket stress test script..." "INFO"
    
    $wsTestScript = @"
const WebSocket = require('ws');

const SERVER_URL = '$ServerUrl'.replace('http://', 'ws://').replace('https://', 'wss://');
const WS_URL = SERVER_URL + '/ws';
const TARGET_CONNECTIONS = $WebSocketConnections;
const DURATION = 30000; // 30 seconds

let established = 0;
let failed = 0;
let messagesReceived = 0;
const connectionTimes = [];
const connections = [];

console.log('Starting WebSocket stress test...');
console.log('Target:', TARGET_CONNECTIONS, 'connections');
console.log('URL:', WS_URL);

async function createConnection(index) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const ws = new WebSocket(WS_URL);
        
        const timeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.close();
                failed++;
                resolve();
            }
        }, 5000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            const connectionTime = Date.now() - startTime;
            connectionTimes.push(connectionTime);
            established++;
            connections.push(ws);
            
            if (established % 10 === 0) {
                console.log('Established:', established, '/', TARGET_CONNECTIONS);
            }
            
            resolve();
        });
        
        ws.on('message', (data) => {
            messagesReceived++;
        });
        
        ws.on('error', (err) => {
            clearTimeout(timeout);
            failed++;
            resolve();
        });
        
        ws.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

async function runTest() {
    // Create all connections
    const promises = [];
    for (let i = 0; i < TARGET_CONNECTIONS; i++) {
        promises.push(createConnection(i));
        if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay every 10 connections
        }
    }
    
    await Promise.all(promises);
    
    console.log('\\nAll connection attempts complete');
    console.log('Established:', established);
    console.log('Failed:', failed);
    console.log('Keeping connections alive for', DURATION / 1000, 'seconds...');
    
    // Keep connections alive
    await new Promise(resolve => setTimeout(resolve, DURATION));
    
    // Calculate stats
    const avgConnectionTime = connectionTimes.length > 0 
        ? (connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length).toFixed(2)
        : 0;
    
    // Close all connections
    connections.forEach(ws => {
        try {
            ws.close();
        } catch (e) {}
    });
    
    // Output results as JSON
    const results = {
        established: established,
        failed: failed,
        messagesReceived: messagesReceived,
        avgConnectionTime: parseFloat(avgConnectionTime),
        success: established >= (TARGET_CONNECTIONS * 0.9)
    };
    
    console.log('\\n__RESULTS__');
    console.log(JSON.stringify(results));
}

runTest().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
"@
    
    $wsScriptPath = Join-Path $PSScriptRoot "ws-stress-test.js"
    $wsTestScript | Out-File -FilePath $wsScriptPath -Encoding utf8
    
    try {
        Write-TestResult "Executing WebSocket stress test..." "INFO"
        $output = node $wsScriptPath 2>&1 | Out-String
        
        # Parse results from output
        if ($output -match '__RESULTS__\s*(\{.*\})') {
            $resultsJson = $matches[1]
            $results = $resultsJson | ConvertFrom-Json
            
            $phase4Results.ConnectionsEstablished = $results.established
            $phase4Results.ConnectionsFailed = $results.failed
            $phase4Results.MessagesReceived = $results.messagesReceived
            $phase4Results.AvgConnectionTime = $results.avgConnectionTime
            $phase4Results.Success = $results.success
        } else {
            Write-TestResult "Could not parse WebSocket test results" "WARN"
            Write-TestResult "Output: $output" "INFO"
        }
        
        Remove-Item $wsScriptPath -Force -ErrorAction SilentlyContinue
        
    } catch {
        Write-TestResult "WebSocket test failed: $_" "FAIL"
        $phase4Results.Success = $false
    }
    
    $phase4Results.EndTime = Get-Date
    
    Write-TestResult "Connections Established: $($phase4Results.ConnectionsEstablished) / $WebSocketConnections" $(if ($phase4Results.ConnectionsEstablished -ge ($WebSocketConnections * 0.9)) { "PASS" } else { "FAIL" })
    Write-TestResult "Connections Failed: $($phase4Results.ConnectionsFailed)" $(if ($phase4Results.ConnectionsFailed -lt ($WebSocketConnections * 0.1)) { "PASS" } else { "WARN" })
    Write-TestResult "Messages Received: $($phase4Results.MessagesReceived)" "INFO"
    Write-TestResult "Avg Connection Time: $($phase4Results.AvgConnectionTime)ms" $(if ($phase4Results.AvgConnectionTime -lt 500) { "PASS" } else { "WARN" })
    
    $script:TestResults.Phases += $phase4Results
}

# ============================================================
# PHASE 5: COMBINED LOAD TEST
# ============================================================
if (5 -notin $skipPhasesList) {
    Write-TestHeader "PHASE 5: COMBINED LOAD TEST ($CombinedLoadDuration seconds)"
    
    $phase5Results = @{
        Phase = 5
        Name = "Combined Load Test"
        Duration = $CombinedLoadDuration
        StartTime = Get-Date
        ApiRequests = 0
        LogsCreated = 0
        Errors = 0
        AvgResponseTime = 0
        InitialMemory = 0
        FinalMemory = 0
        MemoryGrowth = 0
    }
    
    $token = Get-AuthToken
    if (-not $token) {
        Write-TestResult "Skipping Phase 5 - Authentication failed" "FAIL"
        $script:TestResults.Phases += $phase5Results
    } else {
        $phase5Results.InitialMemory = Get-ServerMemoryUsage -Token $token
        
        Write-TestResult "Running combined load test for $CombinedLoadDuration seconds..." "INFO"
        Write-TestResult "Simultaneous: API requests + Log creation + WebSocket messages" "INFO"
        
        $startTime = Get-Date
        $endTime = $startTime.AddSeconds($CombinedLoadDuration)
        
        $endpoints = @(
            "/api/dashboard/widgets",
            "/api/logs?limit=100",
            "/api/logs/stats?groupBy=level",
            "/api/system/metrics",
            "/api/integrations",
            "/api/logs/analytics"
        )
        
        $levels = @("info", "warn", "error", "debug")
        $responseTimes = @()
        
        while ((Get-Date) -lt $endTime) {
            # API request
            $endpoint = $endpoints | Get-Random
            $requestStart = Get-Date
            try {
                $response = Invoke-RestMethod -Uri "$ServerUrl$endpoint" -Headers @{Authorization="Bearer $token"} -TimeoutSec 3 -ErrorAction Stop
                $responseTime = ((Get-Date) - $requestStart).TotalMilliseconds
                $responseTimes += $responseTime
                $phase5Results.ApiRequests++
            } catch {
                $phase5Results.Errors++
            }
            
            # Log creation (every 3rd iteration)
            if ($phase5Results.ApiRequests % 3 -eq 0) {
                $logEntry = @{
                    level = $levels | Get-Random
                    message = "Combined load test log #$($phase5Results.LogsCreated + 1)"
                    source = "combined-stress-test"
                } | ConvertTo-Json -Compress
                
                try {
                    Invoke-RestMethod -Uri "$ServerUrl/api/logs" -Method POST -Headers @{Authorization="Bearer $token"} -Body $logEntry -ContentType 'application/json' -TimeoutSec 3 -ErrorAction Stop | Out-Null
                    $phase5Results.LogsCreated++
                } catch {
                    $phase5Results.Errors++
                }
            }
            
            # Progress
            if ($phase5Results.ApiRequests % 50 -eq 0) {
                $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)
                Write-Host "." -NoNewline
                if ($phase5Results.ApiRequests % 500 -eq 0) {
                    Write-Host " [$elapsed s - $($phase5Results.ApiRequests) API requests, $($phase5Results.LogsCreated) logs]"
                }
            }
            
            Start-Sleep -Milliseconds 20
        }
        
        Write-Host ""
        $phase5Results.EndTime = Get-Date
        $phase5Results.FinalMemory = Get-ServerMemoryUsage -Token $token
        $phase5Results.MemoryGrowth = [math]::Round($phase5Results.FinalMemory - $phase5Results.InitialMemory, 2)
        
        if ($responseTimes.Count -gt 0) {
            $phase5Results.AvgResponseTime = [math]::Round(($responseTimes | Measure-Object -Average).Average, 2)
        }
        
        $totalDuration = ($phase5Results.EndTime - $phase5Results.StartTime).TotalSeconds
        $phase5Results.ActualDuration = $totalDuration
        $phase5Results.RequestsPerSecond = [math]::Round($phase5Results.ApiRequests / $totalDuration, 2)
        $phase5Results.ErrorRate = [math]::Round(($phase5Results.Errors / ($phase5Results.ApiRequests + $phase5Results.LogsCreated)) * 100, 2)
        
        Write-TestResult "API Requests: $($phase5Results.ApiRequests)" "INFO"
        Write-TestResult "Logs Created: $($phase5Results.LogsCreated)" "INFO"
        Write-TestResult "Errors: $($phase5Results.Errors)" $(if ($phase5Results.Errors -lt 10) { "PASS" } else { "WARN" })
        Write-TestResult "Error Rate: $($phase5Results.ErrorRate)%" $(if ($phase5Results.ErrorRate -lt 1) { "PASS" } elseif ($phase5Results.ErrorRate -lt 10) { "WARN" } else { "FAIL" })
        Write-TestResult "Requests/Second: $($phase5Results.RequestsPerSecond)" "INFO"
        Write-TestResult "Avg Response Time: $($phase5Results.AvgResponseTime)ms" $(if ($phase5Results.AvgResponseTime -lt 150) { "PASS" } else { "WARN" })
        Write-TestResult "Memory Growth: $($phase5Results.MemoryGrowth) MB" $(if ($phase5Results.MemoryGrowth -lt 100) { "PASS" } else { "WARN" })
        
        $script:TestResults.Phases += $phase5Results
    }
}

# ============================================================
# FINAL SUMMARY
# ============================================================
Write-TestHeader "COMPREHENSIVE STRESS TEST SUMMARY"

$script:TestResults.EndTime = Get-Date
$totalDuration = ($script:TestResults.EndTime - $script:TestResults.StartTime).TotalMinutes

Write-Host ""
Write-Host "Test Duration: $([math]::Round($totalDuration, 2)) minutes" -ForegroundColor White
Write-Host "Phases Executed: $($script:TestResults.Phases.Count)" -ForegroundColor White
Write-Host ""

# Calculate overall statistics
$totalRequests = 0
$totalErrors = 0
$allResponseTimes = @()

foreach ($phase in $script:TestResults.Phases) {
    Write-Host "Phase $($phase.Phase): $($phase.Name)" -ForegroundColor Cyan
    
    switch ($phase.Phase) {
        1 {
            Write-Host "  • Requests: $($phase.TotalRequests)" -ForegroundColor White
            Write-Host "  • Success Rate: $([math]::Round(($phase.Success / $phase.TotalRequests) * 100, 2))%" -ForegroundColor White
            Write-Host "  • Avg Response: $($phase.AvgResponseTime)ms" -ForegroundColor White
            $totalRequests += $phase.TotalRequests
            $totalErrors += $phase.Failures
            if ($phase.AvgResponseTime -gt 0) { $allResponseTimes += $phase.AvgResponseTime }
        }
        2 {
            Write-Host "  • Logs Created: $($phase.LogsCreated)" -ForegroundColor White
            Write-Host "  • Insert Rate: $($phase.LogsPerSecond) logs/sec" -ForegroundColor White
            Write-Host "  • DB Growth: $($phase.DbGrowth) MB" -ForegroundColor White
            $totalRequests += $phase.LogsCreated
            $totalErrors += $phase.Failures
        }
        3 {
            Write-Host "  • Memory Growth: $($phase.MemoryGrowth) MB" -ForegroundColor White
            Write-Host "  • Growth/Hour: $($phase.MemoryGrowthPerHour) MB/hour" -ForegroundColor White
            Write-Host "  • Leak Detected: $($phase.LeakDetected)" -ForegroundColor $(if ($phase.LeakDetected) { "Red" } else { "Green" })
            $totalRequests += $phase.RequestCount
        }
        4 {
            Write-Host "  • Connections: $($phase.ConnectionsEstablished) / $($phase.TargetConnections)" -ForegroundColor White
            Write-Host "  • Messages Received: $($phase.MessagesReceived)" -ForegroundColor White
            Write-Host "  • Avg Connection Time: $($phase.AvgConnectionTime)ms" -ForegroundColor White
        }
        5 {
            Write-Host "  • API Requests: $($phase.ApiRequests)" -ForegroundColor White
            Write-Host "  • Logs Created: $($phase.LogsCreated)" -ForegroundColor White
            Write-Host "  • Error Rate: $($phase.ErrorRate)%" -ForegroundColor White
            if ($phase.AvgResponseTime -gt 0) { $allResponseTimes += $phase.AvgResponseTime }
            $totalRequests += ($phase.ApiRequests + $phase.LogsCreated)
            $totalErrors += $phase.Errors
        }
    }
    Write-Host ""
}

if ($allResponseTimes.Count -gt 0) {
    $overallAvg = [math]::Round(($allResponseTimes | Measure-Object -Average).Average, 2)
    Write-Host "Collected Response Time Samples: $($allResponseTimes.Count)" -ForegroundColor White
    Write-Host "Overall Avg Response Time (Phases 1 & 5): $overallAvg ms" -ForegroundColor White
}

$script:TestResults.Summary = @{
    TotalDuration = $totalDuration
    TotalRequests = $totalRequests
    TotalErrors = $totalErrors
    OverallErrorRate = [math]::Round(($totalErrors / $totalRequests) * 100, 2)
    PhasesExecuted = $script:TestResults.Phases.Count
}

Write-Host "Overall Statistics:" -ForegroundColor Yellow
Write-Host "  • Total Operations: $totalRequests" -ForegroundColor White
Write-Host "  • Total Errors: $totalErrors" -ForegroundColor White
Write-Host "  • Overall Error Rate: $($script:TestResults.Summary.OverallErrorRate)%" -ForegroundColor $(if ($script:TestResults.Summary.OverallErrorRate -lt 1) { "Green" } elseif ($script:TestResults.Summary.OverallErrorRate -lt 10) { "Yellow" } else { "Red" })
Write-Host ""

# Save detailed results
try {
    $script:TestResults | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding utf8
    Write-TestResult "Detailed results saved to: $OutputPath" "INFO"
} catch {
    Write-TestResult "Failed to save results: $_" "WARN"
}

# Overall pass/fail
$overallPass = $script:TestResults.Summary.OverallErrorRate -lt 5
$finalStatus = if ($overallPass) { "PASS" } else { "FAIL" }
$finalColor = if ($overallPass) { "Green" } else { "Red" }

Write-Host ""
Write-Host "========================================" -ForegroundColor $finalColor
Write-Host "OVERALL RESULT: $finalStatus" -ForegroundColor $finalColor
Write-Host "========================================" -ForegroundColor $finalColor
Write-Host ""

if (-not $overallPass) {
    exit 1
}
