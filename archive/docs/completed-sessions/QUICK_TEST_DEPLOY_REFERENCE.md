# Quick Test & Deploy Reference

## Pre-Deployment Testing (Required)

```powershell
# 1. Check for syntax errors
cd logging-server
$content = Get-Content .\routes\dashboard.js -Raw
if (($content -split "`n").Count -lt 3000) {
    Write-Host "❌ ABORT: File truncated!" -ForegroundColor Red
    exit 1
}

# 2. Run comprehensive tests
.\test-comprehensive.ps1 -Verbose

# 3. Only deploy if static analysis passes
# Check output for "✅ PASS: Static: Onclick Escaping"
```

## Fast Deploy (After Tests Pass)

```powershell
# Copy fixed file and restart
docker cp routes/dashboard.js Rejavarti-Logging-Server:/app/routes/dashboard.js
docker exec Rejavarti-Logging-Server kill -HUP 1

# Verify startup (wait 3 seconds)
Start-Sleep -Seconds 3
docker logs Rejavarti-Logging-Server --tail 20

# Must see BOTH markers:
# ✅ All routes configured successfully
# 🚀 HTTP Server running on port 10180
```

## Manual Browser Verification

1. Open: http://192.168.222.3:10180
2. Login with credentials
3. Open browser console (F12)
4. Check for **zero JavaScript errors**
5. Test widget drag-and-drop (should work smoothly)
6. Check geolocation map (should show "No geolocation data available" if no logs)

## Common Error Patterns to Avoid

### ❌ WRONG: JavaScript Escaping in HTML Attributes
```javascript
onclick="myFunction(\'parameter\')"  // SYNTAX ERROR!
onkeypress="if(event.key===\'Enter\')"  // SYNTAX ERROR!
```

### ✅ CORRECT: HTML Entity Encoding
```javascript
onclick="myFunction(&quot;parameter&quot;)"
onkeypress="if(event.key===&quot;Enter&quot;)"
```

### ❌ WRONG: Function Not Exposed
```javascript
// Function defined in script block but not on window
function myWidgetFunction() { ... }

// Called from onclick - will fail!
onclick="myWidgetFunction()"
```

### ✅ CORRECT: Expose on Window Object
```javascript
function myWidgetFunction() { ... }
window.myWidgetFunction = myWidgetFunction;

// Now onclick works!
onclick="myWidgetFunction()"
```

## Emergency Rollback

```powershell
# If deployment breaks production, rollback:
docker stop Rejavarti-Logging-Server
docker rm Rejavarti-Logging-Server

# Run previous date-tagged image:
docker run -d --name Rejavarti-Logging-Server `
  -p 10180:10180 `
  -v "C:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server\data:/app/data" `
  -e NODE_ENV=production `
  -e JWT_SECRET=<redacted> `
  -e AUTH_PASSWORD=ChangeMe123! `
  --restart unless-stopped `
  rejavarti/logging-server:2025-11-19
```

## Test Suite Output Interpretation

### ✅ PASS Criteria
- Static: Onclick Escaping = PASS (0 errors)
- Static: Function Exposures = PASS (all 6 functions)
- Docker: Startup Success = PASS (both markers found)
- Docker: Log Errors = PASS (no error patterns)

### ⚠️ WARN (Acceptable)
- API endpoints returning 401 (authentication required)
- Health endpoint status "ready" instead of "healthy"
- Browser tests failing due to login redirect

### ❌ FAIL (Must Fix)
- Any onclick/onkeypress escaping errors
- Missing function definitions or window exposures
- File truncation (line count < 3000)
- Docker container not running
- Missing success markers in logs

## File Integrity Check

```powershell
# Quick line count check (should be 3221+)
(Get-Content .\routes\dashboard.js -Raw -split "`n").Count

# Check for window exposures (should find 2 blocks)
Select-String -Path .\routes\dashboard.js -Pattern "window\.\w+\s*=" | Measure-Object

# Check for bad escapes (should return 0)
Select-String -Path .\routes\dashboard.js -Pattern 'onclick="[^"]*\\' | Measure-Object
```

## Automated Testing Schedule

**Before Every Deployment**:
- ✅ Run `test-comprehensive.ps1`
- ✅ Check test report JSON file
- ✅ Verify Docker logs after deployment

**Weekly**:
- Run full browser test suite with authentication
- Review browser console for any new warnings
- Check database size and integrity

**After Major Changes**:
- Full regression test (all widgets)
- Performance testing (load times, API response)
- Security audit (authentication, authorization)

---

## Support Contacts

- Container: `Rejavarti-Logging-Server`
- Host: `192.168.222.3:10180`
- Network: Bridge mode (not macvlan)
- Data Volume: `./data:/app/data`

Test Reports: `logging-server/test-report-*.json`
Browser Reports: `logging-server/browser-test-report-*.json`
