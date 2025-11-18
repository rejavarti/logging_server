param(
    [string]$ContainerName = "rejavarti-logging-server",
    [string]$DbPath = "/app/data/databases/enterprise_logs.db"
)

$scriptPath = Join-Path $PSScriptRoot "sql/compatibility_patch.sql"
if (!(Test-Path $scriptPath)) {
    Write-Error "Compatibility SQL not found: $scriptPath"
    exit 1
}

Write-Host "Applying DB compatibility patch..." -ForegroundColor Cyan

docker cp $scriptPath $ContainerName:/tmp/compatibility_patch.sql

docker exec $ContainerName sh -c "sqlite3 $DbPath < /tmp/compatibility_patch.sql" | Write-Host

Write-Host "Patch applied." -ForegroundColor Green
