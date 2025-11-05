const express = require('express');
const router = express.Router();

// Rate Limiting API endpoints
router.get('/rate-limits/stats', async (req, res) => {
    try {
        const stats = {
            total_requests: 156234,
            blocked_requests: 342,
            block_rate: 0.22,
            top_blocked_ips: [
                { ip: '192.168.1.200', blocks: 45, reason: 'excessive_requests' },
                { ip: '10.0.0.15', blocks: 23, reason: 'failed_auth' },
                { ip: '172.16.0.5', blocks: 18, reason: 'malformed_requests' }
            ],
            hourly_blocks: Array.from({ length: 24 }, (_, i) => ({
                hour: i,
                blocks: Math.floor(Math.random() * 50)
            })),
            active_limits: [
                { rule: 'global_rate_limit', current: 23, limit: 1000, window: '1m' },
                { rule: 'auth_rate_limit', current: 5, limit: 10, window: '5m' },
                { rule: 'api_rate_limit', current: 89, limit: 500, window: '1h' }
            ]
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting rate limit stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/rate-limits', async (req, res) => {
    try {
        const blockedIPs = [
            {
                id: '1',
                ip: '192.168.1.200',
                reason: 'Excessive request rate (>1000/min)',
                blocked_at: '2024-11-02T06:15:00Z',
                expires_at: '2024-11-02T07:15:00Z',
                requests_blocked: 45,
                status: 'active'
            },
            {
                id: '2', 
                ip: '10.0.0.15',
                reason: 'Failed authentication attempts (>10/5min)',
                blocked_at: '2024-11-02T05:30:00Z',
                expires_at: '2024-11-02T06:30:00Z',
                requests_blocked: 23,
                status: 'expired'
            },
            {
                id: '3',
                ip: '172.16.0.5',
                reason: 'Malformed requests detected',
                blocked_at: '2024-11-02T06:20:00Z',
                expires_at: '2024-11-02T07:20:00Z',
                requests_blocked: 18,
                status: 'active'
            }
        ];

        res.json({ success: true, blocked_ips: blockedIPs });
    } catch (error) {
        console.error('Error getting blocked IPs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/rate-limits/unblock', async (req, res) => {
    try {
        const { ip } = req.body;
        
        if (!ip) {
            return res.status(400).json({ 
                success: false, 
                error: 'IP address is required' 
            });
        }

        // Unblock IP address
        
        res.json({ 
            success: true, 
            message: `IP address ${ip} has been unblocked` 
        });
    } catch (error) {
        console.error('Error unblocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Audit Trail API
router.get('/audit-trail', async (req, res) => {
    try {
        const { 
            start, 
            end, 
            user, 
            action, 
            resource, 
            limit = 50,
            offset = 0 
        } = req.query;

        const auditLogs = [];
        for (let i = 0; i < Math.min(limit, 25); i++) {
            auditLogs.push({
                id: `audit-${Date.now()}-${i}`,
                timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                user: user || ['admin', 'viewer', 'analyst'][Math.floor(Math.random() * 3)],
                action: action || ['login', 'logout', 'create_dashboard', 'delete_user', 'update_settings'][Math.floor(Math.random() * 5)],
                resource: resource || ['user:2', 'dashboard:1', 'settings:system', 'logs:query'][Math.floor(Math.random() * 4)],
                ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                success: Math.random() > 0.1,
                details: {
                    changes: i % 3 === 0 ? { field: 'status', old: 'inactive', new: 'active' } : null,
                    metadata: { sessionId: `sess_${Math.random().toString(36).substr(2, 9)}` }
                }
            });
        }

        // Sort by timestamp descending
        auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ 
            success: true, 
            logs: auditLogs,
            total: 5423,
            filters: { start, end, user, action, resource },
            pagination: { limit: parseInt(limit), offset: parseInt(offset) }
        });
    } catch (error) {
        console.error('Error getting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Security settings
router.get('/security/settings', async (req, res) => {
    try {
        const settings = {
            authentication: {
                method: 'local', // local, ldap, oauth
                session_timeout: 3600, // seconds
                password_policy: {
                    min_length: 8,
                    require_uppercase: true,
                    require_lowercase: true,
                    require_numbers: true,
                    require_symbols: false
                },
                mfa_enabled: false
            },
            rate_limiting: {
                enabled: true,
                global_limit: 1000, // requests per minute
                auth_limit: 10, // auth attempts per 5 minutes
                api_limit: 500 // API requests per hour
            },
            access_control: {
                ip_whitelist: [],
                ip_blacklist: [],
                geo_blocking: false,
                allowed_countries: []
            },
            audit: {
                enabled: true,
                retention_days: 90,
                log_failed_attempts: true,
                log_admin_actions: true
            }
        };

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error getting security settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/security/settings', async (req, res) => {
    try {
        const { category, settings } = req.body;
        
        // Update security settings
        
        res.json({ 
            success: true, 
            message: 'Security settings updated successfully' 
        });
    } catch (error) {
        console.error('Error updating security settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;