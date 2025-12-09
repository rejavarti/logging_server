/**
 * API Keys Management Routes
 * DB-backed CRUD aligned with schema: api_keys(id, name, key_hash, permissions, enabled, expires_at, user_id,...)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Helpers
function hashKey(plain) {
    return crypto.createHash('sha256').update(plain).digest('hex');
}
function maskFromHash(keyHash) {
    if (!keyHash || typeof keyHash !== 'string') return 'elk_••••••••••';
    return `elk_${keyHash.slice(0, 8)}...${keyHash.slice(-4)}`;
}

// Get all API keys
router.get('/api-keys', async (req, res) => {
    try {
        if (!req.dal || !req.dal.all) {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }

        const rows = await req.dal.all(
            `SELECT 
                ak.id,
                ak.name,
                ak.key_value,
                ak.description,
                ak.permissions,
                ak.is_active,
                ak.expires_at,
                ak.created_by,
                ak.created_at,
                ak.last_used,
                ak.usage_count,
                u.username AS created_by_username
             FROM api_keys ak
             LEFT JOIN users u ON ak.created_by = u.id
             ORDER BY ak.created_at DESC`
        );

        const keys = (rows || []).map(r => ({
            id: r.id,
            name: r.name,
            key_value: r.key_value ? `elk_${r.key_value.slice(0, 8)}...${r.key_value.slice(-4)}` : 'elk_••••••••••',
            permissions: (() => { try { return JSON.parse(r.permissions || '[]'); } catch { return []; } })(),
            is_active: r.is_active === 1 || r.is_active === true,
            expires_at: r.expires_at || null,
            created_at: r.created_at,
            updated_at: r.created_at, // No updated_at in schema, use created_at
            created_by: r.created_by,
            created_by_username: r.created_by_username || null,
            usage_count: r.usage_count || 0,
            last_used: r.last_used || null,
            description: r.description || null
        }));

        res.json({ success: true, keys });
    } catch (error) {
        req.app.locals.loggers?.api?.error('API keys list error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch API keys: ' + error.message });
    }
});

// Create new API key (returns plaintext once)
router.post('/api-keys', async (req, res) => {
    try {
        const { name, description, permissions, expires_in_days } = req.body || {};
        const userId = req.user?.id || null;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        // Generate secure random API key
        const keyValue = `elk_${crypto.randomBytes(32).toString('hex')}`;

        // Calculate expiry date (stored as ISO text)
        let expiresAt = null;
        if (expires_in_days && Number(expires_in_days) > 0) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + Number(expires_in_days));
            expiresAt = expiryDate.toISOString();
        }

        const permissionsStr = JSON.stringify(Array.isArray(permissions) ? permissions : []);

        const result = await req.dal.run(
            `INSERT INTO api_keys (name, key_value, description, permissions, is_active, expires_at, created_by, created_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
            [name.trim(), keyValue, description || null, permissionsStr, expiresAt, userId]
        );

        const row = await req.dal.get(
            `SELECT ak.id, ak.name, ak.key_value, ak.description, ak.permissions, ak.is_active, ak.expires_at, ak.created_by, ak.created_at, ak.last_used, ak.usage_count,
                    u.username AS created_by_username
             FROM api_keys ak
             LEFT JOIN users u ON ak.created_by = u.id
             WHERE ak.id = ?`,
            [result.lastID]
        );

        const key = {
            id: row.id,
            name: row.name,
            key_value: row.key_value, // Show full key once
            permissions: (() => { try { return JSON.parse(row.permissions || '[]'); } catch { return []; } })(),
            is_active: row.is_active === 1 || row.is_active === true,
            expires_at: row.expires_at || null,
            created_at: row.created_at,
            updated_at: row.created_at,
            created_by: row.created_by,
            created_by_username: row.created_by_username || null,
            usage_count: row.usage_count || 0,
            last_used: row.last_used || null,
            description: row.description || null
        };

        req.app.locals.loggers?.security?.info(`API key created: ${name} by ${req.user?.username || 'system'}`);
        res.json({ success: true, key });
    } catch (error) {
        req.app.locals.loggers?.api?.error('API key creation error:', error);
        res.status(500).json({ success: false, error: 'Failed to create API key: ' + error.message });
    }
});

// Update API key enabled status
router.put('/api-keys/:id', async (req, res) => {
    try {
        const keyId = req.params.id;
        const { is_active } = req.body || {};

        if (typeof is_active === 'undefined') {
            return res.status(400).json({ success: false, error: 'is_active field required' });
        }

        await req.dal.run(
            `UPDATE api_keys SET is_active = ? WHERE id = ?`,
            [is_active ? 1 : 0, keyId]
        );

        req.app.locals.loggers?.security?.info(`API key ${keyId} ${is_active ? 'activated' : 'deactivated'} by ${req.user?.username || 'unknown'}`);
        res.json({ success: true, message: `API key ${is_active ? 'activated' : 'deactivated'}` });
    } catch (error) {
        req.app.locals.loggers?.api?.error('API key update error:', error);
        res.status(500).json({ success: false, error: 'Failed to update API key' });
    }
});

// Delete API key
router.delete('/api-keys/:id', async (req, res) => {
    try {
        const keyId = req.params.id;

        // Get key name for logging
        const key = await req.dal.get(`SELECT name FROM api_keys WHERE id = ?`, [keyId]);

        // Delete from database
        await req.dal.run(`DELETE FROM api_keys WHERE id = ?`, [keyId]);

        req.app.locals.loggers?.security?.warn(`API key "${key?.name || keyId}" revoked by ${req.user?.username || 'unknown'}`);
        res.json({ success: true, message: 'API key revoked' });
    } catch (error) {
        req.app.locals.loggers?.api?.error('API key deletion error:', error);
        res.status(500).json({ success: false, error: 'Failed to revoke API key' });
    }
});

// Regenerate API key (returns new plaintext once)
router.post('/api-keys/:id/regenerate', async (req, res) => {
    try {
        const keyId = req.params.id;

        const newKeyValue = `elk_${crypto.randomBytes(32).toString('hex')}`;

        await req.dal.run(
            `UPDATE api_keys 
             SET key_value = ?
             WHERE id = ?`,
            [newKeyValue, keyId]
        );

        const row = await req.dal.get(
            `SELECT ak.id, ak.name, ak.key_value, ak.description, ak.permissions, ak.is_active, ak.expires_at, ak.created_by, ak.created_at, ak.last_used, ak.usage_count,
                    u.username AS created_by_username
             FROM api_keys ak
             LEFT JOIN users u ON ak.created_by = u.id
             WHERE ak.id = ?`,
            [keyId]
        );

        req.app.locals.loggers?.security?.warn(`API key ${keyId} regenerated by ${req.user?.username || 'unknown'}`);
        res.json({ 
            success: true, 
            key_value: newKeyValue,
            key: {
                id: row.id,
                name: row.name,
                key_value: row.key_value ? `elk_${row.key_value.slice(0, 8)}...${row.key_value.slice(-4)}` : 'elk_••••••••••',
                permissions: (() => { try { return JSON.parse(row.permissions || '[]'); } catch { return []; } })(),
                is_active: row.is_active === 1 || row.is_active === true,
                expires_at: row.expires_at || null,
                created_at: row.created_at,
                updated_at: row.created_at,
                created_by: row.created_by,
                created_by_username: row.created_by_username || null,
                usage_count: row.usage_count || 0,
                last_used: row.last_used || null,
                description: row.description || null
            }
        });
    } catch (error) {
        req.app.locals.loggers?.api?.error('API key regeneration error:', error);
        res.status(500).json({ success: false, error: 'Failed to regenerate API key' });
    }
});

// Toggle API key status (activate/deactivate) - convenience
router.post('/api-keys/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const row = await req.dal.get(`SELECT is_active FROM api_keys WHERE id = ?`, [id]);
        if (!row) return res.status(404).json({ success: false, error: 'API key not found' });
        const next = row.is_active ? 0 : 1;
        await req.dal.run(`UPDATE api_keys SET is_active = ? WHERE id = ?`, [next, id]);
        res.json({ success: true, id, is_active: !!next });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error toggling API key status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test API key validity (basic hash existence + enabled)
router.post('/api-keys/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const row = await req.dal.get(`SELECT id, is_active, expires_at FROM api_keys WHERE id = ?`, [id]);
        if (!row) return res.json({ success: true, test: { keyId: id, valid: false, status: 'not_found' } });
        const now = Date.now();
        const expiresOk = !row.expires_at || new Date(row.expires_at).getTime() > now;
        res.json({ success: true, test: { keyId: id, valid: !!row.is_active && expiresOk, status: row.is_active ? 'active' : 'inactive', expiresAt: row.expires_at || null, lastTestAt: new Date().toISOString() } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get API key permissions templates (static definitions)
router.get('/api-keys/permissions/templates', async (req, res) => {
    try {
        const templates = [
            { id: 'read_only', name: 'Read Only', description: 'Read access to logs and dashboards', permissions: ['log:read', 'dashboard:read', 'search:read'] },
            { id: 'log_writer', name: 'Log Writer', description: 'Write logs and read basic data', permissions: ['log:write', 'log:read'] },
            { id: 'full_access', name: 'Full Access', description: 'Complete access to all API functions', permissions: ['log:*', 'dashboard:*', 'search:*', 'admin:*'] },
            { id: 'analytics', name: 'Analytics Service', description: 'Analytics and reporting access', permissions: ['log:read', 'search:*', 'analytics:*', 'dashboard:read'] },
            { id: 'device_iot', name: 'IoT Device', description: 'Basic log writing for IoT devices', permissions: ['log:write'] }
        ];
        res.json({ success: true, templates });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting permission templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;