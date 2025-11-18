# Restart Script for Enterprise Logging Server
# Run this script to stop and restart the server

Write-Host "🔄 Restarting Enterprise Logging Server..." -ForegroundColor Cyan

# Stop any running Node.js processes
Write-Host "⏹️  Stopping existing server..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*nodejs*" } | Stop-Process -Force
Start-Sleep -Seconds 1

# Start the server
Write-Host "▶️  Starting server..." -ForegroundColor Green
Set-Location $PSScriptRoot
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" -NoNewWindow

Write-Host "✅ Server restart initiated!" -ForegroundColor Green
Write-Host "🌐 Dashboard: http://localhost:10180/dashboard" -ForegroundColor Cyan
Write-Host "📊 Check logs in the terminal or data/logs/ folder" -ForegroundColor Gray
