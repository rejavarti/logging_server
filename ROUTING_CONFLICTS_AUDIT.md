Ok, with # Routing Conflicts Audit - Complete Analysis

## Critical Issues Found

### 1. DUPLICATE MOUNTS - CONFIRMED CONFLICTS

**Lines 1870-1872 vs 1884-1885 in server.js:**

```javascript
// FIRST MOUNT (WRONG - uses security.js for everything)
app.use('/api/rate-limits', requireAuth, require('./routes/api/security'));    // Line 1870
app.use('/api/audit-trail', requireAuth, require('./routes/api/security'));   // Line 1871
app.use('/api/security', requireAuth, require('./routes/api/security'));       // Line 1872

// SECOND MOUNT (CORRECT - uses dedicated files)
app.use('/api', requireAuth, require('./routes/api/rate-limits'));             // Line 1884
app.use('/api', requireAuth, require('./routes/api/audit-trail'));            // Line 1885
```

### Impact Analysis

#### `/api/rate-limits` - BROKEN
- **First mount** (line 1870): Serves `security.js` routes at `/api/rate-limits`
  - security.js defines routes like `/rate-limits/stats`
  - Results in: `/api/rate-limits/rate-limits/stats` ❌ (double nesting)
- **Second mount** (line 1884): Serves `rate-limits.js` routes at `/api`
  - rate-limits.js defines routes like `/rate-limits`
  - Results in: `/api/rate-limits` ✅ (correct)
- **Winner**: First mount takes precedence - WRONG one wins!

#### `/api/audit-trail` - BROKEN
- **First mount** (line 1871): Serves `security.js` at `/api/audit-trail`
  - security.js defines routes like `/audit-trail/activities`
  - Results in: `/api/audit-trail/audit-trail/activities` ❌
- **Second mount** (line 1885): Serves `audit-trail.js` at `/api`
  - audit-trail.js defines routes like `/audit-trail`
  - Results in: `/api/audit-trail` ✅ (correct)
- **Winner**: First mount takes precedence - WRONG one wins!

#### `/api/security` - POTENTIALLY BROKEN
- Mounted at line 1872 to `security.js`
- security.js likely has nested routes causing double paths

### 2. THEME ROUTING - PARAM CAPTURE ISSUE (FIXED)

**Status**: ✅ FIXED in themes.js
- Moved `/themes/current` before `/themes/:themeId` param route
- Function `handleGetCurrentTheme` moved to top of file

### 3. OTHER POTENTIAL CONFLICTS

#### Files mounted at `/api` without prefix:
```javascript
app.use('/api', requireAuth, require('./routes/api/alerts'));          // Line 1874
app.use('/api', requireAuth, require('./routes/api/system'));          // Line 1875
app.use('/api', requireAuth, require('./routes/api/stats'));           // Line 1876
app.use('/api', requireAuth, require('./routes/api/backups'));         // Line 1878
app.use('/api', requireAuth, require('./routes/api/user-theme'));      // Line 1879
app.use('/api', requireAuth, require('./routes/api/themes'));          // Line 1880
app.use('/api', requireAuth, require('./routes/api/saved-searches'));  // Line 1881
app.use('/api', requireAuth, require('./routes/api/integrations'));    // Line 1882
app.use('/api', requireAuth, require('./routes/api/api-keys'));        // Line 1883
```

These need internal route paths checked for conflicts (e.g., if `backups.js` defines `/backups` it becomes `/api/backups` ✅)

## Recommended Fixes

### Fix #1: Remove Incorrect Mounts (Lines 1870-1872)

**DELETE THESE LINES:**
```javascript
app.use('/api/rate-limits', requireAuth, require('./routes/api/security'));
app.use('/api/audit-trail', requireAuth, require('./routes/api/security'));
app.use('/api/security', requireAuth, require('./routes/api/security'));
```

**REASON**: 
- Separate `rate-limits.js` and `audit-trail.js` files exist
- security.js contains nested routes meant to be mounted at `/api`
- Current mounts cause double-nesting (e.g., `/api/rate-limits/rate-limits/*`)

### Fix #2: Verify security.js Routes

**Check if security.js needs its OWN mount**:
- If it has routes like `/security/overview`, mount it at `/api`
- If it only has sub-routes for rate-limits/audit-trail, remove it entirely

### Fix #3: Consolidate Route Files

**Option A** (Recommended): Keep separate files
- `rate-limits.js` → defines `/rate-limits/*` → mounted at `/api`
- `audit-trail.js` → defines `/audit-trail/*` → mounted at `/api`
- `security.js` → defines `/security/*` → mounted at `/api` (if it has unique routes)

**Option B**: Merge into security.js
- Combine all three files
- Mount once at `/api/security`
- Update all internal routes to remove `/security` prefix

## Testing Required

After fixes, test these endpoints:
```
GET /api/rate-limits/stats       (should work)
GET /api/audit-trail/activities  (should work)
GET /api/security/*              (verify what exists)
GET /api/themes/current          (fixed - verify)
```

## Root Cause

Multiple refactoring passes created:
1. Original monolithic security.js with nested routes
2. Split into separate files (rate-limits.js, audit-trail.js)
3. FAILED to remove old mounts from server.js
4. Result: Routes mounted twice with different files

## Priority

🔴 **CRITICAL** - These duplicate mounts are likely causing:
- 404 errors when correct paths aren't matched first
- Inconsistent behavior depending on mount order
- Potential memory leaks from loading modules multiple times
