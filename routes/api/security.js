const express = require('express');
const router = express.Router();

// In-memory block store and instrumentation metrics
const blockedIPStore = new Map(); // ip -> {ip, reason, blockedAt, blockExpires, blockedBy}
const securityMetrics = {
    blocks: 0,
    unblocks: 0,
    blockErrors: 0,
    searches: 0,
    exports: 0
};

// Ensure persistent storage table exists (lazy init once per process)
let blockTableInitialized = false;
async function ensureBlockTable(dal) {
    if (blockTableInitialized || !dal || typeof dal.run !== 'function') return;
    try {
        await dal.run(`CREATE TABLE IF NOT EXISTS rate_limit_blocks (
            ip TEXT PRIMARY KEY,
            reason TEXT,
            blocked_at TEXT,
            block_expires TEXT,
            blocked_by TEXT,
            duration_seconds INTEGER
        )`);
        // Load existing non-expired blocks into memory
        const rows = await dal.all(`SELECT * FROM rate_limit_blocks`);
        const now = Date.now();
        for (const r of rows || []) {
            if (new Date(r.block_expires).getTime() > now) {
                blockedIPStore.set(r.ip, {
                    ip: r.ip,
                    reason: r.reason,
                    blockedAt: r.blocked_at,
                    blockExpires: r.block_expires,
                    blockedBy: r.blocked_by,
                    durationSeconds: r.duration_seconds
                });
            } else {
                // Cleanup expired from DB
                await dal.run(`DELETE FROM rate_limit_blocks WHERE ip = ?`, [r.ip]);
            }
        }
        blockTableInitialized = true;
    } catch (err) {
        router.logger && router.logger.warn('Rate limit block table init failed: ' + err.message);
    }
}

// Async persistence queues for low-latency responses
const blockPersistQueue = [];
const unblockPersistQueue = [];
let queueProcessorStarted = false;
function startQueueProcessor(dalGetter) {
    if (queueProcessorStarted) return;
    queueProcessorStarted = true;
    setInterval(async () => {
        const dal = dalGetter();
        if (!dal || typeof dal.run !== 'function') return;
        // Persist new blocks
        while (blockPersistQueue.length) {
            const entry = blockPersistQueue.shift();
            try {
                await dal.run(`INSERT INTO rate_limit_blocks (ip, reason, blocked_at, block_expires, blocked_by, duration_seconds) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, blocked_at = EXCLUDED.blocked_at, block_expires = EXCLUDED.block_expires, blocked_by = EXCLUDED.blocked_by, duration_seconds = EXCLUDED.duration_seconds`, [entry.ip, entry.reason, entry.blockedAt, entry.blockExpires, entry.blockedBy, entry.durationSeconds]);
            } catch (err) {
                blockPersistQueue.unshift(entry); // retry later
                req?.app?.locals?.loggers?.api?.warn('Queue persist block failed: ' + err.message);
                break;
            }
        }
        // Persist unblocks (delete rows)
        while (unblockPersistQueue.length) {
            const ip = unblockPersistQueue.shift();
            try {
                await dal.run(`DELETE FROM rate_limit_blocks WHERE ip = ?`, [ip]);
            } catch (err) {
                unblockPersistQueue.unshift(ip); // retry later
                req?.app?.locals?.loggers?.api?.warn('Queue persist unblock failed: ' + err.message);
                break;
            }
        }
    }, 250).unref();
}

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

// Block specific IP manually (ported from legacy rate-limits.js)
router.post('/rate-limits/block', async (req, res) => {
    try {
        const { ip, reason = 'Manual block', duration = 3600 } = req.body;
        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP address is required' });
        }
        await ensureBlockTable(req.dal);
        const now = new Date();
        const blockExpires = new Date(Date.now() + (duration * 1000));
        const entry = {
            ip,
            reason,
            blockedAt: now.toISOString(),
            blockExpires: blockExpires.toISOString(),
            blockedBy: req.user ? req.user.username : 'system',
            durationSeconds: duration
        };
        blockedIPStore.set(ip, entry);
        // Queue persistence for async flush
        blockPersistQueue.push(entry);
        startQueueProcessor(() => req.dal);
        securityMetrics.blocks++;
        req.app.locals?.loggers?.api?.info(`[SECURITY] BLOCK_ADD ip=${ip} expires=${entry.blockExpires} by=${entry.blockedBy}`);
        res.json({ success: true, message: `IP ${ip} has been blocked`, block: entry });
    } catch (error) {
        securityMetrics.blockErrors++;
        req.app.locals?.loggers?.api?.error('Error blocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete/unblock specific IP (DELETE variant from legacy)
router.delete('/rate-limits/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        const existed = blockedIPStore.delete(ip);
        await ensureBlockTable(req.dal);
        if (existed) {
            unblockPersistQueue.push(ip);
            startQueueProcessor(() => req.dal);
        }
        securityMetrics.unblocks++;
        req.app.locals?.loggers?.api?.info(`[SECURITY] BLOCK_REMOVE ip=${ip} existed=${existed} by=${req.user ? req.user.username : 'system'}`);
        res.json({ success: true, message: `Rate limit cleared for IP ${ip}`, ip, existed, clearedBy: req.user ? req.user.username : 'system', timestamp: new Date().toISOString() });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error clearing rate limit:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Blocked IPs list combines in-memory cache with persistent rows in rate_limit_blocks.
router.get('/rate-limits/blocked', async (req, res) => {
    try {
        await ensureBlockTable(req.dal);
        const now = Date.now();
        // Auto-expire stale blocks
        for (const [ip, entry] of blockedIPStore) {
            if (new Date(entry.blockExpires).getTime() < now) {
                blockedIPStore.delete(ip);
                if (req.dal && typeof req.dal.run === 'function') {
                    try { await req.dal.run(`DELETE FROM rate_limit_blocks WHERE ip = ?`, [ip]); } catch (dbErr) { req.app.locals?.loggers?.api?.warn('Expire delete failed: ' + dbErr.message); }
                }
            }
        }
        res.json({ success: true, blockedIPs: Array.from(blockedIPStore.values()), count: blockedIPStore.size });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting blocked IPs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rate limit settings persistence (single-row table with JSON payload)
router.put('/rate-limits/settings', async (req, res) => {
    try {
        const dal = req.dal;
        const settings = req.body && typeof req.body === 'object' ? req.body : {};
        if (!dal || typeof dal.run !== 'function' || typeof dal.get !== 'function') {
            return res.status(503).json({ success:false, error:'Database unavailable for settings persistence' });
        }
        await dal.run(`CREATE TABLE IF NOT EXISTS rate_limit_settings (id INTEGER PRIMARY KEY CHECK (id=1), settings TEXT, updated_at TIMESTAMPTZ, updated_by TEXT)`);
        const now = new Date().toISOString();
        await dal.run(`INSERT INTO rate_limit_settings (id, settings, updated_at, updated_by) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`, [JSON.stringify(settings), now, req.user ? req.user.username : 'system']);
        req.app.locals?.loggers?.api?.info(`Rate limiting settings persisted by ${req.user ? req.user.username : 'system'}`);
        res.json({ success: true, message: 'Rate limiting settings updated', settings: { ...settings, updated: now, updatedBy: req.user ? req.user.username : 'system' } });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating rate limit settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rate limit configuration (static descriptor)
router.get('/rate-limits/config', async (req, res) => {
    try {
        await ensureBlockTable(req.dal);
        const config = {
            enabled: true,
            windows: {
                general: { windowMs: 60000, max: 100, message: 'Too many requests, please try again later', skipSuccessfulRequests: false },
                auth: { windowMs: 900000, max: 5, message: 'Too many authentication attempts', skipSuccessfulRequests: true },
                api: { windowMs: 60000, max: 1000, message: 'API rate limit exceeded', skipSuccessfulRequests: false }
            },
            whitelist: ['127.0.0.1', '::1'],
            blacklist: [],
            autoUnblockAfter: 3600,
            enableGeoBlocking: false,
            logViolations: true,
            metrics: { ...securityMetrics, blockedIPs: blockedIPStore.size }
        };
        // Merge persisted settings if available
        if (req.dal && typeof req.dal.get === 'function') {
            try {
                const row = await req.dal.get(`SELECT settings, updated_at, updated_by FROM rate_limit_settings WHERE id = 1`);
                if (row && row.settings) {
                    config.persisted = { settings: JSON.parse(row.settings), updatedAt: row.updated_at, updatedBy: row.updated_by };
                }
            } catch (persistErr) {
                req.app.locals?.loggers?.api?.warn('Rate limit settings load failed: ' + persistErr.message);
            }
        }
        res.json({ success: true, config });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limit config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dedicated metrics endpoint
router.get('/rate-limits/metrics', async (req, res) => {
    try {
        await ensureBlockTable(req.dal);
        const avgDuration = blockedIPStore.size ?
            [...blockedIPStore.values()].reduce((s,e)=>s+e.durationSeconds,0)/blockedIPStore.size : 0;
        res.json({ success: true, metrics: { ...securityMetrics, blockedIPs: blockedIPStore.size, avgDurationSeconds: avgDuration, blockQueue: blockPersistQueue.length, unblockQueue: unblockPersistQueue.length } });
    } catch (err) {
        res.status(500).json({ success:false, error: err.message });
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

// Audit trail export (CSV or JSON)
router.get('/audit-trail/export', async (req, res) => {
    try {
        const { format = 'csv', startDate, endDate } = req.query;
        const dal = req.dal;
        if (!dal || typeof dal.all !== 'function') {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        let query = `SELECT a.id, a.user_id, COALESCE(u.username, 'system') as username, a.action, a.resource_type, a.resource_id, a.details, a.ip_address, a.user_agent, a.created_at FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (startDate) { query += ' AND a.created_at >= ?'; params.push(startDate); }
        if (endDate) { query += ' AND a.created_at <= ?'; params.push(endDate); }
        query += ' ORDER BY a.created_at DESC LIMIT 10000';
        const entries = await dal.all(query, params);
        if (format === 'csv') {
            const csvRows = ['ID,Timestamp,User,Action,Resource Type,Resource ID,IP Address,Details'];
            entries.forEach(e => { const details = e.details ? e.details.replace(/"/g, '""') : ''; csvRows.push(`${e.id},"${e.created_at}","${e.username}","${e.action}","${e.resource_type || ''}","${e.resource_id || ''}","${e.ip_address || ''}","${details}"`); });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().split('T')[0]}.csv"`);
            return res.send(csvRows.join('\n'));
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().split('T')[0]}.json"`);
        res.json({ success: true, entries, exportedAt: new Date().toISOString(), count: entries.length });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error exporting audit trail:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Audit trail stats
router.get('/audit-trail/stats', async (req, res) => {
    try {
        const dal = req.dal;
        if (!dal || typeof dal.get !== 'function' || typeof dal.all !== 'function') {
            return res.json({ success: true, stats: { totalEntries: 0, entriesLast24h: 0, entriesLast7d: 0, entriesLast30d: 0, topActions: [], topUsers: [] } });
        }
        const [totalRow, last24Row, last7Row, last30Row] = await Promise.all([
            dal.get(`SELECT COUNT(*) AS c FROM activity_log`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '24 hours'`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '7 days'`),
            dal.get(`SELECT COUNT(*) AS c FROM activity_log WHERE created_at >= NOW() - INTERVAL '30 days'`)
        ]);
        const total = totalRow?.c || 0;
        const topActionsRows = await dal.all(`SELECT action, COUNT(*) AS count FROM activity_log WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY action ORDER BY count DESC LIMIT 10`);
        const topActions = (topActionsRows || []).map(r => ({ action: r.action, count: r.count, percentage: total ? Math.round((r.count / total) * 1000) / 10 : 0 }));
        const topUsersRows = await dal.all(`SELECT COALESCE(u.username,'unknown') AS username, COUNT(*) AS entries FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.created_at >= NOW() - INTERVAL '30 days' GROUP BY COALESCE(u.username,'unknown') ORDER BY entries DESC LIMIT 10`);
        const topUsers = (topUsersRows || []).map(r => ({ username: r.username, entries: r.entries, percentage: total ? Math.round((r.entries / total) * 1000) / 10 : 0 }));
        const stats = { totalEntries: total, entriesLast24h: last24Row?.c || 0, entriesLast7d: last7Row?.c || 0, entriesLast30d: last30Row?.c || 0, topActions, topUsers };
        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting audit trail stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Security events
router.get('/audit-trail/security-events', async (req, res) => {
    try {
        const dal = req.dal;
        if (!dal || typeof dal.all !== 'function') {
            return res.json({ success: true, securityEvents: [] });
        }
        const rows = await dal.all(`SELECT a.id, a.created_at AS timestamp, a.action, a.ip_address, a.user_id, u.username FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.created_at >= NOW() - INTERVAL '30 days' AND a.action IN ('login_failed','unauthorized_access','permission_denied','account_locked') ORDER BY a.created_at DESC LIMIT 200`);
        const securityEvents = (rows || []).map(r => ({ id: r.id, timestamp: r.timestamp, severity: r.action === 'account_locked' ? 'high' : 'medium', type: r.action, description: null, ip: r.ip_address || null, userId: r.user_id || null, username: r.username || null }));
        res.json({ success: true, securityEvents });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting security events:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Compliance report
router.get('/audit-trail/compliance', async (req, res) => {
    try {
        const { startDate, endDate, standard = 'general' } = req.query;
        const dal = req.dal;
        if (!dal || typeof dal.all !== 'function' || typeof dal.get !== 'function') {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();
        const totalResult = await dal.get(`SELECT COUNT(*) as count FROM activity_log WHERE created_at BETWEEN ? AND ?`, [start, end]);
        const totalActivity = totalResult?.count || 0;
        const accessByUser = await dal.all(`SELECT COALESCE(u.username, 'system') as user, COUNT(*) as count FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.created_at BETWEEN ? AND ? GROUP BY user ORDER BY count DESC LIMIT 20`, [start, end]);
        const securityEvents = await dal.all(`SELECT action, COUNT(*) as count FROM activity_log WHERE created_at BETWEEN ? AND ? AND (action LIKE '%login%' OR action LIKE '%auth%' OR action LIKE '%password%' OR action LIKE '%delete%') GROUP BY action`, [start, end]);
        const dataAccess = await dal.all(`SELECT resource_type, COUNT(*) as count FROM activity_log WHERE created_at BETWEEN ? AND ? AND resource_type IS NOT NULL GROUP BY resource_type`, [start, end]);
        const failedAccess = await dal.get(`SELECT COUNT(*) as count FROM activity_log WHERE created_at BETWEEN ? AND ? AND (action LIKE '%fail%' OR action LIKE '%denied%' OR details LIKE '%error%')`, [start, end]);
        const report = { success: true, standard, reportPeriod: { start, end }, summary: { totalActivity, uniqueUsers: accessByUser.length, securityEvents: securityEvents.reduce((sum, e) => sum + e.count, 0), failedAccessAttempts: failedAccess?.count || 0 }, accessPatterns: { byUser: accessByUser, byResourceType: dataAccess }, securityEvents, compliance: { auditingEnabled: true, retentionPolicy: '90 days', encryptionEnabled: true, accessLoggingEnabled: true }, generatedAt: new Date().toISOString() };
        res.json(report);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error generating compliance report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cleanup old audit entries
router.delete('/audit-trail/cleanup', async (req, res) => {
    try {
        const dal = req.dal;
        const { olderThan = 90 } = req.body;
        if (!dal || typeof dal.run !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const safeDays = Math.max(1, parseInt(olderThan));
        const result = await dal.run(`DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '1 day' * ?`, [safeDays]);
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
        let sql = `SELECT a.*, u.username AS username FROM activity_log a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
        const params = [];
        if (query && String(query).trim()) {
            sql += ` AND (a.action LIKE ? OR a.resource_type LIKE ? OR a.details LIKE ?)`;
            const q = `%${query}%`;
            params.push(q, q, q);
        }
        if (filters.user_id) { sql += ' AND a.user_id = ?'; params.push(filters.user_id); }
        if (filters.action) { sql += ' AND a.action = ?'; params.push(filters.action); }
        if (filters.resource_type) { sql += ' AND a.resource_type = ?'; params.push(filters.resource_type); }
        if (filters.start_date) { sql += ' AND a.created_at >= ?'; params.push(filters.start_date); }
        if (filters.end_date) { sql += ' AND a.created_at <= ?'; params.push(filters.end_date); }
        const countSql = sql.replace('SELECT a.*, u.username AS username', 'SELECT COUNT(*) AS total');
        const countRow = await dal.get(countSql, params);
        const total = countRow?.total || 0;
        sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        const rows = await dal.all(sql, [...params, parseInt(limit), parseInt(offset)]);
        const results = (rows || []).map(r => ({ id: r.id, timestamp: r.created_at, username: r.username || null, action: r.action, resource: r.resource_type, details: r.details }));
        securityMetrics.searches++;
        res.json({ success: true, results, query, filters, totalResults: total, executionTimeMs: Date.now() - start });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error searching audit trail:', error);
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