<#
Manage container port exposure for the logging server.

Usage examples:
  # Minimal (web + websocket) bound to localhost
  .\scripts\manage-logging-server.ps1 -Web -WebSocket -BindAddress 127.0.0.1

  # Enable Syslog UDP + GELF UDP and expose on all interfaces
  .\scripts\manage-logging-server.ps1 -Web -WebSocket -SyslogUdp -GelfUdp -BindAddress 0.0.0.0

Notes:
- Docker cannot dynamically add/remove published ports on a running container.
  This script recreates the container with only the selected ports.
- For fully dynamic on/off without restart, use host firewall rules instead
  (publish all, block by firewall, enable per need). We can provide a companion
  firewall-sync script if desired.

Secrets:
- Set JWT_SECRET and AUTH_PASSWORD via parameters or a .env file located next to this script:
  scripts/.env (KEY=VALUE per line) or logging-server/.env
#>
[CmdletBinding()]
param(
  [switch]$Web,
  [switch]$WebSocket,
  [switch]$Stream,
  [switch]$Beats,
  [switch]$Fluent,
  [switch]$SyslogTcp,
  [switch]$SyslogUdp,
  [switch]$GelfUdp,
  [switch]$GelfTcp,
  [string]$BindAddress = "127.0.0.1",
  [string]$Image = "rejavarti/logging-server:latest",
  [string]$Name = "rejavarti-logging-server",
  [string]$JwtSecret,
  [SecureString]$AuthPasswordSecure
)

function Get-DotEnvValue {
  param([string]$Key)
  $envFiles = @(
    Join-Path $PSScriptRoot '.env',
    Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
  )
  foreach ($f in $envFiles) {
    if (Test-Path $f) {
      $line = Select-String -Path $f -Pattern "^$Key\s*=\s*(.+)$" -SimpleMatch:$false -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($line) {
        $value = $line.Matches[0].Groups[1].Value.Trim()
        return $value
      }
    }
  }
  return $null
}

if (-not $JwtSecret) { $JwtSecret = Get-DotEnvValue -Key 'JWT_SECRET' }
if (-not $AuthPassword -and -not $AuthPasswordSecure) { $AuthPassword = Get-DotEnvValue -Key 'AUTH_PASSWORD' }

if (-not $JwtSecret) {
  Write-Host "[WARN] JWT_SECRET not provided. Generating a temporary one for this run." -ForegroundColor Yellow
  $JwtSecret = [System.BitConverter]::ToString((New-Object byte[] 64 | ForEach-Object {$_})).Replace('-','')
}
if (-not $AuthPassword -and -not $AuthPasswordSecure) {
  Write-Host "[WARN] AUTH_PASSWORD not provided. Using a random fallback. Change it ASAP." -ForegroundColor Yellow
  $AuthPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 16 | ForEach-Object {[char]$_})
}

# If a secure password was provided, convert to plain text for container env var
if ($AuthPasswordSecure) {
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AuthPasswordSecure)
  try { $AuthPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { if ($ptr -ne [IntPtr]::Zero) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) } }
}

# Default behavior: if no specific exposure switches were provided, enable Web + WebSocket
if (-not ($Web -or $WebSocket -or $Stream -or $Beats -or $Fluent -or $SyslogTcp -or $SyslogUdp -or $GelfUdp -or $GelfTcp)) {
  $Web = $true
  $WebSocket = $true
}

$ports = @()
if ($Web)       { $ports += "$BindAddress:10180:3000" }
if ($WebSocket) { $ports += "$BindAddress:8081:8081" }
if ($Stream)    { $ports += "$BindAddress:8082:8082" }
if ($Beats)     { $ports += "$BindAddress:5044:5044" }
if ($Fluent)    { $ports += "$BindAddress:9880:9880" }
if ($SyslogTcp) { $ports += "$BindAddress:601:601" }
if ($SyslogUdp) { $ports += "$BindAddress:514:514/udp" }
if ($GelfUdp)   { $ports += "$BindAddress:12201:12201/udp" }
if ($GelfTcp)   { $ports += "$BindAddress:12202:12202" }

$portArgs = @()
foreach ($p in $ports) { $portArgs += @('-p', $p) }

Write-Host "[INFO] Recreating container '$Name' with $($ports.Count) published port(s)." -ForegroundColor Cyan

# Stop/remove existing
& docker rm -f $Name *> $null

# Run new container
$runArgs = @('run','-d','--name', $Name, '-e', "JWT_SECRET=$JwtSecret", '-e', "AUTH_PASSWORD=$AuthPassword") + $portArgs + @($Image)

Write-Host "[INFO] docker $($runArgs -join ' ')" -ForegroundColor DarkGray
$cid = & docker @runArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start container. See above for errors."
}

Start-Sleep -Seconds 1
Write-Host "[INFO] Container started: $cid" -ForegroundColor Green
Write-Host "[INFO] Published ports:" -ForegroundColor Cyan
& docker port $Name

Write-Host "[INFO] Health check:" -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -Uri "http://localhost:10180/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  Write-Host " - /health -> $($resp.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host " - /health not responding yet" -ForegroundColor Yellow
}
