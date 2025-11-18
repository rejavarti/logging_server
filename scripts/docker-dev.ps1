#!/usr/bin/env pwsh
# Docker-Only Development Commands
# All editing happens inside Docker containers

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("edit", "shell", "logs", "restart", "rebuild", "test")]
    [string]$Action,
    
    [string]$File = ""
)

$containerName = "enhanced-logging-dev"

switch ($Action) {
    "edit" {
        if (-not $File) {
            Write-Host "❌ Usage: .\docker-dev.ps1 edit <filename>"
            exit 1
        }
        Write-Host "📝 Opening $File in container editor..."
        docker exec -it $containerName nano "/app/$File"
    }
    
    "shell" {
        Write-Host "🐚 Opening Docker container shell..."
        docker exec -it $containerName /bin/sh
    }
    
    "logs" {
        Write-Host "📋 Showing Docker container logs..."
        docker logs -f $containerName
    }
    
    "restart" {
        Write-Host "🔄 Restarting application in container..."
        docker exec $containerName pkill -f "node server.js" 
        Start-Sleep 2
        docker exec -d $containerName node server.js
        Write-Host "✅ Application restarted"
    }
    
    "rebuild" {
        Write-Host "🏗️ Rebuilding Docker container..."
        .\unlock-files.ps1
        docker stop $containerName
        docker rm $containerName
        docker build -t enhanced-logging-server:latest .
        .\docker-dev-setup.ps1
        .\lock-local-files.ps1
    }
    
    "test" {
        Write-Host "🧪 Running tests in container..."
        docker exec $containerName npm test
    }
}

Write-Host "💡 Available commands: edit, shell, logs, restart, rebuild, test"