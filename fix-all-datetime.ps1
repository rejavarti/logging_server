#!/usr/bin/env pwsh
# Fix ALL remaining datetime() SQL syntax for PostgreSQL compatibility

$files = @(
    "widgets\timeline-widget.js",
    "widgets\log-levels-widget.js",
    "server.js",
    "routes\api\dashboard-data.js",
    "routes\api\dashboard.js",
    "routes\api\audit-trail.js",
    "managers\WebhookManager.js",
    "engines\real-time-streaming-engine.js",
    "engines\anomaly-detection-engine.js"
)

$replacements = @(
    # Basic patterns
    @{old = "datetime('now', 'localtime', '-24 hours')"; new = "NOW() - INTERVAL '24 hours'"},
    @{old = "datetime('now', 'localtime', '-1 hour')"; new = "NOW() - INTERVAL '1 hour'"},
    @{old = "datetime('now', 'localtime', '-1 day')"; new = "NOW() - INTERVAL '1 day'"},
    @{old = "datetime('now', '-1 hour')"; new = "NOW() - INTERVAL '1 hour'"},
    @{old = "datetime('now', '-1 day')"; new = "NOW() - INTERVAL '1 day'"},
    @{old = "datetime('now', '-7 days')"; new = "NOW() - INTERVAL '7 days'"},
    @{old = "datetime('now', '-24 hours')"; new = "NOW() - INTERVAL '24 hours'"},
    @{old = "datetime('now', '-30 days')"; new = "NOW() - INTERVAL '30 days'"},
    @{old = "datetime('now', '-90 days')"; new = "NOW() - INTERVAL '90 days'"},
    @{old = 'datetime("now", "-1 hour")'; new = "NOW() - INTERVAL '1 hour'"},
    @{old = "datetime('now','-30 days')"; new = "NOW() - INTERVAL '30 days'"},
    
    # Dynamic interval patterns (template strings)
    @{old = "datetime('now', '-\${params.min_history_days} days')"; new = "NOW() - INTERVAL '\${params.min_history_days} days'"}
)

$totalChanges = 0

foreach ($file in $files) {
    $filePath = Join-Path $PSScriptRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        $originalContent = $content
        
        foreach ($replacement in $replacements) {
            $content = $content.Replace($replacement.old, $replacement.new)
        }
        
        if ($content -ne $originalContent) {
            Set-Content $filePath -Value $content -NoNewline
            Write-Host "✅ Fixed: $file" -ForegroundColor Green
            $totalChanges++
        } else {
            Write-Host "⏭️  Skipped: $file (no changes needed)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Not found: $file" -ForegroundColor Red
    }
}

Write-Host "`n📊 Total files updated: $totalChanges" -ForegroundColor Cyan
Write-Host "🔧 Next: Rebuild Docker image and restart container" -ForegroundColor Cyan
