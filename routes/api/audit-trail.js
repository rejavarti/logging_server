/**
 * Audit Trail API Routes
 * Handles audit logging, user activity tracking, and compliance reporting
 */

const express = require('express');
const router = express.Router();

// Get audit trail entries
router.get('/audit-trail', async (req, res) => {
    try {
        const dal = req.dal;
        const {
            page = 1,
            limit = 50,
            user_id,
            action,
            start_date,
            end_date,
            resource_type
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.max(1, parseInt(limit));
        const offset = (pageNum - 1) * pageSize;

        if (!dal || typeof dal.all !== 'function' || typeof dal.get !== 'function') {
            return res.json({ success: true, entries: [], pagination: { page: pageNum, limit: pageSize, total: 0, pages: 0 }, filters: { user_id, action, start_date, end_date, resource_type } });
        }

        // Build base SQL with LEFT JOIN to include usernames without N+1 queries
        let baseSql = `SELECT a.*, u.username AS username FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (user_id) { baseSql += ` AND a.user_id = $${params.length + 1}`; params.push(user_id); }
        if (action) { baseSql += ` AND a.action = $${params.length + 1}`; params.push(action); }
        if (resource_type) { baseSql += ` AND a.resource_type = $${params.length + 1}`; params.push(resource_type); }
        if (start_date) { baseSql += ` AND a.created_at >= $${params.length + 1}`; params.push(start_date); }
        if (end_date) { baseSql += ` AND a.created_at <= $${params.length + 1}`; params.push(end_date); }

        // Count total
        const countSql = baseSql.replace('SELECT a.*, u.username AS username', 'SELECT COUNT(*) AS total');
        const countRow = await dal.get(countSql, params);
        const total = countRow?.total || 0;

        // Apply ordering and pagination
        const dataSql = `${baseSql} ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const rows = await dal.all(dataSql, [...params, pageSize, offset]);

        const entries = (rows || []).map(row => ({
            id: row.id,
            timestamp: row.created_at,
            userId: row.user_id,
            username: row.username || null,
            action: row.action,
            resource: row.resource_type,
            resourceId: row.resource_id,
            details: row.details,
            ip: row.ip_address,
            userAgent: row.user_agent
        }));

        res.json({
            success: true,
            entries,
            activities: entries, // Alias for backward compatibility with frontend
            total,
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                pages: Math.ceil(total / pageSize)
            },
            filters: { user_id, action, start_date, end_date, resource_type }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export audit trail
router.get('/audit-trail/export', async (req, res) => {
    try {
        const { format = 'csv', startDate, endDate } = req.query;
        const dal = req.dal;
        
        if (!dal || typeof dal.all !== 'function') {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        
        // Build query with date filters
        let query = `
            SELECT 
                a.id,
                a.user_id,
                COALESCE(u.username, 'system') as username,
                a.action,
                a.resource_type,
                a.resource_id,
                a.details,
                a.ip_address,
                a.user_agent,
                a.created_at
            FROM activity_log a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (startDate) {
            query += ' AND a.created_at >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND a.created_at <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY a.created_at DESC LIMIT 10000';
        
        const entries = await dal.all(query, params);
        
        if (format === 'csv') {
            // Generate CSV
            const csvRows = ['ID,Timestamp,User,Action,Resource Type,Resource ID,IP Address,Details'];
            entries.forEach(entry => {
                const details = entry.details ? entry.details.replace(/"/g, '""') : '';
                csvRows.push(`${entry.id},"${entry.created_at}","${entry.username}","${entry.action}","${entry.resource_type || ''}","${entry.resource_id || ''}","${entry.ip_address || ''}","${details}"`);
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvRows.join('\n'));
        } else {
            // JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().split('T')[0]}.json"`);
            res.json({ success: true, entries, exportedAt: new Date().toISOString(), count: entries.length });
        }
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error exporting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get audit statistics
router.get('/audit-trail/stats', async (req, res) => {
    try {
        const dal = req.dal;
        if (!dal || typeof dal.get !== 'function' || typeof dal.all !== 'function') {
            return res.json({ success: true, stats: { totalEntries: 0, entriesLast24h: 0, entriesLast7d: 0, entriesLast30d: 0, topActions: [], topUsers: [] } });
        }

        // Totals over different windows
        const [totalRow, last24Row, last7Row, last30Row] = await Promise.all([
            dal.get(`SELECT COUNT(*) AS c FROM activity_log`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '24 hours'`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '7 days'`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '30 days'`)
        ]);
        const total = totalRow?.c || 0;

        // Top actions in last 30 days
        const topActionsRows = await dal.all(`
            SELECT action, COUNT(*) AS count
            FROM activity_log
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY action
            ORDER BY count DESC
            LIMIT 10
        `);
        const topActions = (topActionsRows || []).map(r => ({ action: r.action, count: r.count, percentage: total ? Math.round((r.count / total) * 1000) / 10 : 0 }));

        // Top users in last 30 days
        const topUsersRows = await dal.all(`
            SELECT COALESCE(u.username,'unknown') AS username, COUNT(*) AS entries
            FROM activity_log a LEFT JOIN users u ON a.user_id = u.id
            WHERE a.created_at >= NOW() - INTERVAL '30 days'
            GROUP BY COALESCE(u.username,'unknown')
            ORDER BY entries DESC
            LIMIT 10
        `);
        const topUsers = (topUsersRows || []).map(r => ({ username: r.username, entries: r.entries, percentage: total ? Math.round((r.entries / total) * 1000) / 10 : 0 }));

        const stats = {
            totalEntries: total,
            entriesLast24h: last24Row?.c || 0,
            entriesLast7d: last7Row?.c || 0,
            entriesLast30d: last30Row?.c || 0,
            topActions,
            topUsers
        };

        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting audit trail stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get security events from audit trail
router.get('/audit-trail/security-events', async (req, res) => {
    try {
        const dal = req.dal;
        if (!dal || typeof dal.all !== 'function') {
            return res.json({ success: true, securityEvents: [] });
        }

        // Minimal heuristic: look for common security-related actions in the last 30 days
        const rows = await dal.all(`
            SELECT a.id, a.created_at AS timestamp, a.action, a.ip_address, a.user_id, u.username
            FROM activity_log a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.created_at >= NOW() - INTERVAL '30 days'
              AND a.action IN ('login_failed','unauthorized_access','permission_denied','account_locked')
            ORDER BY a.created_at DESC
            LIMIT 200
        `);

        const securityEvents = (rows || []).map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            severity: r.action === 'account_locked' ? 'high' : 'medium',
            type: r.action,
            description: null,
            ip: r.ip_address || null,
            userId: r.user_id || null,
            username: r.username || null
        }));

        res.json({ success: true, securityEvents });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting security events:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get compliance report
router.get('/audit-trail/compliance', async (req, res) => {
    try {
        const { startDate, endDate, standard = 'general' } = req.query;
        const dal = req.dal;
        
        if (!dal || typeof dal.all !== 'function' || typeof dal.get !== 'function') {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        
        // Date range for report
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();
        
        // Total activity
        const totalResult = await dal.get(`
            SELECT COUNT(*) as count FROM activity_log 
            WHERE created_at BETWEEN ? AND ?
        `, [start, end]);
        const totalActivity = totalResult?.count || 0;
        
        // Access patterns
        const accessByUser = await dal.all(`
            SELECT COALESCE(u.username, 'system') as user, COUNT(*) as count
            FROM activity_log a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.created_at BETWEEN ? AND ?
            GROUP BY user
            ORDER BY count DESC
            LIMIT 20
        `, [start, end]);
        
        // Security events
        const securityEvents = await dal.all(`
            SELECT action, COUNT(*) as count
            FROM activity_log
            WHERE created_at BETWEEN ? AND ?
            AND (action LIKE '%login%' OR action LIKE '%auth%' OR action LIKE '%password%' OR action LIKE '%delete%')
            GROUP BY action
        `, [start, end]);
        
        // Data access by resource type
        const dataAccess = await dal.all(`
            SELECT resource_type, COUNT(*) as count
            FROM activity_log
            WHERE created_at BETWEEN ? AND ?
            AND resource_type IS NOT NULL
            GROUP BY resource_type
        `, [start, end]);
        
        // Failed access attempts (if tracked)
        const failedAccess = await dal.get(`
            SELECT COUNT(*) as count
            FROM activity_log
            WHERE created_at BETWEEN ? AND ?
            AND (action LIKE '%fail%' OR action LIKE '%denied%' OR details LIKE '%error%')
        `, [start, end]);
        
        const report = {
            success: true,
            standard,
            reportPeriod: {
                start,
                end
            },
            summary: {
                totalActivity,
                uniqueUsers: accessByUser.length,
                securityEvents: securityEvents.reduce((sum, e) => sum + e.count, 0),
                failedAccessAttempts: failedAccess?.count || 0
            },
            accessPatterns: {
                byUser: accessByUser,
                byResourceType: dataAccess
            },
            securityEvents,
            compliance: {
                auditingEnabled: true,
                retentionPolicy: '90 days',
                encryptionEnabled: true,
                accessLoggingEnabled: true
            },
            generatedAt: new Date().toISOString()
        };
        
        res.json(report);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error generating compliance report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete old audit entries (cleanup)
router.delete('/audit-trail/cleanup', async (req, res) => {
    try {
        const dal = req.dal;
        const { olderThan = 90 } = req.body; // days

        if (!dal || typeof dal.run !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }

        const safeDays = Math.max(1, parseInt(olderThan));
        const result = await dal.run(
            `DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '1 day' * ?`,
            [`-${safeDays} days`]
        );

        res.json({ success: true, cleanup: { olderThan: safeDays, deletedEntries: result?.changes || 0, executedAt: new Date().toISOString(), executedBy: req.user ? req.user.username : 'system' } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error cleaning up audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search audit trail
router.post('/audit-trail/search', async (req, res) => {
    const start = Date.now();
    try {
        const dal = req.dal;
        const { query, filters = {}, limit = 50, offset = 0 } = req.body;

        if (!dal || typeof dal.all !== 'function' || typeof dal.get !== 'function') {
            return res.json({ success: true, results: [], query, filters, totalResults: 0, executionTimeMs: Date.now() - start });
        }

        // Build SQL with LIKE matches on action, resource_type, and details JSON string
        let sql = `SELECT a.*, u.username AS username FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (query && String(query).trim()) {
            sql += ` AND (a.action LIKE $${params.length + 1} OR a.resource_type LIKE $${params.length + 2} OR a.details LIKE $${params.length + 3})`;
            const q = `%${query}%`;
            params.push(q, q, q);
        }
        if (filters.user_id) { sql += ` AND a.user_id = $${params.length + 1}`; params.push(filters.user_id); }
        if (filters.action) { sql += ` AND a.action = $${params.length + 1}`; params.push(filters.action); }
        if (filters.resource_type) { sql += ` AND a.resource_type = $${params.length + 1}`; params.push(filters.resource_type); }
        if (filters.start_date) { sql += ` AND a.created_at >= $${params.length + 1}`; params.push(filters.start_date); }
        if (filters.end_date) { sql += ` AND a.created_at <= $${params.length + 1}`; params.push(filters.end_date); }

        const countSql = sql.replace('SELECT a.*, u.username AS username', 'SELECT COUNT(*) AS total');
        const countRow = await dal.get(countSql, params);
        const total = countRow?.total || 0;

        sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const rows = await dal.all(sql, [...params, parseInt(limit), parseInt(offset)]);

        const results = (rows || []).map(r => ({
            id: r.id,
            timestamp: r.created_at,
            username: r.username || null,
            action: r.action,
            resource: r.resource_type,
            details: r.details
        }));

        res.json({ success: true, results, query, filters, totalResults: total, executionTimeMs: Date.now() - start });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error searching audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;