#!/usr/bin/env pwsh
# Start server with proper environment variables
$env:JWT_SECRET = "d83f4af035033dc808a37dcd5db25fa5d39d727bb9f85bff69ad5260429dd2711fbf85eff5e854946099052af82970058d0f0aef18e070565dc95bd6a29028b6"
$env:NODE_ENV = "development"
Write-Host "Starting Enhanced Universal Logging Platform..."
Write-Host "JWT_SECRET configured"
Write-Host "Environment: $env:NODE_ENV"
node server.js