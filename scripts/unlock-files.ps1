#!/usr/bin/env pwsh
# Unlock local files temporarily (for Docker rebuilds only)

Write-Host "🔓 Temporarily unlocking local files for Docker operations..."

Get-ChildItem -Path . -Recurse -File | Where-Object { $_.IsReadOnly } | ForEach-Object {
    Set-ItemProperty -Path $_.FullName -Name IsReadOnly -Value $false
    Write-Host "🔓 Unlocked: $($_.Name)"
}

Write-Host "⚠️  Files unlocked for Docker rebuild. Remember to lock again with .\lock-local-files.ps1"