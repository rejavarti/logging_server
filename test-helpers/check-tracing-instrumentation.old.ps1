param([string]$Container='Rejavarti-Logging-Server')
try { $logs=docker logs $Container --tail 250 2>$null } catch { return [PSCustomObject]@{ApiTracing=$false;AdminTracing=$false;RouteSetupFailed=$true;Error=$_.Exception.Message} }
[PSCustomObject]@{
 ApiTracing = [regex]::IsMatch($logs,'Mounted /api/tracing route')
 AdminTracing = [regex]::IsMatch($logs,'Mounted /admin/tracing route')
 RouteSetupFailed = [regex]::IsMatch($logs,'Route setup failed')
}