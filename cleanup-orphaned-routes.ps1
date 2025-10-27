# PowerShell script to remove orphaned routes from server.js
$file = "C:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server\server.js"
$content = Get-Content $file -Raw

Write-Host "Original file size: $($content.Length) bytes"
Write-Host "Removing orphaned routes..."

# Define the route patterns to remove
$routes = @(
    @{
        Start = "// ============================================================================`r`n// ADVANCED ANALYTICS PAGE`r`n// ============================================================================`r`napp.get('/analytics'"
        End = "});`r`n`r`n// ============================================================================`r`n// SYSTEM METRICS DASHBOARD"
        Name = "/analytics"
    },
    @{
        Start = "// ============================================================================`r`n// SYSTEM METRICS DASHBOARD`r`n// ============================================================================`r`napp.get('/metrics'"
        End = "});`r`n`r`n// Admin Users page"
        Name = "/metrics"
    },
    @{
        Start = "// ============================================================================`r`n// SESSION MANAGEMENT PAGE`r`n// ============================================================================`r`napp.get('/admin/sessions'"
        End = "});`r`n`r`n// ============================================================================`r`n// ALERT MANAGEMENT PAGE"
        Name = "/admin/sessions"
    },
    @{
        Start = "// ============================================================================`r`n// ALERT MANAGEMENT PAGE`r`n// ============================================================================`r`napp.get('/alerts'"
        End = "});`r`n`r`n// ============================================================================`r`n// USER ACTIVITY TIMELINE PAGE"
        Name = "/alerts"
    },
    @{
        Start = "});`r`n`r`napp.get('/backups'"
        End = "});`r`n`r`napp.get('/webhooks'"
        Name = "/backups"
    }
)

# Process each route
foreach ($route in $routes) {
    Write-Host "`nSearching for $($route.Name)..."
    
    # Find the start and end positions
    $startIndex = $content.IndexOf($route.Start)
    $endIndex = $content.IndexOf($route.End, $startIndex)
    
    if ($startIndex -ge 0 -and $endIndex -gt $startIndex) {
        $beforeLength = $content.Length
        $toRemove = $content.Substring($startIndex, $endIndex - $startIndex)
        $content = $content.Remove($startIndex, $endIndex - $startIndex)
        $afterLength = $content.Length
        $removed = $beforeLength - $afterLength
        Write-Host "  ✓ Removed $removed characters from $($route.Name)"
    } else {
        Write-Host "  ✗ Could not find $($route.Name) route"
    }
}

# Save the cleaned file
$content | Set-Content $file -NoNewline
Write-Host "`nFinal file size: $($content.Length) bytes"
Write-Host "Cleanup complete! Orphaned routes removed."
