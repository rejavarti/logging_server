param()
# Check Chart.js global defaults present
$basePath=Join-Path $PSScriptRoot '..' 'configs' 'templates' 'base.js'
if(-not (Test-Path $basePath)){ return @('base.js missing') }
$base=Get-Content $basePath -Raw
$defaults=@(
 'Chart.defaults.color', 'Chart.defaults.plugins.legend.labels.color', 'Chart.defaults.plugins.title.color', 'Chart.defaults.scale.ticks.color', 'Chart.defaults.scale.grid.color'
)
$missing=@()
foreach($d in $defaults){ if(-not [regex]::IsMatch($base,[regex]::Escape($d))){ $missing+=$d } }
[PSCustomObject]@{Missing=$missing; Required=$defaults.Count}