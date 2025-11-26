#!/usr/bin/env pwsh
# Docker Development Environment Setup
# This ensures ALL editing happens in Docker, not locally

Write-Host "🐳 Setting up Docker-first development environment..."

# Stop and remove existing container
try {
    docker stop enhanced-logging-container
    docker rm enhanced-logging-container
} catch {
    Write-Host "No existing container to remove"
}

# Create development container with volume mounts
Write-Host "🔄 Creating development container with live code mounting..."

$currentDir = Get-Location
docker run -d `
    --name enhanced-logging-dev `
    -p 10180:3000 `
    -v "${currentDir}:/app" `
    -v enhanced-logging-data:/app/data `
    -e AUTH_PASSWORD=$env:AUTH_PASSWORD `
    -e PORT=3000 `
    -e JWT_SECRET=e8f9d17c828074916ce801f9700d498f36c3e8e9a81dd3e0d34f2999a5a44cafffb761c045a0afeac7056277c63b39ac4ff17e4a65704ca398f1dcd549be19bc `
    --workdir /app `
    enhanced-logging-server:latest

Write-Host "✅ Development container created!"
Write-Host "🔧 You can now edit files and they'll be reflected in the container automatically"
Write-Host "🌐 Access: http://localhost:10180 (admin / ****)"; Write-Host "(Set AUTH_PASSWORD in your environment before running)"

# Optional: Start a shell in the container for direct editing
Write-Host "💡 To edit files directly in the container:"
Write-Host "   docker exec -it enhanced-logging-dev /bin/sh"
Write-Host "`n💡 To restart the server after changes:"
Write-Host "   docker exec enhanced-logging-dev npm run restart"