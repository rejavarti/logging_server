const express = require('express');
const router = express.Router();

/**
 * Encrypted Secrets Management API
 * Allows secure storage and retrieval of integration credentials
 */

// List all secret keys (not values)
router.get('/secrets', async (req, res) => {
    try {
        if (!req.dal || typeof req.dal.listEncryptedSecretKeys !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        const keys = await req.dal.listEncryptedSecretKeys();
        res.json({ success: true, secrets: keys });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error listing secrets:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Store or update a secret
router.post('/secrets', async (req, res) => {
    try {
        const { key_name, value, metadata } = req.body;
        
        if (!key_name || !value) {
            return res.status(400).json({ success: false, error: 'key_name and value are required' });
        }
        
        if (!req.dal || typeof req.dal.storeEncryptedSecret !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        // Get encryption system from app locals
        const encryptionSystem = req.app.locals.encryptionSystem;
        const masterKey = process.env.JWT_SECRET || 'default-encryption-key-change-me';
        
        if (!encryptionSystem) {
            return res.status(503).json({ success: false, error: 'Encryption system not available' });
        }
        
        // Encrypt the value
        const encryptedValue = encryptionSystem.encrypt(value, masterKey);
        
        // Store in database
        await req.dal.storeEncryptedSecret(key_name, encryptedValue, metadata);
        
        // Update runtime config if it's a known integration secret
        if (key_name === 'homeassistant_token' && req.config?.integrations?.homeAssistant) {
            req.config.integrations.homeAssistant.token = value;
            // Trigger reconnection if integration manager is available
            const mgr = req.app.locals.getManagers?.()?.integrationManager;
            if (mgr && typeof mgr.updateHomeAssistantConfig === 'function') {
                mgr.updateHomeAssistantConfig({
                    token: value
                });
            }
        }
        
        res.json({ success: true, message: 'Secret stored successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error storing secret:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get a secret (decrypted)
router.get('/secrets/:key_name', async (req, res) => {
    try {
        const { key_name } = req.params;
        
        if (!req.dal || typeof req.dal.getEncryptedSecret !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        const record = await req.dal.getEncryptedSecret(key_name);
        
        if (!record) {
            return res.status(404).json({ success: false, error: 'Secret not found' });
        }
        
        // Get encryption system from app locals
        const encryptionSystem = req.app.locals.encryptionSystem;
        const masterKey = process.env.JWT_SECRET || 'default-encryption-key-change-me';
        
        if (!encryptionSystem) {
            return res.status(503).json({ success: false, error: 'Encryption system not available' });
        }
        
        // Decrypt the value
        const decryptedValue = encryptionSystem.decrypt(record.encryptedValue, masterKey);
        
        res.json({
            success: true,
            secret: {
                key_name,
                value: decryptedValue,
                metadata: record.metadata,
                created_at: record.createdAt,
                updated_at: record.updatedAt
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error retrieving secret:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a secret
router.delete('/secrets/:key_name', async (req, res) => {
    try {
        const { key_name } = req.params;
        
        if (!req.dal || typeof req.dal.deleteEncryptedSecret !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        await req.dal.deleteEncryptedSecret(key_name);
        
        // Clear from runtime config if it's a known integration secret
        if (key_name === 'homeassistant_token' && req.config?.integrations?.homeAssistant) {
            req.config.integrations.homeAssistant.token = '';
            const mgr = req.app.locals.getManagers?.()?.integrationManager;
            if (mgr && typeof mgr.updateHomeAssistantConfig === 'function') {
                mgr.updateHomeAssistantConfig({
                    enabled: false,
                    token: ''
                });
            }
        }
        
        res.json({ success: true, message: 'Secret deleted successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting secret:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rotate a secret (update with new value)
router.put('/secrets/:key_name/rotate', async (req, res) => {
    try {
        const { key_name } = req.params;
        const { new_value } = req.body;
        
        if (!new_value) {
            return res.status(400).json({ success: false, error: 'new_value is required' });
        }
        
        if (!req.dal || typeof req.dal.storeEncryptedSecret !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        
        // Get encryption system
        const encryptionSystem = req.app.locals.encryptionSystem;
        const masterKey = process.env.JWT_SECRET || 'default-encryption-key-change-me';
        
        if (!encryptionSystem) {
            return res.status(503).json({ success: false, error: 'Encryption system not available' });
        }
        
        // Encrypt new value
        const encryptedValue = encryptionSystem.encrypt(new_value, masterKey);
        
        // Store with rotation metadata
        await req.dal.storeEncryptedSecret(key_name, encryptedValue, {
            rotated_at: new Date().toISOString(),
            rotation_reason: req.body.reason || 'manual'
        });
        
        // Update runtime config if needed
        if (key_name === 'homeassistant_token' && req.config?.integrations?.homeAssistant) {
            req.config.integrations.homeAssistant.token = new_value;
            const mgr = req.app.locals.getManagers?.()?.integrationManager;
            if (mgr && typeof mgr.updateHomeAssistantConfig === 'function') {
                mgr.updateHomeAssistantConfig({
                    token: new_value
                });
            }
        }
        
        res.json({ success: true, message: 'Secret rotated successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error rotating secret:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
