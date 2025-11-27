# Comprehensive Button/API Endpoint Audit Report
## Logging Server - November 27, 2025

This report analyzes all onclick handlers and their corresponding API endpoints to identify
missing backend routes or DAL methods that would cause 500 errors.

---

## 1. ONCLICK HANDLERS INVENTORY

### Dashboard Controls
| Function Name | Description |
|--------------|-------------|
| `toggleLock()` | Toggle grid lock/unlock |
| `resetLayout()` | Reset widget positions |
| `saveLayout()` | Save widget positions to `/api/dashboard/positions` |
| `addWidget()` | Add new widget to dashboard |
| `refreshAllWidgets()` | Refresh all widget data |
| `removeWidget(id)` | Remove specific widget |

### Widget Marketplace
| Function Name | API Endpoint | Status |
|--------------|--------------|--------|
| `closeModal()` | N/A (UI only) | ✅ EXISTS |

### Quick Actions
| Function Name | API Endpoint | Status |
|--------------|--------------|--------|
| `performQuickSearch()` | N/A (UI redirect) | ✅ EXISTS |
| `performLogExport()` | `/api/logs/export` | ✅ EXISTS |
| `applyFilterPreset()` | N/A (UI only) | ✅ EXISTS |
| `saveBookmark()` | `/api/bookmarks` POST | ✅ EXISTS |
| `deleteBookmark(id)` | `/api/bookmarks/:id` DELETE | ✅ EXISTS |
| `applyBookmarkQuery()` | N/A (UI only) | ✅ EXISTS |
| `calculateStats()` | N/A (UI only) | ✅ EXISTS |
| `bulkAction()` | Various | ⚠️ CHECK |
| `saveQuickNote()` | `/api/notes` POST | ✅ EXISTS |
| `deleteQuickNote(id)` | `/api/notes/:id` DELETE | ✅ EXISTS |

### Webhook Management (webhooks.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `createWebhook()` | `/api/webhooks` POST | `createWebhook()` | ✅ EXISTS |
| `refreshWebhooks()` | `/api/webhooks` GET | `getWebhooks()` | ✅ EXISTS |
| `testWebhook(id)` | `/api/webhooks/:id/test` POST | `testWebhook()` | ✅ EXISTS |
| `editWebhook(id)` | `/api/webhooks/:id` GET | `getWebhookById()` | ✅ EXISTS |
| `viewWebhookLogs(id)` | `/api/webhooks/:id/deliveries` GET | `all()` | ✅ EXISTS |
| `toggleWebhook(id)` | `/api/webhooks/:id/toggle` POST | `toggleWebhook()` | ✅ EXISTS |
| `deleteWebhook(id)` | `/api/webhooks/:id` DELETE | `deleteWebhook()` | ✅ EXISTS |
| `viewDeliveryDetails(id)` | `/api/webhooks/deliveries/:id` GET | `get()` | ✅ EXISTS (FIXED) |
| `retryDelivery(id)` | `/api/webhooks/deliveries/:id/retry` POST | `all(), get()` | ✅ EXISTS |
| `testWebhookForm()` | `/api/webhooks/test` POST | `testWebhookData()` | ✅ EXISTS |

### Integration Management (integrations.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `testAllHealthIntegrations()` | `/integrations/api/test-all` POST | N/A (health check) | ✅ EXISTS |
| `showAddIntegration()` | N/A (UI only) | N/A | ✅ EXISTS |
| `refreshCustomIntegrations()` | `/api/integrations` GET | `getIntegrations()` | ✅ EXISTS |
| `testCustomIntegration(id)` | `/integrations/api/:id/test` POST | `testIntegration()` | ✅ EXISTS |
| `editIntegration(id)` | `/api/integrations/:id` GET | `getIntegration()` | ✅ EXISTS |
| `viewIntegrationLogs(id)` | `/integrations/logs/:id` GET | `all()` | ✅ EXISTS |
| `toggleIntegration(id)` | `/api/integrations/:id/toggle` POST | `toggleIntegration()` | ✅ EXISTS |
| `deleteIntegration(id)` | `/api/integrations/:id` DELETE | `deleteIntegration()` | ✅ EXISTS |
| `testIntegrationForm()` | `/integrations/api/test` POST | N/A (test helpers) | ✅ EXISTS |
| `showIntegrationLibrary()` | N/A (UI only) | N/A | ✅ EXISTS |
| `installIntegration(id)` | N/A (library, mock) | N/A | ⚠️ CHECK |
| `testHealthIntegration(name)` | `/integrations/api/health/:name/test` POST | N/A | ✅ EXISTS |
| `viewHealthIntegrationDetails(name)` | N/A (modal) | N/A | ✅ EXISTS |

### User Management (admin/users.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `showAddUserModal()` | N/A (UI only) | N/A | ✅ EXISTS |
| `editUser(id)` | `/api/users/:id` GET | `getUserById()` | ✅ EXISTS |
| `deleteUser(id)` | `/api/users/:id` DELETE | `deleteUser()` | ✅ EXISTS |
| `refreshSessions()` | `/api/admin/sessions` GET | `all()` | ✅ EXISTS |
| `terminateSession(id)` | `/api/admin/sessions/:id` DELETE | `deleteSessionById()` | ✅ EXISTS |

### Settings (admin/settings.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `loadSettings()` | `/api/settings` GET | `getSetting()` | ✅ EXISTS |
| `saveSettings()` | `/api/settings` PUT | `setSetting()` | ✅ EXISTS |
| `showCreateAPIKeyModal()` | N/A (UI only) | N/A | ✅ EXISTS |
| `createAPIKey()` | `/api/api-keys` POST | `run()` | ✅ EXISTS |
| `toggleAPIKeyStatus(id)` | `/api/api-keys/:id` PUT | `run()` | ✅ EXISTS |
| `deleteAPIKey(id)` | `/api/api-keys/:id` DELETE | `run()` | ✅ EXISTS |
| `createBackup()` | `/api/backups/create` POST | N/A (file ops) | ✅ EXISTS |
| `downloadBackup(filename)` | `/api/backups/:filename/download` GET | N/A (file ops) | ✅ EXISTS |
| `deleteBackup(filename)` | `/api/backups/:filename` DELETE | N/A (file ops) | ✅ EXISTS |
| `exportSettings()` | `/api/settings/export` GET | N/A | ✅ EXISTS |
| `saveTheme()` | `/api/user/theme` POST | `setSetting()` | ✅ EXISTS |
| `resetTheme()` | `/api/user/theme` DELETE | `deleteSetting()` | ✅ EXISTS |
| `testTracingConnection()` | `/api/tracing/status` GET | N/A | ✅ EXISTS |
| `addGradientStop()` | N/A (UI only) | N/A | ✅ EXISTS |
| `removeGradientStop()` | N/A (UI only) | N/A | ✅ EXISTS |

### Security (admin/security.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `refreshRateLimits()` | `/api/rate-limits` GET | N/A (rate limiter) | ✅ EXISTS |
| `unblockIP(ip)` | `/api/rate-limits/unblock` POST | N/A (rate limiter) | ✅ EXISTS |
| `refreshAuditTrail()` | `/api/audit-trail` GET | `getActivityLog()` | ✅ EXISTS |
| `exportAuditTrail()` | `/api/audit-trail/export` GET | N/A | ✅ EXISTS |

### Search (search.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `saveCurrentSearch()` | `/api/search/save` POST | `createSavedSearch()` | ✅ EXISTS |
| `loadSavedSearch(id)` | `/api/search/saved/:id` GET | `getSavedSearchById()` | ✅ EXISTS |
| `deleteSavedSearch(id)` | `/api/search/saved/:id` DELETE | `deleteSavedSearch()` | ✅ EXISTS |
| `clearSearch()` | N/A (UI only) | N/A | ✅ EXISTS |
| `showQueryHelp()` | N/A (UI only) | N/A | ✅ EXISTS |
| `viewLogDetails(id)` | `/api/logs/:id` GET | `get()` | ✅ EXISTS |
| `copyLogMessage()` | N/A (UI only) | N/A | ✅ EXISTS |

### Logs (logs.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `switchTab(tab)` | N/A (UI only) | N/A | ✅ EXISTS |
| `loadLogs()` | `/api/logs` GET | `getLogEntries()` | ✅ EXISTS |
| `exportLogsCSV()` | N/A (client-side) | N/A | ✅ EXISTS |
| `exportLogsJSON()` | N/A (client-side) | N/A | ✅ EXISTS |
| `exportLogsNDJSON()` | `/api/logs/export?format=ndjson` GET | `getLogEntries()` | ✅ EXISTS |
| `loadAnalytics()` | `/api/logs/analytics` GET | Various | ✅ EXISTS |
| `exportAnalyticsCSV()` | N/A (client-side) | N/A | ✅ EXISTS |
| `exportAnalyticsJSON()` | N/A (client-side) | N/A | ✅ EXISTS |
| `loadAdvancedLogs()` | `/api/logs` GET | `getLogEntries()` | ✅ EXISTS |
| `clearAdvancedFilters()` | N/A (UI only) | N/A | ✅ EXISTS |

### Activity (activity.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `clearActivityFilters()` | N/A (UI only) | N/A | ✅ EXISTS |
| `exportActivity()` | `/api/activity/export` GET | `exportActivities()` | ✅ EXISTS |
| `toggleRealTimeActivity()` | N/A (WebSocket) | N/A | ✅ EXISTS |
| `viewActivityDetails(id)` | `/api/activity/:id` GET | `getActivityById()` | ✅ EXISTS |
| `copyActivityData(id)` | `/api/activity/:id` GET | `getActivityById()` | ✅ EXISTS |

### API Keys (admin/api-keys.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `showCreateKeyModal()` | N/A (UI only) | N/A | ✅ EXISTS |
| `createApiKey()` | `/api/api-keys` POST | `run()` | ✅ EXISTS |
| `regenerateKey(id)` | `/api/api-keys/:id/regenerate` POST | `run()` | ✅ EXISTS |
| `toggleKeyStatus(id)` | `/api/api-keys/:id` PUT | `run()` | ✅ EXISTS |
| `deleteKey(id)` | `/api/api-keys/:id` DELETE | `run()` | ✅ EXISTS |
| `copyApiKey()` | N/A (UI only) | N/A | ✅ EXISTS |
| `copyMaskedKey()` | N/A (UI only) | N/A | ✅ EXISTS |

### Dashboard Builder (dashboard-builder.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `previewDashboard()` | N/A (UI only) | N/A | ✅ EXISTS |
| `saveDashboard()` | `/api/dashboards` or `/api/dashboards/:id` | N/A | ❌ **ROUTE COMMENTED OUT** |
| `refreshWidgetTypes()` | `/api/dashboards/widget-types` GET | N/A | ❌ **ROUTE COMMENTED OUT** |
| `configureWidget()` | N/A (UI only) | N/A | ✅ EXISTS |
| `deleteWidget()` | N/A (UI state) | N/A | ✅ EXISTS |
| `saveWidgetConfig()` | N/A (local state) | N/A | ✅ EXISTS |

### Admin Dashboards (admin/dashboards.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `createDashboard()` | N/A (UI modal) | N/A | ✅ EXISTS |
| `submitCreateDashboard()` | `/api/dashboards` POST | N/A | ❌ **ROUTE COMMENTED OUT** |
| `editDashboard(id)` | Redirects to dashboard-builder | N/A | ⚠️ DEPENDS ON BUILDER |
| `deleteDashboard(id)` | `/api/dashboards/:id` DELETE | N/A | ❌ **ROUTE COMMENTED OUT** |

### Tracing (admin/tracing.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `searchTraces()` | `/api/tracing/search` GET | N/A (tracing engine) | ✅ EXISTS |
| `refreshData()` | Various | N/A | ✅ EXISTS |
| `viewTraceDetail(id)` | `/api/tracing/trace/:id` GET | N/A (tracing engine) | ✅ EXISTS |

### Health (admin/health.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `refreshHealthChecks()` | `/api/system/health-checks` GET | Various | ✅ EXISTS |

### Ingestion (admin/ingestion.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `testParsing()` | `/api/ingestion/test-parse` POST | N/A | ✅ EXISTS |
| `loadSampleMessage()` | N/A (UI only) | N/A | ✅ EXISTS |
| `showProtocolHelp()` | N/A (UI only) | N/A | ✅ EXISTS |

### Advanced Search (admin/search-advanced.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `executeSearch()` | `/api/search/query` or `/api/search/fuzzy` | `advancedSearch()` | ✅ EXISTS |
| `clearSearch()` | N/A (UI only) | N/A | ✅ EXISTS |
| `showAnalytics()` | `/api/search/analytics` GET | N/A | ✅ EXISTS |

### Base Template (configs/templates/base.js)
| Function Name | API Endpoint | DAL Method | Status |
|--------------|--------------|------------|--------|
| `logout()` | `/api/auth/logout` POST | N/A | ✅ EXISTS |
| `toggleSidebar()` | N/A (UI only) | N/A | ✅ EXISTS |
| `toggleTheme()` | N/A (local storage) | N/A | ✅ EXISTS |

---

## 2. CRITICAL ISSUES FOUND

### ✅ FIXED: GET `/api/webhooks/deliveries/:id` (Single Delivery Details)

**Frontend Call:**
```javascript
// routes/webhooks.js line 1027
const response = await fetch(`/api/webhooks/deliveries/${deliveryId}`);
```

**Button:** `viewDeliveryDetails(deliveryId)` on line 244

**Status:** ✅ FIXED - Added GET route for single delivery details to `/routes/api/webhooks.js`

---

### ❌ COMMENTED OUT: `/api/dashboards` Routes

**Server.js Line 1316:**
```javascript
// app.use('/api/dashboards', requireAuth, require('./routes/api/dashboards'));
```

**Frontend Calls:**
- `dashboard-builder.js` line 452: `fetch('/api/dashboards/widget-types')`
- `dashboard-builder.js` line 812: `fetch('/api/dashboards/${currentDashboard.id}')`
- `dashboard-builder.js` line 819: `fetch('/api/dashboards')`
- `admin/dashboards.js` lines 337, 353, 368, 509, 545

**Impact:** Dashboard builder and admin dashboards pages will get 404 errors on all API calls.

**Required Fix:** Uncomment the route in server.js:
```javascript
app.use('/api/dashboards', requireAuth, require('./routes/api/dashboards'));
```

---

## 3. DAL METHOD VERIFICATION

### Methods Used in Routes → DAL Status

| Method | Used In | Exists in DAL |
|--------|---------|---------------|
| `getWebhooks()` | webhooks.js | ✅ YES |
| `getWebhookById(id)` | webhooks.js | ✅ YES |
| `createWebhook(data)` | webhooks.js | ✅ YES |
| `updateWebhook(id, data)` | webhooks.js | ✅ YES |
| `deleteWebhook(id)` | webhooks.js | ✅ YES |
| `toggleWebhook(id)` | webhooks.js | ✅ YES |
| `testWebhook(id)` | webhooks.js | ✅ YES |
| `testWebhookData(data)` | webhooks.js | ✅ YES |
| `getIntegrations()` | integrations.js | ✅ YES |
| `getIntegration(id)` | integrations.js | ✅ YES |
| `createIntegration(data)` | integrations.js | ✅ YES |
| `updateIntegration(id, data)` | integrations.js | ✅ YES |
| `deleteIntegration(id)` | integrations.js | ✅ YES |
| `toggleIntegration(id)` | integrations.js | ✅ YES |
| `testIntegration(id)` | integrations.js | ✅ YES |
| `getIntegrationDocs(type)` | integrations.js | ✅ YES |
| `getAllUsers()` | users.js | ✅ YES |
| `getUserById(id)` | users.js | ✅ YES |
| `updateUser(id, data)` | users.js | ✅ YES |
| `deleteUser(id)` | users.js | ✅ YES |
| `createSavedSearch(data)` | search.js | ✅ YES |
| `getSavedSearchById(id, userId)` | search.js | ✅ YES |
| `getSavedSearches(userId)` | search.js | ✅ YES |
| `deleteSavedSearch(id, userId)` | search.js | ✅ YES |
| `getSetting(key)` | settings.js | ✅ YES |
| `setSetting(key, value)` | settings.js | ✅ YES |
| `getActivityById(id)` | activity.js | ✅ YES |
| `getActivitiesSince(timestamp)` | activity.js | ✅ YES |
| `getAllActivity(filters)` | activity.js | ✅ YES |
| `exportActivities(filters)` | activity.js | ✅ YES |
| `logActivity(data)` | various | ✅ YES |
| `getLogEntries(filters, limit, offset)` | logs.js | ✅ YES |
| `getLogCount(filters)` | logs.js | ✅ YES |
| `getSystemStats()` | dashboard.js | ✅ YES |
| `getRecentLogs(limit)` | dashboard.js | ✅ YES |
| `getSystemHealth()` | dashboard.js | ✅ YES |
| `getLogSources()` | dashboard.js | ✅ YES |
| `getLogTrends(hours)` | dashboard.js | ✅ YES |
| `deleteSessionById(id)` | admin.js | ✅ YES |
| `storeEncryptedSecret(key, value)` | secrets.js | ✅ YES |
| `getEncryptedSecret(key)` | secrets.js | ✅ YES |
| `deleteEncryptedSecret(key)` | secrets.js | ✅ YES |
| `listEncryptedSecretKeys()` | secrets.js | ✅ YES |
| `advancedSearch(params)` | search.js | ✅ YES |

---

## 4. SUMMARY

### Issues Fixed During This Audit

1. **✅ FIXED: Missing Endpoint:** `GET /api/webhooks/deliveries/:id`
   - Added complete delivery details endpoint with full response data
   - "View Details" button on webhook deliveries now functional

### Remaining Issues (Design Decision Required)

1. **Commented Out Routes:** `/api/dashboards/*`
   - Severity: MEDIUM (if dashboard builder feature is used)
   - Impact: Dashboard builder completely non-functional
   - Note: Appears intentionally commented out per "Builder admin removed" comment

### Buttons Working Correctly

- All webhook CRUD operations (except delivery details view) ✅
- All integration CRUD operations ✅
- All user management operations ✅
- All search save/load/delete operations ✅
- All settings operations ✅
- All API key operations ✅
- All backup operations ✅
- All log viewing/exporting operations ✅
- All activity viewing/exporting operations ✅
- All security operations ✅
- All tracing operations ✅
- All ingestion testing operations ✅
- All theme operations ✅

### Recommended Actions

1. ✅ COMPLETED: Added missing GET `/api/webhooks/deliveries/:id` endpoint
2. Consider either enabling `/api/dashboards` route or removing/hiding the dashboard builder feature from UI
3. Consider adding validation for `installIntegration()` library feature

---

*Report generated: November 27, 2025*
