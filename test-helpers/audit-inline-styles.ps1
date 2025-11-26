param()
# Returns list of inline style anti-pattern issues
$issues=@()
$routeFiles=Get-ChildItem -Path (Join-Path $PSScriptRoot '..' 'routes') -Filter '*.js' -File -ErrorAction SilentlyContinue
foreach($file in $routeFiles){
  try { $c=Get-Content $file.FullName -Raw } catch { continue }
  if([regex]::IsMatch($c,'style="[^"]*background:\s*linear-gradient[^"]*padding:\s*0\.5rem')){ $issues+="$($file.Name): button gradient inline style" }
  if([regex]::IsMatch($c,'\.status-badge\.(healthy|degraded|unhealthy)\s*\{\s*background:\s*#')){ $issues+="$($file.Name): status badge hardcoded color" }
  if([regex]::IsMatch($c,'\.severity-(info|warn|error|success|debug)\s*\{\s*background:\s*#')){ $issues+="$($file.Name): severity badge hardcoded color" }
  if([regex]::IsMatch($c,'style="padding:\s*2rem;\s*text-align:\s*center;\s*color:\s*#[0-9a-fA-F]{6}')){ $issues+="$($file.Name): empty state inline style" }
}
$issues