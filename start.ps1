# Start Script for Enterprise Logging Server with Auto-Restart

Write-Host "🚀 Starting Enterprise Logging Server with Auto-Restart..." -ForegroundColor Cyan
Write-Host "   Press Ctrl+C twice quickly to stop permanently`n" -ForegroundColor Yellow

Set-Location $PSScriptRoot

while ($true) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting server..." -ForegroundColor Green
    
    & "C:\Program Files\nodejs\node.exe" server.js
    
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Server exited cleanly (restart requested)" -ForegroundColor Yellow
        Write-Host "   Restarting in 3 seconds...`n" -ForegroundColor Cyan
        Start-Sleep -Seconds 3
    } else {
        Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Server crashed (exit code: $exitCode)" -ForegroundColor Red
        Write-Host "   Restarting in 5 seconds...`n" -ForegroundColor Cyan
        Start-Sleep -Seconds 5
    }
}
