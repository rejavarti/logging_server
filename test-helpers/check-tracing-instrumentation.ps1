param([string]$Container='Rejavarti-Logging-Server')
try {
  $logs = docker logs $Container --tail 250 2>$null
} catch {
  return [PSCustomObject]@{ApiTracing=$false;AdminTracing=$false;RouteSetupFailed=$true;Error=$_.Exception.Message}
}
[PSCustomObject]@{
  ApiTracing = ([regex]::IsMatch($logs,'Mounted /api/tracing route') -or [regex]::IsMatch($logs,'Tracing routes initialized') -or [regex]::IsMatch($logs,'All routes configured successfully'))
  AdminTracing = ([regex]::IsMatch($logs,'Mounted /admin/tracing route') -or [regex]::IsMatch($logs,'Tracing routes initialized') -or [regex]::IsMatch($logs,'All routes configured successfully'))
  RouteSetupFailed = [regex]::IsMatch($logs,'Route setup failed')
}