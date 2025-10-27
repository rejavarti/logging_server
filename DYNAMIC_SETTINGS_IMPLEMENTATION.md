# Dynamic Settings Implementation

## Overview
This document describes the implementation of dynamic timezone and theme configuration through the Settings page, replacing hardcoded values with database-backed settings.

## Changes Made

### 1. Database Schema Extension
**Location:** `server.js` lines ~2103-2122

Created `system_settings` table to store configurable system settings:
```sql
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type TEXT DEFAULT 'string',
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER
)
```

**Default Settings:**
- `timezone`: 'America/Edmonton' (IANA timezone string)
- `default_theme`: 'auto' (auto/light/dark)
- `date_format`: 'MM/DD/YYYY, hh:mm:ss A' (Moment.js format string)

### 2. Settings Loader
**Location:** `server.js` lines ~2125-2157

**Global Cache:**
```javascript
let SYSTEM_SETTINGS = {
    timezone: TIMEZONE,
    default_theme: 'auto',
    date_format: 'MM/DD/YYYY, hh:mm:ss A'
};
```

**Loader Function:**
```javascript
function loadSystemSettings(callback) {
    db.all('SELECT setting_key, setting_value FROM system_settings', [], (err, rows) => {
        rows.forEach(row => {
            SYSTEM_SETTINGS[row.setting_key] = row.setting_value;
        });
        config.system.timezone = SYSTEM_SETTINGS.timezone;
        loggers.system.info('✅ System settings loaded:', SYSTEM_SETTINGS);
        if (callback) callback(null, SYSTEM_SETTINGS);
    });
}
```

**Startup Call:**
- Runs 1 second after server start to ensure database is ready
- Updates `config.system.timezone` with loaded value
- Logs loaded settings to console

### 3. Server-Side Timestamp Formatting
**Location:** `server.js` lines ~176-189

Updated `formatSQLiteTimestamp()` to use dynamic settings:
```javascript
function formatSQLiteTimestamp(sqliteTimestamp, format) {
    const displayFormat = format || SYSTEM_SETTINGS.date_format || 'MM/DD/YYYY, hh:mm:ss A';
    const timezone = SYSTEM_SETTINGS.timezone || TIMEZONE;
    const m = moment(sqliteTimestamp + ' UTC', 'YYYY-MM-DD HH:mm:ss Z').tz(timezone);
    return m.isValid() ? m.format(displayFormat) : null;
}
```

**Behavior:**
- Uses `SYSTEM_SETTINGS.timezone` instead of hardcoded `TIMEZONE` constant
- Uses `SYSTEM_SETTINGS.date_format` if no explicit format parameter
- Falls back to constants if settings not loaded

### 4. Client-Side Template Updates
**Location:** `server.js` lines ~740-750

**Template JavaScript Constants:**
```javascript
const TIMEZONE = '${SYSTEM_SETTINGS.timezone || TIMEZONE}';
const TIMEZONE_ABBR = '${moment().tz(SYSTEM_SETTINGS.timezone || TIMEZONE).format('z')}';
const DEFAULT_THEME = '${SYSTEM_SETTINGS.default_theme || 'auto'}';
```

**Theme Initialization:**
```javascript
let currentTheme = localStorage.getItem('theme') || DEFAULT_THEME;
```

**Impact:**
- All pages receive dynamic timezone from database
- Theme preference defaults to database setting (with localStorage override)
- Changes apply immediately on page load after server settings update

### 5. API Endpoints

#### GET /api/settings (Admin Only)
**Location:** `server.js` lines ~3295-3320

Returns full configuration object:
```json
{
    "system": {
        "name": "Enterprise Logging Platform",
        "version": "2.1.0-stable-enhanced",
        "owner": "Tom Nelson",
        "timezone": "America/Edmonton"
    },
    "server": { "port": 10180 },
    "database": { "path": "enterprise_logs.db" },
    "maintenance": { "logRetentionDays": 30 },
    "integrations": { ... },
    "theme": "auto"
}
```

#### PUT /api/settings (Admin Only)
**Location:** `server.js` lines ~3236-3293

**Updates Both:**
1. In-memory `config` object (runtime)
2. Database `system_settings` table (persistence)

**Timezone Validation:**
- Validates against `moment.tz.names()` (all IANA timezones)
- Returns 400 error if invalid timezone provided

**Theme Validation:**
- Validates against `['auto', 'light', 'dark']`
- Returns 400 error if invalid theme provided

**Example Request:**
```javascript
PUT /api/settings
{
    "timezone": "America/Denver",
    "default_theme": "dark"
}
```

#### PUT /api/settings/:key (Admin Only)
**Location:** `server.js` lines ~3322-3368

Update individual setting by key:
```javascript
PUT /api/settings/timezone
{ "value": "America/New_York" }
```

**Features:**
- Updates database with `updated_at` timestamp and `updated_by` user ID
- Updates cached `SYSTEM_SETTINGS` object
- Updates `config.system.timezone` if timezone changed
- Logs change with user attribution

#### GET /api/settings/theme (Authenticated)
**Location:** `server.js` lines ~3371-3373

Returns current theme preference:
```json
{ "theme": "auto" }
```

#### GET /api/timezone (Public)
**Location:** `server.js` lines ~3289-3291

Returns current timezone setting:
```json
{ "timezone": "America/Edmonton" }
```

### 6. Settings Page UI Updates
**Location:** `server.js` lines ~8942-8975

**Added Theme Selector:**
```html
<div class="setting-item">
    <div>
        <div class="setting-label"><i class="fas fa-palette"></i> Default Theme</div>
        <div class="setting-description">Default color theme for the interface</div>
    </div>
    <div class="setting-control">
        <select id="default_theme" name="default_theme">
            <option value="auto">Auto (System Preference)</option>
            <option value="light">Light Mode</option>
            <option value="dark">Dark Mode</option>
        </select>
    </div>
</div>
```

**Updated Form Submission:**
**Location:** `server.js` lines ~9286-9333

- Added `default_theme: formData.get('default_theme')` to updates object
- Added automatic page reload after successful save: `setTimeout(() => window.location.reload(), 1000)`
- Ensures timezone/theme changes apply immediately after save

## Usage

### Changing Timezone
1. Navigate to **Settings** page
2. Select desired timezone from **Timezone** dropdown
3. Click **Save Settings**
4. Page will reload automatically, all timestamps will use new timezone

### Changing Theme
1. Navigate to **Settings** page
2. Select desired theme from **Default Theme** dropdown:
   - **Auto**: Uses system/browser preference
   - **Light**: Always light mode
   - **Dark**: Always dark mode
3. Click **Save Settings**
4. Page will reload automatically with new theme applied

### Persistence
- Settings are stored in `system_settings` table in SQLite database
- Settings survive server restarts
- Settings apply to all users (system-wide)
- Individual users can override theme using browser localStorage (temporary)

## Technical Notes

### Startup Sequence
1. Server starts, `TIMEZONE` constant loaded from environment/default
2. Database schema initialized
3. 1-second delay
4. `loadSystemSettings()` executes
5. `SYSTEM_SETTINGS` object populated from database
6. `config.system.timezone` updated
7. Server ready to serve pages with dynamic settings

### Fallback Behavior
- If database read fails, falls back to `TIMEZONE` constant ('America/Edmonton')
- If setting not in database, INSERT OR IGNORE ensures defaults exist
- Template uses `||` operators for graceful degradation

### Validation
- **Timezone**: Must be valid IANA timezone (e.g., 'America/Denver', 'UTC')
- **Theme**: Must be 'auto', 'light', or 'dark'
- Invalid values return HTTP 400 with error message

### Impact on Existing Code
- All 7 page routes use `getPageTemplate()` which reads `SYSTEM_SETTINGS`
- `formatSQLiteTimestamp()` used throughout codebase now uses dynamic timezone
- No breaking changes to API contracts
- Backward compatible with old config object structure

## Testing Recommendations

1. **Timezone Changes:**
   - Change timezone to 'America/New_York'
   - Verify all timestamps on Dashboard, Logs, Users, Activity, Webhooks show Eastern time
   - Restart server, verify timezone persists

2. **Theme Changes:**
   - Set theme to 'dark', verify all pages use dark mode
   - Set theme to 'light', verify all pages use light mode
   - Set theme to 'auto', verify follows system preference
   - Restart server, verify theme persists

3. **Validation:**
   - Try invalid timezone (e.g., 'Invalid/Timezone'), verify 400 error
   - Try invalid theme (e.g., 'purple'), verify 400 error

4. **Multi-User:**
   - Login as different users, verify timezone/theme applies universally
   - Verify only admin can access Settings page and modify settings

## Future Enhancements

Potential additions:
- User-specific timezone preferences (override system default)
- User-specific theme preferences (stored in database, not localStorage)
- More date format options in Settings UI
- Timezone auto-detection based on user's browser/IP
- Theme preview before save
- Settings import/export for backup/migration
