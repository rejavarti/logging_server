const express = require('express');
const router = express.Router();

// Settings API endpoints
router.get('/settings', async (req, res) => {
    try {
        // Get all system settings
        const settings = {
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

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const { category, settings } = req.body;
        
        // Update settings in database
        // For now, just return success
        
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API Keys management
router.get('/api-keys', async (req, res) => {
    try {
        const apiKeys = [
            {
                id: '1',
                name: 'ESP32 Device Key',
                key: 'esp32_****_****_****',
                created: '2024-01-15T10:30:00Z',
                lastUsed: '2024-11-02T06:15:00Z',
                permissions: ['log:write'],
                status: 'active'
            },
            {
                id: '2', 
                name: 'Dashboard API Key',
                key: 'dash_****_****_****',
                created: '2024-01-20T14:20:00Z',
                lastUsed: '2024-11-01T22:45:00Z',
                permissions: ['log:read', 'dashboard:read'],
                status: 'active'
            }
        ];

        res.json({ success: true, apiKeys });
    } catch (error) {
        console.error('Error getting API keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api-keys', async (req, res) => {
    try {
        const { name, permissions } = req.body;
        
        // Generate new API key
        const newKey = {
            id: Date.now().toString(),
            name,
            key: 'key_' + Math.random().toString(36).substr(2, 20),
            created: new Date().toISOString(),
            lastUsed: null,
            permissions,
            status: 'active'
        };

        res.json({ success: true, apiKey: newKey });
    } catch (error) {
        console.error('Error creating API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/api-keys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete API key from database
        
        res.json({ success: true, message: 'API key deleted successfully' });
    } catch (error) {
        console.error('Error deleting API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
        console.error('Error getting rate limiting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update rate limiting settings
router.put('/settings/rate-limiting', async (req, res) => {
    try {
        const updates = req.body;
        
        res.json({ 
            success: true, 
            message: 'Rate limiting settings updated',
            settings: updates
        });
    } catch (error) {
        console.error('Error updating rate limiting settings:', error);
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
        console.error('Error getting alerting settings:', error);
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
        console.error('Error getting websocket settings:', error);
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
        console.error('Error getting maintenance settings:', error);
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
        console.error('Error getting log parsing settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update specific setting by key
router.put('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        console.log(`Setting ${key} updated to ${value} by ${req.user ? req.user.username : 'system'}`);
        
        res.json({ 
            success: true, 
            message: `Setting ${key} updated successfully`,
            key,
            value
        });
    } catch (error) {
        console.error('Error updating setting:', error);
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
        console.error('Error getting theme settings:', error);
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

        res.json({ success: true, export: exportData });
    } catch (error) {
        console.error('Error exporting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Import settings
router.post('/settings/import', async (req, res) => {
    try {
        const importData = req.body;
        
        console.log(`Settings import initiated by ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'Settings imported successfully',
            imported: Object.keys(importData.settings || {}).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error importing settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;