/**
 * Integrations API Routes
 * Handles integration health, testing, configurations, and management
 */

const express = require('express');
const router = express.Router();

// Utility to parse config fields consistently
function parseConfigRow(row) {
    if (!row) return row;
    const parsed = { ...row };
    if (parsed.config) {
        try { parsed.config = JSON.parse(parsed.config); } catch (_) { parsed.config = {}; }
    }
    if (parsed.enabled !== undefined) {
        parsed.enabled = parsed.enabled ? true : false;
    }
    return parsed;
}

// List all integrations
router.get('/integrations', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.json({ success: true, integrations: [] });
        }
        const rows = await req.dal.getIntegrations();
        const integrations = (rows || []).map(parseConfigRow);
        res.json({ success: true, integrations });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('List integrations error:', error);
        res.status(500).json({ success: false, error: 'Failed to list integrations' });
    }
});

// Get a single integration by id
router.get('/integrations/:id', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.getIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const row = await req.dal.getIntegration(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Integration not found' });
        res.json(parseConfigRow(row));
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Get integration error:', error);
        res.status(500).json({ success: false, error: 'Failed to get integration' });
    }
});

// Add/update integration (root POST handler for compatibility)
router.post('/integrations', async (req, res) => {
    try {
        let { name, type, config, enabled, verifySsl } = req.body;
        if (!name || !type) {
            return res.status(400).json({ success: false, error: 'Integration name and type are required' });
        }
        if (!req.dal || typeof req.dal.createIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        // Convert booleans to integers for SQLite
        if (typeof enabled === 'boolean') {
            enabled = enabled ? 1 : 0;
        } else if (enabled === undefined) {
            enabled = 1; // Default to enabled
        }
        
        if (typeof verifySsl === 'boolean') {
            verifySsl = verifySsl ? 1 : 0;
        }
        
        // Stringify config if it's an object
        if (config && typeof config === 'object') {
            config = JSON.stringify(config);
        }
        
        const result = await req.dal.createIntegration({ name, type, config, enabled, verifySsl });
        
        // Also create entry in integration_health table for monitoring
        try {
            const healthExists = await req.dal.get(
                `SELECT id FROM integration_health WHERE integration_name = ?`,
                [name.toLowerCase().replace(/\s+/g, '_')]
            );
            
            if (!healthExists) {
                await req.dal.run(
                    `INSERT INTO integration_health (integration_name, status, metadata) VALUES (?, ?, ?)`,
                    [
                        name.toLowerCase().replace(/\s+/g, '_'),
                        'unknown',
                        JSON.stringify({
                            enabled: enabled ? true : false,
                            type: type,
                            description: `Custom ${type} integration`
                        })
                    ]
                );
            }
        } catch (healthError) {
            req.app.locals?.loggers?.api?.error('Failed to create health entry:', healthError);
            // Non-fatal - integration was created successfully
        }
        
        // Fetch created/updated row
        const created = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [result.lastID]);
        res.json({ success: true, integration: parseConfigRow(created), message: 'Integration created successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Integration creation error:', error);
        res.status(500).json({ success: false, error: 'Failed to create integration: ' + error.message });
    }
});

// Update integration
router.put('/integrations/:id', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.updateIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const { id } = req.params;
        const updates = { ...req.body };
        
        // Convert booleans to integers for SQLite
        Object.keys(updates).forEach(key => {
            if (typeof updates[key] === 'boolean') {
                updates[key] = updates[key] ? 1 : 0;
            }
        });
        
        // Stringify config if it's an object
        if (updates.config && typeof updates.config !== 'string') {
            updates.config = JSON.stringify(updates.config);
        }
        
        const result = await req.dal.updateIntegration(id, updates);
        if ((result?.changes || 0) === 0) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        const updated = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [id]);
        res.json({ success: true, integration: parseConfigRow(updated) });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Integration update error:', error);
        res.status(500).json({ success: false, error: 'Failed to update integration: ' + error.message });
    }
});

// Delete integration
router.delete('/integrations/:id', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.deleteIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const result = await req.dal.deleteIntegration(req.params.id);
        if ((result?.changes || 0) === 0) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        res.json({ success: true, message: 'Integration deleted successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Integration delete error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete integration: ' + error.message });
    }
});

// Toggle integration enabled status
router.post('/integrations/:id/toggle', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.toggleIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const result = await req.dal.toggleIntegration(req.params.id);
        if (!result.success) {
            return res.status(404).json({ success: false, error: result.error || 'Integration not found' });
        }
        res.json({ success: true, id: result.id, enabled: result.enabled });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Integration toggle error:', error);
        res.status(500).json({ success: false, error: 'Failed to toggle integration: ' + error.message });
    }
});

// Get integration health status
router.get('/integrations/health', async (req, res) => {
    try {
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        const status = mgr ? mgr.getStatus() : {};
        return res.json({ success: true, integrations: status });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting integration health:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test specific integration
router.post('/integrations/:name/test', async (req, res) => {
    try {
        const { name } = req.params;
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        if (!mgr) return res.status(503).json({ success: false, error: 'Integration manager unavailable' });
        const all = mgr.getStatus();
        const key = name.toLowerCase();
        // Map friendly names
        const mapped = all[key] || all[name] || null;
        if (!mapped) return res.status(404).json({ success: false, error: 'Integration not found' });
        return res.json({ success: true, test: { name, status: mapped } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing integration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get integration history/logs
router.get('/integrations/:name/history', async (req, res) => {
    try {
        const { name } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        if (!req.dal) return res.status(503).json({ success: false, error: 'Database not available' });
        // Filter logs where source matches integration name or starts with it
        const rows = await req.dal.all(
            `SELECT id, timestamp, level, source, message FROM logs WHERE source = ? OR source LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`,
            [name, `${name}/%`, parseInt(limit), parseInt(offset)]
        );
        res.json({ success: true, history: rows, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: rows.length } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting integration history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test all integrations
router.post('/integrations/test-all', async (req, res) => {
    try {
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        if (!mgr) return res.status(503).json({ success: false, error: 'Integration manager unavailable' });
        const status = mgr.getStatus();
        const summary = Object.entries(status).map(([name, s]) => ({ name, connected: s.connected, enabled: s.enabled, mode: s.mode || null }));
        res.json({ success: true, results: summary });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing all integrations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get custom integrations
router.get('/integrations/custom', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.json({ success: true, integrations: [] });
        }
        const rows = await req.dal.getIntegrations();
        const integrations = (rows || []).filter(r => r.type === 'custom').map(r => ({
            ...r,
            config: (() => { try { return r.config ? JSON.parse(r.config) : {}; } catch (_) { return {}; } })()
        }));
        res.json({ success: true, integrations });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting custom integrations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create custom integration
router.post('/integrations/custom', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.createIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const { name, config } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
        const result = await req.dal.createIntegration({ name, type: 'custom', config, enabled: true });
        const created = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [result.lastID]);
        if (created && created.config) { try { created.config = JSON.parse(created.config); } catch (_) { created.config = {}; } }
        res.json({ success: true, integration: created });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating custom integration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update custom integration
router.put('/integrations/custom/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.dal || typeof req.dal.updateIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const updates = { ...req.body };
        const result = await req.dal.updateIntegration(id, updates);
        if ((result?.changes || 0) === 0) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        const updated = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [id]);
        if (updated && updated.config) { try { updated.config = JSON.parse(updated.config); } catch (_) { updated.config = {}; } }
        res.json({ success: true, integration: updated });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating custom integration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete custom integration
router.delete('/integrations/custom/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.dal || typeof req.dal.deleteIntegration !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const result = await req.dal.deleteIntegration(id);
        if ((result?.changes || 0) === 0) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        res.json({ success: true, message: 'Custom integration deleted successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting custom integration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test custom integration
router.post('/integrations/custom/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const dal = req.app.locals?.dal;
        
        if (!dal) {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        
        // Get integration config
        const integration = await dal.getIntegrationById(parseInt(id));
        if (!integration) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        
        let config;
        try {
            config = typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config;
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid integration configuration' });
        }
        
        // Test based on integration type
        const testResult = {
            success: true,
            integration: integration.name,
            type: integration.type,
            timestamp: new Date().toISOString()
        };
        
        if (integration.type === 'webhook' && config.url) {
            // Test webhook connection
            try {
                const axios = require('axios');
                const testResponse = await axios.get(config.url, { timeout: 5000 });
                testResult.status = 'reachable';
                testResult.responseCode = testResponse.status;
            } catch (err) {
                testResult.status = 'unreachable';
                testResult.error = err.message;
            }
        } else if (integration.type === 'api' && config.endpoint) {
            // Test API connection
            try {
                const axios = require('axios');
                const testResponse = await axios.get(config.endpoint, { 
                    timeout: 5000,
                    headers: config.headers || {}
                });
                testResult.status = 'connected';
                testResult.responseCode = testResponse.status;
            } catch (err) {
                testResult.status = 'failed';
                testResult.error = err.message;
            }
        } else {
            // Generic integration test
            testResult.status = 'configured';
            testResult.message = 'Integration configuration is valid';
        }
        
        res.json(testResult);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing custom integration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get integration configurations
router.get('/integrations/configs', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.json({ success: true, configs: {} });
        }
        const rows = await req.dal.getIntegrations();
        const configs = {};
        (rows || []).forEach(r => {
            const cfg = (() => { try { return r.config ? JSON.parse(r.config) : {}; } catch (_) { return {}; } })();
            configs[r.name] = cfg;
        });
        res.json({ success: true, configs });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting integration configs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get specific integration config
router.get('/integrations/configs/:name', async (req, res) => {
    try {
        const { name } = req.params;
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        const rows = await req.dal.getIntegrations();
        const match = (rows || []).find(r => r.name === name);
        if (!match) return res.status(404).json({ success: false, error: 'Integration not found' });
        const config = (() => { try { return match.config ? JSON.parse(match.config) : {}; } catch (_) { return {}; } })();
        res.json({ success: true, config: { name: match.name, enabled: match.enabled ? true : false, settings: config } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting integration config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create/Update integration config
router.post('/integrations/configs', async (req, res) => {
    try {
        const { name, enabled, settings } = req.body || {};
        if (!name) {
            return res.status(400).json({ success: false, error: 'Integration name is required' });
        }
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        // Normalize settings (object -> JSON string later in DAL)
        const normalizedSettings = settings && typeof settings === 'object' ? settings : {};
        // Fetch existing integration
        const rows = await req.dal.getIntegrations();
        let existing = (rows || []).find(r => r.name === name);
        if (!existing) {
            // Create new integration entry
            const createResult = await req.dal.createIntegration({
                name,
                type: 'builtin',
                config: normalizedSettings,
                enabled: enabled === undefined ? true : !!enabled
            });
            existing = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [createResult.lastID]);
        } else {
            // Update existing integration
            await req.dal.updateIntegration(existing.id, {
                config: normalizedSettings,
                enabled: enabled === undefined ? existing.enabled : !!enabled
            });
            existing = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [existing.id]);
        }
        // Parse config JSON
        let parsedConfig = {};
        if (existing && existing.config) {
            try { parsedConfig = JSON.parse(existing.config); } catch { parsedConfig = {}; }
        }
        // Update in-memory runtime config if matches known built-ins
        if (req.config && req.config.integrations) {
            if (name === 'homeassistant') {
                req.config.integrations.homeAssistant.enabled = enabled === undefined ? req.config.integrations.homeAssistant.enabled : !!enabled;
                if (parsedConfig.url) req.config.integrations.homeAssistant.host = parsedConfig.url;
                if (parsedConfig.token) req.config.integrations.homeAssistant.token = parsedConfig.token;
                if (parsedConfig.websocketEnabled !== undefined) req.config.integrations.homeAssistant.websocketEnabled = !!parsedConfig.websocketEnabled;
                // Trigger reconnection logic
                try {
                    const mgr = req.app.locals.getManagers?.()?.integrationManager;
                    if (mgr && typeof mgr.updateHomeAssistantConfig === 'function') {
                        mgr.updateHomeAssistantConfig({
                            enabled: req.config.integrations.homeAssistant.enabled,
                            host: req.config.integrations.homeAssistant.host,
                            token: req.config.integrations.homeAssistant.token,
                            websocketEnabled: req.config.integrations.homeAssistant.websocketEnabled
                        });
                    }
                } catch (e) {
                    req.app.locals?.loggers?.api?.warn('Home Assistant reconnection failed:', e.message);
                }
            }
        }
        return res.json({
            success: true,
            integration: {
                id: existing.id,
                name: existing.name,
                enabled: !!existing.enabled,
                settings: parsedConfig
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating integration config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete integration config
router.delete('/integrations/configs/:name', async (req, res) => {
    try {
        const { name } = req.params;
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const rows = await req.dal.getIntegrations();
        const match = (rows || []).find(r => r.name === name);
        if (!match) return res.status(404).json({ success: false, error: 'Integration not found' });
        await req.dal.updateIntegration(match.id, { config: {}, enabled: 0, status: 'disabled' });
        // Update runtime config if built-in
        if (name === 'homeassistant' && req.config?.integrations?.homeAssistant) {
            req.config.integrations.homeAssistant.enabled = false;
            req.config.integrations.homeAssistant.token = '';
            const mgr = req.app.locals.getManagers?.()?.integrationManager;
            if (mgr) mgr.updateHomeAssistantConfig({ enabled: false, token: '' });
        }
        res.json({ success: true, message: 'Integration config deleted and disabled' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting integration config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get integration status (overall)
router.get('/integrations/status', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.getIntegrations !== 'function') {
            return res.json({ success: true, status: { totalIntegrations: 0, activeIntegrations: 0, failedIntegrations: 0 } });
        }
        const rows = await req.dal.getIntegrations();
        const total = rows?.length || 0;
        const active = (rows || []).filter(r => r.enabled).length;
        // failedIntegrations not tracked without a health backend
        const status = { totalIntegrations: total, activeIntegrations: active, failedIntegrations: 0 };
        res.json({ success: true, status });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting integration status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Publish message via MQTT
router.post('/integrations/mqtt/publish', async (req, res) => {
    try {
        const { topic, message, qos = 0, retain = false } = req.body;
        
        if (!topic || !message) {
            return res.status(400).json({ success: false, error: 'Topic and message required' });
        }
        
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        if (!mgr || !mgr.mqttClient || !mgr.mqttClient.connected) {
            return res.status(503).json({ success: false, error: 'MQTT client not connected' });
        }
        
        // Publish message
        mgr.mqttClient.publish(topic, JSON.stringify(message), { qos, retain }, (err) => {
            if (err) {
                req.app.locals?.loggers?.api?.error('MQTT publish error:', err);
                return res.status(500).json({ success: false, error: 'Failed to publish message' });
            }
            
            req.app.locals?.loggers?.api?.info(`MQTT message published to ${topic}`);
            res.json({ 
                success: true, 
                topic, 
                timestamp: new Date().toISOString() 
            });
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error publishing MQTT message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Broadcast WebSocket message
router.post('/integrations/websocket/broadcast', async (req, res) => {
    try {
        const { event, data } = req.body;
        
        if (!event) {
            return res.status(400).json({ success: false, error: 'Event name required' });
        }
        
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        if (!mgr || !mgr.wss) {
            return res.status(503).json({ success: false, error: 'WebSocket server not available' });
        }
        
        let clientCount = 0;
        mgr.wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
                clientCount++;
            }
        });
        
        req.app.locals?.loggers?.api?.info(`WebSocket broadcast sent to ${clientCount} clients`);
        
        res.json({ 
            success: true, 
            event,
            clientsNotified: clientCount,
            timestamp: new Date().toISOString() 
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error broadcasting WebSocket message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Form test endpoint (used by UI form test button)
router.post('/integrations/test', async (req, res) => {
    try {
        const { name } = req.body || {};
        if (!name) return res.status(400).json({ success: false, error: 'Name required' });
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        if (!mgr) return res.status(503).json({ success: false, error: 'Integration manager unavailable' });
        const status = mgr.getStatus();
        const match = status[name] || status[name.toLowerCase()] || null;
        if (!match) return res.status(404).json({ success: false, error: 'Integration not found' });
        res.json({ success: true, test: { name, status: match } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing integration from form:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test integration by id (UI uses id, not name)
router.post('/integrations/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.dal) return res.status(503).json({ success: false, error: 'Database not available' });
        const row = await req.dal.get(`SELECT * FROM integrations WHERE id = ?`, [id]);
        if (!row) return res.status(404).json({ success: false, error: 'Integration not found' });
        const mgr = req.app.locals.getManagers?.()?.integrationManager;
        const status = mgr ? mgr.getStatus() : {};
        const st = status[row.name] || status[row.name.toLowerCase()] || { enabled: !!row.enabled, connected: false };
        res.json({ success: true, test: { id: Number(id), name: row.name, status: st } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing integration by id:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;