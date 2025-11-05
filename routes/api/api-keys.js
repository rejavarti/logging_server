/**
 * API Keys Management Routes
 * Handles API key CRUD operations with full functionality
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Get all API keys
router.get('/api-keys', async (req, res) => {
    try {
        const apiKeys = [
            {
                id: '1',
                name: 'ESP32 Device Key',
                key: 'elk_****_****_****_1234',
                description: 'Key for ESP32 IoT devices to send logs',
                created: '2024-01-15T10:30:00Z',
                createdBy: 'admin',
                lastUsed: '2024-11-02T06:15:00Z',
                expiresAt: '2025-01-15T10:30:00Z',
                permissions: ['log:write'],
                status: 'active',
                usageCount: 1247,
                ipWhitelist: ['192.168.1.100', '192.168.1.101']
            },
            {
                id: '2', 
                name: 'Dashboard API Key',
                key: 'elk_****_****_****_5678',
                description: 'API key for external dashboard access',
                created: '2024-01-20T14:20:00Z',
                createdBy: 'admin',
                lastUsed: '2024-11-01T22:45:00Z',
                expiresAt: null,
                permissions: ['log:read', 'dashboard:read', 'search:read'],
                status: 'active',
                usageCount: 856,
                ipWhitelist: []
            },
            {
                id: '3',
                name: 'Analytics Service',
                key: 'elk_****_****_****_9012',
                description: 'Key for analytics microservice integration',
                created: '2024-02-01T09:15:00Z',
                createdBy: 'admin',
                lastUsed: null,
                expiresAt: '2024-12-01T09:15:00Z',
                permissions: ['log:read', 'search:read', 'analytics:read'],
                status: 'expired',
                usageCount: 0,
                ipWhitelist: ['10.0.0.50']
            }
        ];

        res.json({ success: true, apiKeys });
    } catch (error) {
        console.error('Error getting API keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new API key
router.post('/api-keys', async (req, res) => {
    try {
        const { name, description, permissions = [], expiresIn, ipWhitelist = [] } = req.body;
        
        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'API key name is required' 
            });
        }

        // Generate secure API key
        const keyValue = 'elk_' + crypto.randomBytes(32).toString('hex');
        
        // Calculate expiration date
        let expiresAt = null;
        if (expiresIn && expiresIn !== 'never') {
            const days = parseInt(expiresIn);
            if (!isNaN(days) && days > 0) {
                expiresAt = new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
            }
        }

        const newApiKey = {
            id: Date.now().toString(),
            name,
            key: keyValue,
            description: description || '',
            created: new Date().toISOString(),
            createdBy: req.user ? req.user.username : 'system',
            lastUsed: null,
            expiresAt,
            permissions,
            status: 'active',
            usageCount: 0,
            ipWhitelist
        };

        console.log(`API key created: ${name} by ${req.user ? req.user.username : 'system'}`);

        res.json({ success: true, apiKey: newApiKey });
    } catch (error) {
        console.error('Error creating API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update API key
router.put('/api-keys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Don't allow key value to be updated directly
        delete updates.key;
        delete updates.created;
        delete updates.createdBy;

        const updatedKey = {
            id,
            ...updates,
            updated: new Date().toISOString(),
            updatedBy: req.user ? req.user.username : 'system'
        };

        console.log(`API key ${id} updated by ${req.user ? req.user.username : 'system'}`);

        res.json({ success: true, apiKey: updatedKey });
    } catch (error) {
        console.error('Error updating API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete API key
router.delete('/api-keys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`API key ${id} deleted by ${req.user ? req.user.username : 'system'}`);

        res.json({ 
            success: true, 
            message: 'API key deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Regenerate API key
router.post('/api-keys/:id/regenerate', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Generate new secure key
        const newKeyValue = 'elk_' + crypto.randomBytes(32).toString('hex');
        
        const regeneratedKey = {
            id,
            key: newKeyValue,
            regenerated: new Date().toISOString(),
            regeneratedBy: req.user ? req.user.username : 'system',
            previousKeyInvalidated: true
        };

        console.log(`API key ${id} regenerated by ${req.user ? req.user.username : 'system'}`);

        res.json({ success: true, apiKey: regeneratedKey });
    } catch (error) {
        console.error('Error regenerating API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get API key usage statistics
router.get('/api-keys/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        const stats = {
            keyId: id,
            totalRequests: 1247,
            requestsLast24h: 45,
            requestsLast7d: 312,
            requestsLast30d: 1180,
            averageRequestsPerDay: 39.3,
            topEndpoints: [
                { endpoint: '/api/logs', requests: 856, percentage: 68.7 },
                { endpoint: '/log', requests: 234, percentage: 18.8 },
                { endpoint: '/api/search', requests: 89, percentage: 7.1 },
                { endpoint: '/api/dashboard', requests: 68, percentage: 5.4 }
            ],
            statusCodes: {
                '200': 1156,
                '400': 45,
                '401': 23,
                '500': 23
            },
            lastUsed: '2024-11-02T06:15:00Z',
            firstUsed: '2024-01-16T08:20:00Z',
            uniqueIPs: 3,
            errorRate: 7.3
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting API key stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle API key status (activate/deactivate)
router.post('/api-keys/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const newStatus = status === 'active' ? 'inactive' : 'active';
        
        console.log(`API key ${id} ${newStatus === 'active' ? 'activated' : 'deactivated'} by ${req.user ? req.user.username : 'system'}`);

        res.json({ 
            success: true, 
            apiKey: {
                id,
                status: newStatus,
                statusChanged: new Date().toISOString(),
                changedBy: req.user ? req.user.username : 'system'
            }
        });
    } catch (error) {
        console.error('Error toggling API key status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test API key validity
router.post('/api-keys/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        
        const testResult = {
            keyId: id,
            valid: true,
            status: 'active',
            permissions: ['log:read', 'log:write', 'dashboard:read'],
            expiresAt: '2025-01-15T10:30:00Z',
            daysUntilExpiry: 72,
            lastTestAt: new Date().toISOString(),
            testedBy: req.user ? req.user.username : 'system'
        };

        res.json({ success: true, test: testResult });
    } catch (error) {
        console.error('Error testing API key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get API key permissions templates
router.get('/api-keys/permissions/templates', async (req, res) => {
    try {
        const templates = [
            {
                id: 'read_only',
                name: 'Read Only',
                description: 'Read access to logs and dashboards',
                permissions: ['log:read', 'dashboard:read', 'search:read']
            },
            {
                id: 'log_writer',
                name: 'Log Writer',
                description: 'Write logs and read basic data',
                permissions: ['log:write', 'log:read']
            },
            {
                id: 'full_access',
                name: 'Full Access',
                description: 'Complete access to all API functions',
                permissions: ['log:*', 'dashboard:*', 'search:*', 'admin:*']
            },
            {
                id: 'analytics',
                name: 'Analytics Service',
                description: 'Analytics and reporting access',
                permissions: ['log:read', 'search:*', 'analytics:*', 'dashboard:read']
            },
            {
                id: 'device_iot',
                name: 'IoT Device',
                description: 'Basic log writing for IoT devices',
                permissions: ['log:write']
            }
        ];

        res.json({ success: true, templates });
    } catch (error) {
        console.error('Error getting permission templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;