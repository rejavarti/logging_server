# Quick Reference: Testing Best Practices (Nov 22, 2025)

## Before Writing Widget Code

```powershell
# 1. Test API endpoint structure
$token = (Invoke-RestMethod -Uri "$ServerUrl/api/auth/login" -Method POST -Body $loginBody -ContentType 'application/json').token
Invoke-RestMethod -Uri "$ServerUrl/api/your-endpoint" -Headers @{Authorization="Bearer $token"} | ConvertTo-Json -Depth 3

# 2. Check for nested structures
# Look for: {success, data: {...}} OR {success, analytics: {...}} OR direct arrays
```

## Chart Rendering Template

```javascript
function updateChart(chartId, data) {
    // ✅ Step 1: Canvas exists?
    const canvas = document.getElementById(chartId);
    if (!canvas) {
        console.error(`[Chart] Canvas #${chartId} not found`);
        return;
    }
    
    // ✅ Step 2: Data valid?
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`[Chart] No data for #${chartId}`);
        canvas.parentElement.innerHTML = '<p>No data available</p>';
        return;
    }
    
    // ✅ Step 3: Safe to render
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: { labels: data.map(d => d.label), datasets: [...] }
    });
}
```

## API Response Handler Template

```javascript
async function loadWidget() {
    try {
        const response = await fetch('/api/endpoint');
        const json = await response.json();
        
        // ✅ Handle nested OR flat structure
        const data = json.analytics || json.data || json;
        
        // ✅ Validate data exists
        if (!data || (Array.isArray(data) && data.length === 0)) {
            showEmptyState();
            return;
        }
        
        // ✅ Safe to use data
        updateUI(data);
    } catch (error) {
        console.error('[Widget] Load failed:', error);
        showErrorState();
    }
}
```

## Development Iteration Cycle

```
1. Edit code
2. get_errors (automatic)
3. If clean → docker build -t rejavarti/logging-server:latest .
4. docker run -d --name Rejavarti-Logging-Server -p 10180:10180 ...
5. Run tests (API + Puppeteer)
6. If fail → GOTO 1 (don't stop, iterate automatically)
7. If 100/100 → Done!
```

## Test Score Interpretation

- **100/100** → ✅ Deploy now
- **98-99/100** → ⚠️ Review, then deploy
- **95-97/100** → ❌ Fix issues before deploy
- **<95/100** → 🚫 Critical issues, do NOT deploy

## Known False Positives (Filter These)

```javascript
// Browser test - ignore these console errors
const realErrors = errors.filter(e => 
    e !== 'WebSocket error:' &&           // Empty WebSocket message
    !e.includes('extension://') &&        // Browser extensions
    !e.includes('chrome-extension://')    // Chrome extensions
);
```

## Pre-Deployment Checklist

```
□ get_errors clean (no syntax errors)
□ API endpoints return expected structure
□ Puppeteer test passes (100/100)
□ All charts render (no blank canvases)
□ No "placeholder" or "sample data" text
□ WebSocket connects successfully
□ Startup logs show both markers:
  - "All routes configured successfully"
  - "HTTP Server running on port 10180"
```

## Docker Build Strategy

```powershell
# Development (FAST - use cache)
$env:DOCKER_BUILDKIT = 1
docker build -t rejavarti/logging-server:latest .

# Production (CLEAN - no cache)
docker build --no-cache -t rejavarti/logging-server:latest .

# Troubleshooting (VERBOSE)
docker build --no-cache --progress=plain -t rejavarti/logging-server:latest .
```

## Common Mistakes to Avoid

❌ Assuming API response format without checking
❌ Creating charts without validating canvas/data
❌ Using private Muuri APIs (`_setTranslate`)
❌ Hardcoding WebSocket port instead of using `window.location.port`
❌ Testing in VS Code buffer instead of running container
❌ Placing parameterized routes before specific routes
❌ Stopping iteration after first test failure (keep iterating!)

## Quick Puppeteer Test

```javascript
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Login
    await page.goto('http://localhost:10180/login');
    await page.type('#username', 'admin');
    await page.type('#password', 'ChangeMe123!');
    await page.click('button[type=submit]');
    await page.waitForNavigation();
    
    // Wait for async ops
    await new Promise(r => setTimeout(r, 3000));
    
    // Validate
    const result = await page.evaluate(() => ({
        charts: document.querySelectorAll('canvas').length,
        widgets: document.querySelectorAll('[data-widget-id]').length
    }));
    
    console.log(JSON.stringify(result));
    await browser.close();
})();
```

## Emergency Rollback

```powershell
# If deployment fails, rollback to previous version
docker stop Rejavarti-Logging-Server
docker rm Rejavarti-Logging-Server
docker run -d --name Rejavarti-Logging-Server \
  -p 10180:10180 \
  -v "${PWD}/data:/app/data" \
  -e NODE_ENV=production \
  -e JWT_SECRET=$env:JWT_SECRET \
  -e AUTH_PASSWORD=$env:AUTH_PASSWORD \
  --restart unless-stopped \
  rejavarti/logging-server:2025-11-21  # <-- Previous date tag
```

## Success Metrics

✅ All 3 analytics charts render
✅ Build time: 10-30 seconds (cached)
✅ Test suite: 100/100 score
✅ Zero console errors (except known false positives)
✅ All widgets show real data (no placeholders)
✅ WebSocket connected
✅ Startup markers present in logs
