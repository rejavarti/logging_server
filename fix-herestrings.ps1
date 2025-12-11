# Fix PowerShell here-strings that contain JavaScript arrow functions
# Converts @"..."@ to @'...'@  format and uses -f formatting for variable substitution

$file = "test-comprehensive-unified.ps1"
$content = Get-Content $file -Raw

# Replace all @" with @' and "@ with '@
# Then add -f formatting where needed

# This regex finds patterns like: $varName = @"...content..."@
$pattern = '(?s)(\$\w+)\s*=\s*@"(.*?)"@'

$newContent = [regex]::Replace($content, $pattern, {
    param($match)
    $varName = $match.Groups[1].Value
    $hereStringContent = $match.Groups[2].Value
    
    # Replace $ServerUrl, $Username, $adminSecretValue with {0}, {1}, {2}
    $modified = $hereStringContent `
        -replace '\$ServerUrl', '{0}' `
        -replace '\$Username', '{1}' `
        -replace '\$adminSecretValue', '{2}'
    
    # Return the new format with single-quoted here-string
    return "$varName = @'$modified'@ -f `$ServerUrl, `$Username, `$adminSecretValue"
})

# Write back
Set-Content -Path $file -Value $newContent -NoNewline

Write-Host "Converted all double-quoted here-strings to single-quoted with -f formatting" -ForegroundColor Green
