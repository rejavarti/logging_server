#!/usr/bin/env pwsh
# Make local files read-only to prevent accidental editing

Write-Host "🔒 Making local files read-only to prevent accidental edits..."

$criticalFiles = @(
    "server.js",
    "package.json",
    "universal-sqlite-database.js",
    "database-access-layer.js",
    "database-migration.js"
)

foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Set-ItemProperty -Path $file -Name IsReadOnly -Value $true
        Write-Host "🔒 $file is now read-only"
    }
}

# Make critical directories read-only
$criticalDirs = @("routes", "engines", "managers", "templates")
foreach ($dir in $criticalDirs) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Recurse -File | ForEach-Object {
            Set-ItemProperty -Path $_.FullName -Name IsReadOnly -Value $true
        }
        Write-Host "🔒 $dir/ files are now read-only"
    }
}

Write-Host "✅ Local files protected! Edit only via Docker containers."
Write-Host "💡 To unlock for Docker rebuilds, run: .\unlock-files.ps1"