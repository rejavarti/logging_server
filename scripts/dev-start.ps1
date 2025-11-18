# Dev Start Script (Windows PowerShell)
# - Frees common ports used by the app
# - Starts the server and keeps the console attached

param(
    [int] $Port = 3000,
    [int] $WsPort = 8081,
    [int] $StreamPort = 8082
)

Write-Host "🔧 Preparing environment..." -ForegroundColor Cyan

function Stop-ListeningPort($p) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $procId = $conn.OwningProcess
            Write-Host "• Killing PID $procId on port $p" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        } else {
            Write-Host "• No listener on port $p" -ForegroundColor DarkGray
        }
    } catch { Write-Host "• Skipped port $p (no permission or not in use)" -ForegroundColor DarkGray }
}

# Free common app ports
Stop-ListeningPort $Port
Stop-ListeningPort $WsPort
Stop-ListeningPort $StreamPort

# Optionally set ports for this session
$env:PORT = "$Port"
$env:WS_PORT = "$WsPort"
$env:STREAM_PORT = "$StreamPort"

# Start the server
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
Set-Location $root

Write-Host "🚀 Starting server on http://localhost:$Port/dashboard" -ForegroundColor Green
Write-Host "   (WS: $WsPort, Stream: $StreamPort)" -ForegroundColor Green

# Execute Node directly so this console stays attached
node server.js

# If node exits, show code
$code = $LASTEXITCODE
Write-Host "❌ Server exited with code $code" -ForegroundColor Red
exit $code
