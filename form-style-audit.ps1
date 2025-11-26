param()
# Form Style Audit Helper
# Scans route JS files for input/select/textarea elements that use full inline styles
# instead of the approved .form-control utility class.
# Output: List of issue strings; empty output means clean.

$issues = @()
$routeFiles = Get-ChildItem -Path (Join-Path $PSScriptRoot 'routes') -Filter '*.js' -File -ErrorAction SilentlyContinue

# Pattern looks for style attribute containing width:100%; padding; border; border-radius all together
# Avoid using automatic variable names; simple index scan approach.
$pattern = '<(input|select|textarea)[^>]*style="[^"]*width:\s*100%;[^"]*padding:[^"]*border:[^"]*border-radius:[^"]*"'
$regex = [regex] $pattern

foreach ($file in $routeFiles) {
  try {
    $content = Get-Content $file.FullName -Raw
    $match = $regex.Match($content)
    $count = 0
    while ($match.Success) {
      $count++
      $match = $match.NextMatch()
    }
    if ($count -gt 0) {
      $issues += "$($file.Name): $count form inputs with full inline styles (should use .form-control)"
    }
  } catch {
    $issues += "$($file.Name): error scanning - $($_.Exception.Message)"
  }
}

$issues