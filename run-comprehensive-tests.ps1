# COMPREHENSIVE TEST RUNNER WITH TIMEOUT PROTECTION
# Ensures tests complete and output is captured

Write-Host "🚀 COMPREHENSIVE TEST SUITE RUNNER" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Clean test database
Write-Host "🧹 Cleaning test database..." -ForegroundColor Yellow
Remove-Item -Path ".\data\enterprise_logs.db" -ErrorAction SilentlyContinue
Write-Host "✅ Database cleaned" -ForegroundColor Green
Write-Host ""

# Run tests with timeout
Write-Host "🧪 Running comprehensive test suite..." -ForegroundColor Yellow
Write-Host "⏱️  Maximum test time: 5 minutes" -ForegroundColor Gray
Write-Host ""

# Create a job to run tests
$testJob = Start-Job -ScriptBlock {
    param($testPath)
    Set-Location $testPath
    npm test 2>&1
} -ArgumentList (Get-Location).Path

# Wait for job with timeout (5 minutes)
$timeout = 300 # 5 minutes
$elapsed = 0
$interval = 5

while ($elapsed -lt $timeout -and $testJob.State -eq 'Running') {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    
    # Show progress
    $percent = [math]::Round(($elapsed / $timeout) * 100)
    Write-Progress -Activity "Running Tests" -Status "$elapsed seconds elapsed" -PercentComplete $percent
}

# Check if job completed
if ($testJob.State -eq 'Running') {
    Write-Host ""
    Write-Host "⚠️  TIMEOUT: Tests did not complete within $timeout seconds" -ForegroundColor Red
    Write-Host "🛑 Stopping test job..." -ForegroundColor Yellow
    Stop-Job -Job $testJob
    Remove-Job -Job $testJob -Force
    Write-Host "❌ Test suite terminated due to timeout" -ForegroundColor Red
    exit 1
} else {
    # Get test output
    Write-Progress -Activity "Running Tests" -Completed
    Write-Host ""
    Write-Host "📊 Test Results:" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    $output = Receive-Job -Job $testJob
    $output | ForEach-Object { Write-Host $_ }
    
    # Get exit code
    $exitCode = 0
    if ($output -match "FAIL") {
        $exitCode = 1
    }
    
    Remove-Job -Job $testJob -Force
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    if ($exitCode -eq 0) {
        Write-Host "✅ TEST SUITE PASSED" -ForegroundColor Green
    } else {
        Write-Host "❌ TEST SUITE FAILED" -ForegroundColor Red
    }
    
    Write-Host "⏱️  Completed in $elapsed seconds" -ForegroundColor Gray
    Write-Host ""
    
    exit $exitCode
}
