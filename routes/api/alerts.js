/**
 * Alerts API Routes
 * Handles all alert-related endpoints
 */

const express = require('express');
const router = express.Router();

// Get all alerts
router.get('/alerts', async (req, res) => {
    try {
        // Mock alert data matching monolithic implementation
        const alerts = [
            {
                id: '1',
                type: 'error',
                title: 'High Error Rate',
                description: 'Error rate exceeded threshold of 5%',
                status: 'active',
                severity: 'high',
                source: 'log-monitoring',
                created: '2024-11-02T06:15:00Z',
                acknowledged: false,
                resolved: false,
                acknowledgedBy: null,
                resolvedBy: null,
                data: {
                    threshold: 5,
                    currentRate: 8.2,
                    affectedSources: ['web-server', 'api-gateway']
                }
            },
            {
                id: '2',
                type: 'warning',
                title: 'Storage Space Low',
                description: 'Available storage space is below 20%',
                status: 'active', 
                severity: 'medium',
                source: 'system-monitoring',
                created: '2024-11-02T05:30:00Z',
                acknowledged: true,
                resolved: false,
                acknowledgedBy: 'admin',
                resolvedBy: null,
                data: {
                    threshold: 20,
                    currentSpace: 15.8,
                    totalSpace: '500GB'
                }
            }
        ];

        res.json({ success: true, alerts });
    } catch (error) {
        console.error('Error getting alerts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Acknowledge alert
router.post('/alerts/:id/acknowledge', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user.id : 'system';
        
        // Log the acknowledgment
        console.log(`Alert ${id} acknowledged by user ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Alert acknowledged successfully',
            acknowledgedBy: req.user ? req.user.username : 'system',
            acknowledgedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resolve alert
router.post('/alerts/:id/resolve', async (req, res) => {
    try {
        const { id } = req.params;
        const { resolution } = req.body;
        const userId = req.user ? req.user.id : 'system';
        
        // Log the resolution
        console.log(`Alert ${id} resolved by user ${userId}: ${resolution}`);
        
        res.json({ 
            success: true, 
            message: 'Alert resolved successfully',
            resolvedBy: req.user ? req.user.username : 'system',
            resolvedAt: new Date().toISOString(),
            resolution
        });
    } catch (error) {
        console.error('Error resolving alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete alert
router.delete('/alerts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user.id : 'system';
        
        // Log the deletion
        console.log(`Alert ${id} deleted by user ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Alert deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get alert rules
router.get('/alerts/rules', async (req, res) => {
    try {
        const rules = [
            {
                id: '1',
                name: 'High Error Rate',
                description: 'Trigger when error rate exceeds threshold',
                enabled: true,
                conditions: {
                    metric: 'error_rate',
                    operator: 'greater_than',
                    value: 5,
                    timeWindow: '5m'
                },
                actions: ['email', 'webhook'],
                severity: 'high',
                created: '2024-01-15T10:30:00Z',
                lastTriggered: '2024-11-02T06:15:00Z'
            }
        ];

        res.json({ success: true, rules });
    } catch (error) {
        console.error('Error getting alert rules:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get alert history
router.get('/alerts/history', async (req, res) => {
    try {
        const history = [
            {
                id: '1',
                alertId: '1',
                type: 'triggered',
                timestamp: '2024-11-02T06:15:00Z',
                data: { errorRate: 8.2, threshold: 5 }
            }
        ];

        res.json({ success: true, history });
    } catch (error) {
        console.error('Error getting alert history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create alert rule
router.post('/alerts/rules', async (req, res) => {
    try {
        const ruleData = req.body;
        const userId = req.user ? req.user.id : 'system';
        
        const newRule = {
            id: Date.now().toString(),
            ...ruleData,
            created: new Date().toISOString(),
            enabled: true
        };

        console.log(`Alert rule created: ${ruleData.name} by user ${userId}`);

        res.json({ success: true, rule: newRule });
    } catch (error) {
        console.error('Error creating alert rule:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update alert rule
router.put('/alerts/rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user ? req.user.id : 'system';

        console.log(`Alert rule ${id} updated by user ${userId}`);

        res.json({ 
            success: true, 
            rule: { id, ...updates, updated: new Date().toISOString() }
        });
    } catch (error) {
        console.error('Error updating alert rule:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get alert stats
router.get('/alerts/stats', async (req, res) => {
    try {
        const stats = {
            totalAlerts: 25,
            activeAlerts: 2,
            resolvedAlerts: 20,
            acknowledgedAlerts: 3,
            criticalAlerts: 1,
            highAlerts: 1,
            mediumAlerts: 0,
            lowAlerts: 0,
            alertsLast24h: 5,
            alertsLast7days: 18,
            avgResolutionTime: '45m'
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting alert stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Alert channels
router.get('/alerts/channels', async (req, res) => {
    try {
        const channels = [
            {
                id: '1',
                name: 'Email Notifications',
                type: 'email',
                enabled: true,
                config: {
                    smtp: 'smtp.gmail.com',
                    port: 587,
                    recipients: ['admin@localhost']
                }
            }
        ];

        res.json({ success: true, channels });
    } catch (error) {
        console.error('Error getting alert channels:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create alert channel
router.post('/alerts/channels', async (req, res) => {
    try {
        const channelData = req.body;
        
        const newChannel = {
            id: Date.now().toString(),
            ...channelData,
            created: new Date().toISOString(),
            enabled: true
        };

        res.json({ success: true, channel: newChannel });
    } catch (error) {
        console.error('Error creating alert channel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update alert channel
router.put('/alerts/channels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        res.json({ 
            success: true, 
            channel: { id, ...updates, updated: new Date().toISOString() }
        });
    } catch (error) {
        console.error('Error updating alert channel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete alert channel
router.delete('/alerts/channels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        res.json({ 
            success: true, 
            message: 'Alert channel deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting alert channel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test alert channel
router.post('/alerts/channels/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Simulate sending test alert
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        res.json({ 
            success: true, 
            message: 'Test alert sent successfully',
            sentAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error testing alert channel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
