param([string]$ServerUrl,[string]$Token)
$endpoints=@(
 @{Path='/api/tracing/status';Name='Tracing Status'},
 @{Path='/api/tracing/dependencies';Name='Tracing Dependencies'},
 @{Path='/api/tracing/search?limit=5';Name='Tracing Search'}
)
$results=@()
foreach($e in $endpoints){
 $sw=[System.Diagnostics.Stopwatch]::StartNew()
 try {
  $resp=Invoke-RestMethod -Uri "$ServerUrl$($e.Path)" -Method GET -Headers @{Authorization="Bearer $Token"} -TimeoutSec 10
  $sw.Stop()
  $valid=$null -ne $resp
  if($e.Name -eq 'Tracing Dependencies'){
    $serialized=$resp | ConvertTo-Json -Depth 4
    if([regex]::IsMatch($serialized,'placeholder|coming soon|not implemented')){ $valid=$false }
  }
  if($e.Name -eq 'Tracing Search'){
    if($resp -is [Array]){ $valid=$true } elseif($resp.results -and ($resp.results -is [Array])){ $valid=$true } else { $valid=$false }
  }
  $results+=[PSCustomObject]@{Endpoint=$e.Path;Name=$e.Name;Valid=$valid;Ms=$sw.ElapsedMilliseconds}
 } catch { $sw.Stop(); $results+=[PSCustomObject]@{Endpoint=$e.Path;Name=$e.Name;Valid=$false;Ms=$sw.ElapsedMilliseconds;Error=$_.Exception.Message} }
}
$results