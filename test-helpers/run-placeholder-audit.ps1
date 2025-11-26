param()
try {
 node scripts/audit-placeholders.js > placeholder-audit.json 2>$null
 $auditRaw=Get-Content placeholder-audit.json -Raw
 $audit=$auditRaw | ConvertFrom-Json
 [PSCustomObject]@{TotalCode=$audit.summary.totalCodePlaceholders; TotalAll=$audit.summary.totalPlaceholders; Files=$audit.summary.filesWithPlaceholders }
} catch { [PSCustomObject]@{Error=$_.Exception.Message} }