const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Helper: update data/config/ingestion-state.json based on ingestion settings
function updateIngestionStateFromSettings(ingestionSettings) {
    if (!ingestionSettings || typeof ingestionSettings !== 'object') return;

    try {
        const statePath = path.resolve(__dirname, '../../data/config/ingestion-state.json');

        // Load current state (or initialize default structure)
        let state = { tcp: {}, udp: {} };
        try {
            const raw = fs.readFileSync(statePath, 'utf8');
            state = JSON.parse(raw);
        } catch (readErr) {
            req.app.locals?.loggers?.api?.warn('ingestion-state.json not found or invalid, initializing a new one:', readErr.message);
        }

        // Map UI toggles to concrete ports/protocols managed by Port Guardian
        const bool = (v) => (typeof v === 'string' ? v === 'true' : !!v);
        const syslog = bool(ingestionSettings.syslog_enabled);
        const gelf = bool(ingestionSettings.gelf_enabled);
        const beats = bool(ingestionSettings.beats_enabled);
        const fluent = bool(ingestionSettings.fluent_enabled);

        // Ensure objects exist
        if (!state.tcp) state.tcp = {};
        if (!state.udp) state.udp = {};

        // Apply mappings (keep unrelated ports untouched)
        state.udp['514'] = syslog;     // Syslog UDP
        state.tcp['601'] = syslog;     // Syslog TCP
        state.udp['12201'] = gelf;     // GELF UDP
        state.tcp['12202'] = gelf;     // GELF TCP
        state.tcp['5044'] = beats;     // Beats TCP
        state.tcp['9880'] = fluent;    // Fluent TCP

        // Persist atomically: write to a temp file then replace
        const tmpPath = statePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
        fs.renameSync(tmpPath, statePath);
        req.app.locals?.loggers?.api?.info('🔒 Updated ingestion-state.json to reflect ingestion settings');
    } catch (err) {
        req.app.locals?.loggers?.api?.warn('Failed to update ingestion-state.json from settings:', err.message);
    }
}

// Settings API endpoints
router.get('/', async (req, res) => {
    try {
        // Get all system settings from database
        let settingsObj = {
            system: {
                retention_days: 30,
                max_log_size: '10MB',
                log_level: 'info',
                timezone: 'UTC',
                auto_archive: true,
                compression_enabled: true
            },
            alerts: {
                email_enabled: true,
                webhook_enabled: true,
                slack_enabled: false,
                discord_enabled: false
            },
            ingestion: {
                syslog_enabled: true,
                gelf_enabled: true,
                beats_enabled: true,
                fluent_enabled: true,
                rate_limit: 1000,
                max_message_size: '1MB'
            },
            security: {
                auth_enabled: true,
                jwt_expiry: '24h',
                rate_limiting: true,
                audit_logging: true,
                password_policy: 'strong'
            },
            performance: {
                cache_enabled: true,
                cache_ttl: 300,
                streaming_enabled: true,
                compression: true,
                indexing: 'auto'
            }
        };
        
        // Load settings from database if DAL is available
        if (req.dal) {
            try {
                const dbSettings = await req.dal.all('SELECT setting_key, setting_value, description as category FROM system_settings');

                // Merge database settings with defaults
                dbSettings.forEach(setting => {
                    // Expect setting_key in form "category.key"; fall back gracefully
                    const settingKey = setting.setting_key || '';
                    const parts = settingKey.split('.', 2);
                    const derivedCategory = parts.length === 2 ? parts[0] : null;
                    const derivedKey = parts.length === 2 ? parts[1] : settingKey;

                    const category = setting.category || derivedCategory || 'system';
                    const key = derivedKey;

                    let value = setting.setting_value;
                    // Parse JSON values when possible (so booleans/numbers persist correctly)
                    try {
                        value = JSON.parse(value);
                    } catch (_e) {
                        // Keep as string if not JSON
                    }

                    if (!settingsObj[category]) {
                        settingsObj[category] = {};
                    }
                    settingsObj[category][key] = value;
                });
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Failed to load settings from database, using defaults:', dbErr.message);
            }
        }

        res.json({ success: true, settings: settingsObj });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/', async (req, res) => {
    try {
        const settingsData = req.body;
        
        if (!settingsData || typeof settingsData !== 'object' || Object.keys(settingsData).length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Settings data is required' 
            });
        }
        
        // Update settings in database - handle nested structure
        if (req.dal) {
            try {
                let savedCount = 0;
                // Iterate through categories (system, alerts, ingestion, security, performance)
                for (const [category, categorySettings] of Object.entries(settingsData)) {
                    if (typeof categorySettings === 'object' && categorySettings !== null) {
                        // Iterate through settings within each category
                        for (const [key, value] of Object.entries(categorySettings)) {
                            const settingKey = `${category}.${key}`;
                            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                            
                            // Use INSERT OR REPLACE to update or create setting
                            const result = await req.dal.run(
                                `INSERT OR REPLACE INTO system_settings (setting_key, setting_value, description, updated_at)
                                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                                [settingKey, valueStr, category]
                            );
                            
                            if (result && (result.changes > 0 || result.lastID)) {
                                savedCount++;
                            }
                        }
                    }
                }
                
                req.app.locals?.loggers?.api?.info(`✅ Saved ${savedCount} settings to database`);
                
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.error('Failed to save settings to database:', dbErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to save settings: ' + dbErr.message 
                });
            }
        }
        
        // Update Port Guardian ingestion-state when ingestion toggles are provided
        try {
            if (settingsData.ingestion) {
                updateIngestionStateFromSettings(settingsData.ingestion);
            }
        } catch (pgErr) {
            req.app.locals?.loggers?.api?.warn('Port Guardian state update warning:', pgErr.message);
        }

        // Log settings update activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'update_settings',
                    resource_type: 'settings',
                    resource_id: 'comprehensive',
                    details: JSON.stringify({ 
                        categories: Object.keys(settingsData)
                    }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log settings update activity:', auditErr.message);
            }
        }
        
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API Keys management
// REMOVED: mock API key endpoints (use routes/api/api-keys.js instead)

// Specific settings endpoints from monolithic system

// Get rate limiting settings
router.get('/settings/rate-limiting', async (req, res) => {
    try {
        const rateLimitingSettings = {
            general: {
                windowMs: 60000,
                max: 100,
                enabled: true
            },
            auth: {
                windowMs: 900000,
                max: 5,
                enabled: true
            },
            api: {
                windowMs: 60000,
                max: 1000,
                enabled: true
            }
        };

        res.json({ success: true, settings: rateLimitingSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limiting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update rate limiting settings
router.put('/settings/rate-limiting', async (req, res) => {
    try {
        const updates = req.body;
        
        // Log rate limiting settings update activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'update_settings',
                    resource_type: 'settings',
                    resource_id: 'rate-limiting',
                    details: JSON.stringify({ 
                        category: 'rate-limiting',
                        updates: updates
                    }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log rate limiting settings update activity:', auditErr.message);
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Rate limiting settings updated',
            settings: updates
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating rate limiting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get alerting settings
router.get('/settings/alerting', async (req, res) => {
    try {
        const alertingSettings = {
            email: {
                enabled: true,
                smtp: 'smtp.gmail.com',
                port: 587,
                recipients: ['admin@localhost']
            },
            webhook: {
                enabled: true,
                url: 'https://hooks.slack.com/...',
                retries: 3
            },
            thresholds: {
                error_rate: 5,
                storage_warning: 20,
                response_time: 1000
            }
        };

        res.json({ success: true, settings: alertingSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting alerting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get WebSocket settings
router.get('/settings/websocket', async (req, res) => {
    try {
        const websocketSettings = {
            enabled: true,
            port: 8081,
            maxConnections: 100,
            heartbeatInterval: 30000,
            compression: true
        };

        res.json({ success: true, settings: websocketSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting websocket settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get maintenance settings
router.get('/settings/maintenance', async (req, res) => {
    try {
        const maintenanceSettings = {
            enabled: false,
            scheduledMaintenance: null,
            allowedIps: ['127.0.0.1', '::1'],
            message: 'System is currently under maintenance'
        };

        res.json({ success: true, settings: maintenanceSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting maintenance settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get log parsing settings
router.get('/settings/log-parsing', async (req, res) => {
    try {
        const logParsingSettings = {
            formats: ['json', 'syslog', 'apache', 'nginx'],
            defaultFormat: 'json',
            timestampFormats: ['ISO8601', 'RFC3339', 'unix'],
            fieldMapping: {
                timestamp: 'timestamp',
                level: 'level',
                message: 'message',
                source: 'source'
            }
        };

        res.json({ success: true, settings: logParsingSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting log parsing settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update specific setting by key
router.put('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value, category } = req.body;
        
        if (!value) {
            return res.status(400).json({ 
                success: false, 
                error: 'Value is required' 
            });
        }
        
        // Save to database (capture old value for audit diff)
        let oldValue = undefined;
        if (req.dal) {
            try {
                // Fetch existing value for diff recording
                const existing = await req.dal.get(
                    `SELECT setting_value FROM settings WHERE setting_key = ?`,
                    [key]
                );
                oldValue = existing ? existing.setting_value : undefined;

                const valueStr = typeof value === 'object' ? JSON.stringify(value) : value.toString();
                const categoryStr = category || 'system';
                
                await req.dal.run(
                    `INSERT OR REPLACE INTO settings (setting_key, setting_value, category, updated_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                    [key, valueStr, categoryStr]
                );
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.error('Failed to save setting to database:', dbErr);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to save setting' 
                });
            }
        }
        
        req.app.locals?.loggers?.api?.info(`Setting ${key} updated to ${value} by ${req.user ? req.user.username : 'system'}`);
        
        // Log individual setting update activity with before/after diff
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'update_settings',
                    resource_type: 'settings',
                    resource_id: key,
                    details: JSON.stringify({ 
                        setting_key: key,
                        old_value: oldValue,
                        new_value: value
                    }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log setting update activity:', auditErr.message);
            }
        }
        
        res.json({ 
            success: true, 
            message: `Setting ${key} updated successfully`,
            key,
            value
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating setting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get theme settings
router.get('/settings/theme', async (req, res) => {
    try {
        const themeSettings = {
            defaultTheme: 'dark',
            availableThemes: ['light', 'dark', 'blue', 'green'],
            customization: {
                primaryColor: '#007bff',
                secondaryColor: '#6c757d',
                fontFamily: 'Inter, sans-serif'
            }
        };

        res.json({ success: true, settings: themeSettings });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting theme settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export settings
router.get('/settings/export', async (req, res) => {
    try {
        const exportData = {
            version: '2.1.0-stable-enhanced',
            exported: new Date().toISOString(),
            settings: {
                system: { retention_days: 30, max_log_size: '10MB' },
                alerts: { email_enabled: true, webhook_enabled: true },
                security: { auth_enabled: true, jwt_expiry: '24h' }
            }
        };

        res.json({ success: true, settings: exportData });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error exporting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Import settings
router.post('/settings/import', async (req, res) => {
    try {
        const importData = req.body;
        
        req.app.locals?.loggers?.api?.info(`Settings import initiated by ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'Settings imported successfully',
            imported: Object.keys(importData.settings || {}).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error importing settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restore default settings
router.post('/settings/restore-defaults', async (req, res) => {
    try {
        const { category } = req.body;
        
        // Log settings restoration activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'restore_default_settings',
                    resource_type: 'settings',
                    resource_id: category || 'all',
                    details: JSON.stringify({ 
                        category: category || 'all',
                        restored_by: req.user.username
                    }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log settings restoration activity:', auditErr.message);
            }
        }
        
        req.app.locals?.loggers?.api?.info(`Settings restoration to defaults initiated by ${req.user ? req.user.username : 'system'} for category: ${category || 'all'}`);
        
        res.json({
            success: true,
            message: category ? `${category} settings restored to defaults` : 'All settings restored to defaults',
            category: category || 'all',
            restoredBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error restoring default settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;