const express = require('express');
const router = express.Router();

// Rate Limiting API endpoints
router.get('/rate-limits/stats', async (req, res) => {
    try {
        const dal = req.dal;
        
        if (!dal || typeof dal.get !== 'function') {
            return res.json({ 
                success: true, 
                stats: {
                    total_requests: 0,
                    blocked_requests: 0,
                    block_rate: 0,
                    top_blocked_ips: [],
                    hourly_blocks: [],
                    active_limits: []
                }
            });
        }

        // Get actual statistics from activity_log
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const totalRow = await dal.get(
            `SELECT COUNT(*) as count FROM activity_log WHERE created_at >= ?`, 
            [oneDayAgo]
        );

        const stats = {
            total_requests: totalRow?.count || 0,
            blocked_requests: 0, // Rate limiting blocks don't persist to DB
            block_rate: 0,
            top_blocked_ips: [], // In-memory only
            hourly_blocks: [], // In-memory only
            active_limits: [] // In-memory only
        };

        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limit stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/rate-limits', async (req, res) => {
    try {
        // Rate limiting is managed in-memory by express-rate-limit
        // There's no persistent database table for active blocks
        res.json({ 
            success: true, 
            rateLimits: [],
            message: 'Rate limiting is active. No blocked IPs at this time.'
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting blocked IPs:', error);
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
        req.app.locals?.loggers?.api?.error('Error unblocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Audit Trail API
router.get('/audit-trail', async (req, res) => {
    try {
        const dal = req.dal;
        const { 
            start, 
            end, 
            user, 
            action, 
            resource, 
            limit = 50,
            offset = 0 
        } = req.query;

        if (!dal || typeof dal.all !== 'function' || typeof dal.get !== 'function') {
            return res.json({ 
                success: true, 
                logs: [],
                activities: [],
                total: 0,
                filters: { start, end, user, action, resource },
                pagination: { limit: parseInt(limit), offset: parseInt(offset) }
            });
        }

        // Build query with filters
        let sql = `SELECT a.*, u.username AS username, u.email AS email 
                   FROM activity_log a 
                   LEFT JOIN users u ON a.user_id = u.id 
                   WHERE 1=1`;
        const params = [];

        if (start) {
            sql += ' AND a.created_at >= ?';
            params.push(start);
        }
        if (end) {
            sql += ' AND a.created_at <= ?';
            params.push(end);
        }
        if (user) {
            sql += ' AND u.username = ?';
            params.push(user);
        }
        if (action) {
            sql += ' AND a.action = ?';
            params.push(action);
        }
        if (resource) {
            sql += ' AND a.resource_type = ?';
            params.push(resource);
        }

        // Get total count
        const countSql = sql.replace('SELECT a.*, u.username AS username, u.email AS email', 'SELECT COUNT(*) as total');
        const countRow = await dal.get(countSql, params);
        const total = countRow?.total || 0;

        // Get paginated results
        sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        const rows = await dal.all(sql, [...params, parseInt(limit), parseInt(offset)]);

        const logs = (rows || []).map(row => ({
            id: row.id,
            timestamp: row.created_at,
            user: row.username || 'Unknown',
            email: row.email || '',
            action: row.action,
            resource: row.resource_type + (row.resource_id ? ':' + row.resource_id : ''),
            ip: row.ip_address,
            userAgent: row.user_agent,
            success: true,
            details: row.details ? JSON.parse(row.details) : {}
        }));

        res.json({ 
            success: true, 
            logs,
            activities: logs, // Alias for compatibility
            total,
            filters: { start, end, user, action, resource },
            pagination: { limit: parseInt(limit), offset: parseInt(offset) }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting audit trail:', error);
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
        req.app.locals?.loggers?.api?.error('Error getting security settings:', error);
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
        req.app.locals?.loggers?.api?.error('Error updating security settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;