/**
 * Audit Trail API Routes
 * Handles audit logging, user activity tracking, and compliance reporting
 */

const express = require('express');
const router = express.Router();

// Get audit trail entries
router.get('/audit-trail', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            user, 
            action, 
            startDate, 
            endDate,
            resource 
        } = req.query;

        const auditEntries = [
            {
                id: '1',
                timestamp: '2024-11-02T06:15:00Z',
                userId: 1,
                username: 'admin',
                action: 'user_login',
                resource: '/api/auth/login',
                details: 'Successful login from 192.168.1.100',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                success: true,
                changes: null
            },
            {
                id: '2',
                timestamp: '2024-11-02T06:16:30Z',
                userId: 1,
                username: 'admin',
                action: 'settings_update',
                resource: '/api/settings',
                details: 'Updated system retention policy',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                success: true,
                changes: {
                    field: 'retention_days',
                    oldValue: 30,
                    newValue: 45
                }
            },
            {
                id: '3',
                timestamp: '2024-11-02T06:18:45Z',
                userId: 1,
                username: 'admin',
                action: 'user_create',
                resource: '/api/users',
                details: 'Created new user: analyst',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                success: true,
                changes: {
                    username: 'analyst',
                    role: 'analyst',
                    email: 'analyst@localhost'
                }
            },
            {
                id: '4',
                timestamp: '2024-11-02T06:20:12Z',
                userId: 1,
                username: 'admin',
                action: 'api_key_create',
                resource: '/api/api-keys',
                details: 'Generated new API key: ESP32 Device Key',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                success: true,
                changes: {
                    keyName: 'ESP32 Device Key',
                    permissions: ['log:write']
                }
            },
            {
                id: '5',
                timestamp: '2024-11-02T05:45:23Z',
                userId: 0,
                username: 'system',
                action: 'backup_create',
                resource: '/api/system/backup',
                details: 'Automated database backup created',
                ip: '127.0.0.1',
                userAgent: 'System/1.0',
                success: true,
                changes: {
                    backupFile: 'backup-2024-11-02-054523.zip',
                    size: '15.2MB'
                }
            }
        ];

        // Apply filters
        let filteredEntries = auditEntries;
        
        if (user) {
            filteredEntries = filteredEntries.filter(entry => 
                entry.username.toLowerCase().includes(user.toLowerCase())
            );
        }
        
        if (action) {
            filteredEntries = filteredEntries.filter(entry => 
                entry.action.includes(action)
            );
        }

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

        res.json({ 
            success: true, 
            entries: paginatedEntries,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: filteredEntries.length,
                pages: Math.ceil(filteredEntries.length / limit)
            },
            filters: { user, action, startDate, endDate, resource }
        });
    } catch (error) {
        console.error('Error getting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export audit trail
router.get('/audit-trail/export', async (req, res) => {
    try {
        const { format = 'csv', startDate, endDate } = req.query;
        
        console.log(`Audit trail export requested (${format}) by ${req.user ? req.user.username : 'system'}`);

        const exportData = {
            format,
            generatedAt: new Date().toISOString(),
            generatedBy: req.user ? req.user.username : 'system',
            dateRange: { startDate, endDate },
            totalRecords: 1247,
            downloadUrl: `/downloads/audit-trail-${Date.now()}.${format}`,
            expiresAt: new Date(Date.now() + 3600000).toISOString()
        };

        res.json({ success: true, export: exportData });
    } catch (error) {
        console.error('Error exporting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get audit statistics
router.get('/audit-trail/stats', async (req, res) => {
    try {
        const stats = {
            totalEntries: 12547,
            entriesLast24h: 234,
            entriesLast7d: 1847,
            entriesLast30d: 8934,
            topActions: [
                { action: 'user_login', count: 2345, percentage: 18.7 },
                { action: 'log_search', count: 1876, count: 14.9 },
                { action: 'settings_view', count: 1234, percentage: 9.8 },
                { action: 'dashboard_view', count: 987, percentage: 7.9 },
                { action: 'api_key_use', count: 756, percentage: 6.0 }
            ],
            topUsers: [
                { username: 'admin', entries: 4567, percentage: 36.4 },
                { username: 'analyst', entries: 2345, percentage: 18.7 },
                { username: 'viewer', entries: 1234, percentage: 9.8 },
                { username: 'system', entries: 3456, percentage: 27.5 }
            ],
            successRate: 94.7,
            failureRate: 5.3,
            securityEvents: 45,
            complianceScore: 98.2
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting audit trail stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get security events from audit trail
router.get('/audit-trail/security-events', async (req, res) => {
    try {
        const securityEvents = [
            {
                id: '1',
                timestamp: '2024-11-02T06:15:00Z',
                severity: 'high',
                type: 'multiple_login_failures',
                description: 'Multiple failed login attempts from IP 203.0.113.45',
                ip: '203.0.113.45',
                userId: null,
                username: 'attempted: admin',
                attempts: 5,
                blocked: true,
                resolved: false
            },
            {
                id: '2',
                timestamp: '2024-11-02T05:30:00Z',
                severity: 'medium',
                type: 'suspicious_api_usage',
                description: 'High volume API requests from single IP',
                ip: '198.51.100.23',
                userId: 3,
                username: 'api_user',
                attempts: 1500,
                blocked: true,
                resolved: true
            },
            {
                id: '3',
                timestamp: '2024-11-02T04:45:00Z',
                severity: 'low',
                type: 'unusual_access_time',
                description: 'User access outside normal hours',
                ip: '192.168.1.105',
                userId: 2,
                username: 'viewer',
                attempts: 1,
                blocked: false,
                resolved: true
            }
        ];

        res.json({ success: true, securityEvents });
    } catch (error) {
        console.error('Error getting security events:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get compliance report
router.get('/audit-trail/compliance', async (req, res) => {
    try {
        const { period = '30d', standard = 'general' } = req.query;
        
        const complianceReport = {
            period,
            standard,
            generatedAt: new Date().toISOString(),
            generatedBy: req.user ? req.user.username : 'system',
            score: 98.2,
            findings: [
                {
                    category: 'Access Control',
                    status: 'compliant',
                    score: 100,
                    details: 'All access attempts properly logged and controlled'
                },
                {
                    category: 'Data Retention',
                    status: 'compliant', 
                    score: 98,
                    details: 'Automated retention policies enforced'
                },
                {
                    category: 'User Management',
                    status: 'compliant',
                    score: 96,
                    details: '2 inactive users should be reviewed'
                },
                {
                    category: 'System Changes',
                    status: 'compliant',
                    score: 100,
                    details: 'All system changes properly documented'
                }
            ],
            recommendations: [
                'Review and disable inactive user accounts',
                'Consider implementing multi-factor authentication',
                'Schedule regular compliance audits'
            ],
            auditTrail: {
                totalEvents: 12547,
                securityEvents: 45,
                criticalEvents: 3,
                resolvedEvents: 42
            }
        };

        res.json({ success: true, report: complianceReport });
    } catch (error) {
        console.error('Error generating compliance report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete old audit entries (cleanup)
router.delete('/audit-trail/cleanup', async (req, res) => {
    try {
        const { olderThan = 90 } = req.body; // days
        
        console.log(`Audit trail cleanup initiated (${olderThan} days) by ${req.user ? req.user.username : 'system'}`);

        const cleanup = {
            olderThan,
            deletedEntries: 2456,
            spaceFreed: '45.2MB',
            executedAt: new Date().toISOString(),
            executedBy: req.user ? req.user.username : 'system'
        };

        res.json({ success: true, cleanup });
    } catch (error) {
        console.error('Error cleaning up audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search audit trail
router.post('/audit-trail/search', async (req, res) => {
    try {
        const { query, filters = {}, limit = 50, offset = 0 } = req.body;
        
        // Mock search results
        const searchResults = [
            {
                id: '1',
                timestamp: '2024-11-02T06:15:00Z',
                username: 'admin',
                action: 'user_create',
                resource: '/api/users',
                details: 'Created new user matching search criteria',
                relevance: 0.95
            }
        ];

        res.json({ 
            success: true, 
            results: searchResults,
            query,
            filters,
            totalResults: 15,
            executionTime: '125ms'
        });
    } catch (error) {
        console.error('Error searching audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;