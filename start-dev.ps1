#!/usr/bin/env pwsh
# Enhanced Universal Logging Platform v2.2.0 - Development Startup Script
Write-Host "Starting Enhanced Universal Logging Platform v2.2.0..." -ForegroundColor Green

# Set environment variables
$env:AUTH_PASSWORD="secure_admin_2024!"
$env:JWT_SECRET="ultra_secure_jwt_secret_key_2024_production_ready!"
$env:NODE_ENV="development"
$env:PORT="10180"

Write-Host "Environment configured - Starting server..." -ForegroundColor Cyan

# Change to logging-server directory if not already there
$currentDir = Get-Location
if ($currentDir.Path -notlike "*logging-server*") {
    Set-Location $PSScriptRoot
}

node server.js