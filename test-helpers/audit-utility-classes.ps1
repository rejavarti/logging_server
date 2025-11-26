param()
# Verify required utility classes exist in base template
$basePath=Join-Path $PSScriptRoot '..' 'configs' 'templates' 'base.js'
if(-not (Test-Path $basePath)){ return @('base.js missing') }
$base=Get-Content $basePath -Raw
$required=@(
 '.status-badge.healthy', '.status-badge.degraded', '.status-badge.unhealthy',
 '.severity-info', '.severity-error', '.btn-small', '.btn-small.btn-primary', '.btn-small.btn-warning', '.btn-small.btn-danger',
 '.empty-state', '.empty-state-icon', '.empty-state.error', '.stat-card', '.stat-card-value', '.tab-btn', '.event-badge', '.form-control'
)
$missing=@()
foreach($cls in $required){ if(-not [regex]::IsMatch($base,[regex]::Escape($cls))){ $missing+=$cls } }
[PSCustomObject]@{Missing=$missing; Required=$required.Count}