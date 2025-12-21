const express = require('express');
const router = express.Router();
const queryParser = require('../../utils/query-parser');

// GET /api/logs - Get logs with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const {
            limit: limitRaw = 100,
            offset: offsetRaw = 0,
            level,
            source,
            search,
            q, // Structured query (e.g., "level:error AND source:api")
            startDate,
            endDate,
            category
        } = req.query;

        // Support page & pageSize aliases
        const page = req.query.page ? parseInt(req.query.page) : null;
        const pageSize = req.query.pageSize ? parseInt(req.query.pageSize) : null;

        const computedLimit = pageSize && pageSize > 0 ? pageSize : parseInt(limitRaw);
        const computedOffset = page && page > 0 && pageSize && pageSize > 0
            ? (page - 1) * pageSize
            : parseInt(offsetRaw);

        const filters = {
            limit: computedLimit,
            offset: computedOffset
        };

        if (level) filters.level = level;
        if (source) filters.source = source;
        if (search) filters.message = search;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
        if (category) filters.category = category;

        let query = 'SELECT * FROM logs WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
        let params = [];

        // Check if structured query is provided
        if (q && queryParser.isValid(q)) {
            const parsed = queryParser.parse(q);
            query += ' AND (' + parsed.where + ')';
            countQuery += ' AND (' + parsed.where + ')';
            // Convert named params to positional for SQLite
            Object.values(parsed.params).forEach(v => params.push(v));
        } else {
            // Fall back to legacy filters
            if (level) {
                query += ' AND level = ?';
                countQuery += ' AND level = ?';
                params.push(level);
            }
            if (source) {
                query += ' AND source = ?';
                countQuery += ' AND source = ?';
                params.push(source);
            }
            if (search) {
                query += ' AND (message LIKE ? OR source LIKE ?)';
                countQuery += ' AND (message LIKE ? OR source LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }
            if (startDate) {
                query += ' AND timestamp >= ?';
                countQuery += ' AND timestamp >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND timestamp <= ?';
                countQuery += ' AND timestamp <= ?';
                params.push(endDate);
            }
            if (category) {
                // Map legacy 'category' filter to 'source'
                query += ' AND source = ?';
                countQuery += ' AND source = ?';
                params.push(category);
            }
        }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(filters.limit, filters.offset);

        const logs = await req.dal.all(query, params);
        const totalResult = await req.dal.get(countQuery, params.slice(0, -2)); // Remove limit and offset for count
        const total = totalResult ? totalResult.count : 0;

        res.json({
            success: true,
            logs,
            total,
            limit: filters.limit,
            offset: filters.offset,
            page: page || Math.floor(filters.offset / filters.limit) + 1,
            pageSize: filters.limit,
            query: q || null
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch logs' });
    }
});

// GET /api/logs/latest - Get latest logs for real-time updates  
router.get('/latest', async (req, res) => {
    try {
        const { since } = req.query;
        
        if (!since) {
            return res.status(400).json({ error: 'since parameter required' });
        }

        const logs = await req.dal.all(`
            SELECT * FROM logs 
            WHERE timestamp > ? 
            ORDER BY timestamp DESC 
            LIMIT 100
        `, [since]);
        res.json({ success: true, logs });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs latest error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch latest logs' });
    }
});

// GET /api/logs/analytics - Get analytics data for charts
router.get('/analytics', async (req, res) => {
    try {
        const { period = '24h' } = req.query;

        // Get all logs for analysis
        const logs = await req.dal.all(`
            SELECT * FROM logs 
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY timestamp DESC
        `) || [];

        // Calculate basic stats
        const totalLogs = logs.length;
        const errorLogs = logs.filter(log => ['error', 'warning', 'critical'].includes(log.level)).length;
        const avgPerHour = totalLogs / 24;
        const activeSources = [...new Set(logs.map(log => log.source).filter(s => s))].length;

        // Transform hourly data for chart
        const hourlyMap = {};
        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0') + ':00';
            hourlyMap[hour] = 0;
        }
        
        logs.forEach(log => {
            if (log.timestamp) {
                const hour = new Date(log.timestamp).getHours().toString().padStart(2, '0') + ':00';
                hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
            }
        });
        
        const hourlyData = {
            labels: Object.keys(hourlyMap),
            values: Object.values(hourlyMap)
        };

        // Transform level data for chart
        const levelMap = {
            error: 0,
            warning: 0,
            info: 0,
            debug: 0
        };
        
        logs.forEach(log => {
            if (log.level && levelMap.hasOwnProperty(log.level)) {
                levelMap[log.level]++;
            }
        });
        
        const severityData = {
            labels: Object.keys(levelMap),
            values: Object.values(levelMap)
        };

        // Transform category data for chart
        const categoryMap = {};
        logs.forEach(log => {
            const category = log.category || log.source || 'System';
            categoryMap[category] = (categoryMap[category] || 0) + 1;
        });
        
        const sortedCategories = Object.entries(categoryMap)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
            
        const categoryData = {
            labels: sortedCategories.map(([label]) => label),
            values: sortedCategories.map(([,value]) => value)
        };

        res.json({
            success: true,
            analytics: {
                totalLogs,
                errorLogs,
                avgPerHour: Math.round(avgPerHour),
                activeSources,
                hourlyData,
                severityData,
                categoryData
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
});

// GET /api/logs/export - Export logs
router.get('/export', async (req, res) => {
    try {
        // Params
        const { format = 'json' } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10000, 1), 100000);

        // Fetch data using existing columns only
        const logs = await req.dal.all(
            `SELECT id, timestamp, level, source, ip, message, metadata
             FROM logs
             ORDER BY timestamp DESC
             LIMIT ?`,
            [limit]
        );

        if (format === 'csv') {
            const header = 'Timestamp,Level,Source,Message';
            const csv = logs.map(log => {
                return '"' + (log.timestamp || '') + '",' +
                       '"' + (log.level || '') + '",' +
                       '"' + (log.source || '') + '",' +
                       '"' + ((log.message || '').replace(/"/g, '""')) + '"';
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
            return res.send(header + '\n' + csv);
        }

        if (format === 'ndjson') {
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('Content-Disposition', 'attachment; filename=logs.ndjson');

            // Stream NDJSON lines to the response to avoid building a huge string in memory
            for (const log of logs) {
                // Ensure metadata is object when possible
                const out = { ...log };
                if (typeof out.metadata === 'string') {
                    try { out.metadata = JSON.parse(out.metadata); } catch (_) { /* Metadata parse non-critical, keep as string */ }
                }
                res.write(JSON.stringify(out) + '\n');
            }
            return res.end();
        }

        // Default JSON
        return res.json({ logs });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs export error:', error);
        return res.status(500).json({ error: 'Failed to export logs' });
    }
});

// GET /api/logs/parse - Preview parse of raw log text into fields
router.get('/parse', async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: 'text is required' });
        // naive parser: timestamp [level] source - message
        const m = text.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\s*\[?(\w+)\]?\s*(\w+)?\s*-?\s*(.*)$/i);
        const parsed = {
            timestamp: m && m[1] || new Date().toISOString(),
            level: m && m[2] ? m[2].toLowerCase() : 'info',
            source: m && m[3] || 'unknown',
            message: m && m[4] || text
        };
        res.json({ parsed });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs parse error:', error);
        res.status(500).json({ error: 'Failed to parse log' });
    }
});

// GET /api/logs/formats - Known log formats
router.get('/formats', async (req, res) => {
    try {
        res.json({ formats: [
            { id:'default', pattern:'YYYY-MM-DD HH:mm:ss [LEVEL] source - message' },
            { id:'syslog', pattern:'<pri>timestamp host app[pid]: message' },
            { id:'json', pattern:'{"timestamp":"...","level":"...","message":"..."}'}
        ]});
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs formats error:', error);
        res.status(500).json({ error: 'Failed to get formats' });
    }
});

// GET /api/logs/count - total logs count (with optional filters)
router.get('/count', async (req, res) => {
    try {
        const { level, source } = req.query;
        let sql = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
        const params = [];
        if (level) { sql += ' AND level = ?'; params.push(level); }
        if (source) { sql += ' AND source = ?'; params.push(source); }
        const row = await req.dal.get(sql, params);
        res.json({ success: true, count: row ? row.count : 0 });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs count error:', error);
        res.status(500).json({ success: false, error: 'Failed to get log count' });
    }
});

// GET /api/logs/count/today - today logs count
router.get('/count/today', async (req, res) => {
    try {
        const row = await req.dal.get("SELECT COUNT(*) as count FROM logs WHERE date(timestamp) = date('now')");
        res.json({ count: row ? row.count : 0 });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs today count error:', error);
        res.status(500).json({ error: 'Failed to get today log count' });
    }
});

// GET /api/logs/stats - Get log statistics and aggregations
// NOTE: This MUST come BEFORE /:id route to avoid matching "stats" as an ID
router.get('/stats', async (req, res) => {
    try {
        const { period = '24h', groupBy = 'hour', level } = req.query;
        
        if (!req.dal) {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }
        
        // Calculate time range based on period
        const periodMap = {
            '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30
        };
        const hours = periodMap[period] || 24;
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        // Base query with time filter
        let whereClause = 'WHERE timestamp >= ?';
        let params = [startTime];
        
        if (level) {
            whereClause += ' AND level = ?';
            params.push(level);
        }
        
        // Group by time periods
        if (groupBy === 'hour') {
            const query = `
                SELECT TO_CHAR(DATE_TRUNC('hour', timestamp), 'YYYY-MM-DD HH24:00') as period, COUNT(*) as count
                FROM logs
                ${whereClause}
                GROUP BY period
                ORDER BY period ASC
            `;
            const rows = await req.dal.all(query, params);
            
            const labels = rows.map(r => r.period.split(' ')[1] || r.period);
            const values = rows.map(r => r.count);
            
            return res.json({ success: true, labels, values, total: values.reduce((a, b) => a + b, 0) });
        } else if (groupBy === 'day') {
            const query = `
                SELECT DATE(timestamp) as period, COUNT(*) as count
                FROM logs
                ${whereClause}
                GROUP BY period
                ORDER BY period ASC
            `;
            const rows = await req.dal.all(query, params);
            
            const labels = rows.map(r => r.period);
            const values = rows.map(r => r.count);
            
            return res.json({ success: true, labels, values, total: values.reduce((a, b) => a + b, 0) });
        } else if (groupBy === 'level') {
            const query = `
                SELECT level, COUNT(*) as count
                FROM logs
                ${whereClause}
                GROUP BY level
                ORDER BY count DESC
            `;
            const rows = await req.dal.all(query, params);
            
            const byLevel = {};
            rows.forEach(r => {
                byLevel[r.level || 'unknown'] = r.count;
            });
            
            return res.json({ success: true, byLevel, total: rows.reduce((sum, r) => sum + r.count, 0) });
        } else if (groupBy === 'source') {
            const query = `
                SELECT source, COUNT(*) as count
                FROM logs
                ${whereClause}
                GROUP BY source
                ORDER BY count DESC
                LIMIT 10
            `;
            const rows = await req.dal.all(query, params);
            
            const bySource = {};
            rows.forEach(r => {
                bySource[r.source || 'unknown'] = r.count;
            });
            
            return res.json({ success: true, bySource, total: rows.reduce((sum, r) => sum + r.count, 0) });
        }
        
        // Default: return basic stats
        const totalQuery = `SELECT COUNT(*) as total FROM logs ${whereClause}`;
        const totalResult = await req.dal.get(totalQuery, params);
        
        return res.json({ success: true, total: totalResult.total || 0 });
        
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Log stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

// GET /api/logs/:id - Get single log entry details
// NOTE: This MUST come AFTER specific routes like /stats to avoid matching them as IDs
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.dal || !req.dal.get) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not available' 
            });
        }
        
        const log = await req.dal.get('SELECT * FROM logs WHERE id = ?', [id]);
        
        if (!log) {
            return res.status(404).json({ 
                success: false, 
                error: 'Log entry not found' 
            });
        }
        
        // Parse JSON fields if they're strings
        if (typeof log.details === 'string') {
            try { log.details = JSON.parse(log.details); } catch (e) { log.details = {}; }
        }
        if (typeof log.metadata === 'string') {
            try { log.metadata = JSON.parse(log.metadata); } catch (e) { log.metadata = {}; }
        }
        
        res.json({ success: true, log });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting log details:', error);
        res.status(500).json({ success: false, error: 'Failed to get log details: ' + error.message });
    }
});

// POST /api/logs - Create a new log entry
router.post('/', async (req, res) => {
    try {
        const { level = 'info', message, source = 'api', timestamp } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ success: false, error: 'message is required' });
        }
        if (message.includes('\x00')) {
            return res.status(400).json({ success: false, error: 'message contains invalid null byte' });
        }
        const allowedLevels = ['debug', 'info', 'warning', 'error', 'critical'];
        if (level && !allowedLevels.includes(level)) {
            return res.status(400).json({ success: false, error: 'invalid level' });
        }
        if (!req.dal || typeof req.dal.run !== 'function') {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }
        const ts = timestamp || new Date().toISOString();
        let insertedId = null;
        let usedBatching = false;
        // Prefer batched ingestion when available for reliability under load
        if (req.dal && typeof req.dal.enqueueLogEntry === 'function') {
            req.dal.enqueueLogEntry({ level, message, source, ip: req.ip || 'unknown', timestamp: ts });
            // Batched ingestion: respond with accepted status and temporary ID = -1 (actual ID assigned asynchronously)
            insertedId = -1;
            usedBatching = true;
            req.app.locals?.loggers?.api?.debug(`Enqueued log entry (batch size now: ${req.dal.logBatch?.length || 0})`);
        } else {
            const result = await req.dal.run(
                `INSERT INTO logs (level, message, source, ip, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [level, message, source, req.ip || 'unknown', ts]
            );
            insertedId = result.lastID;
        }
        
        // Broadcast new log to WebSocket subscribers (only if we have real ID)
        if (!usedBatching && typeof global.broadcastToSubscribers === 'function') {
            global.broadcastToSubscribers('logs', 'log:created', {
                id: insertedId,
                level,
                message,
                source,
                timestamp: ts
            });
        }
        
        return res.status(201).json({ success: true, id: insertedId, batched: usedBatching });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API create log error:', error);
        res.status(500).json({ success: false, error: 'Failed to create log' });
    }
});

// DELETE /api/logs/:id - Delete a specific log entry
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.dal || !req.dal.run) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not available' 
            });
        }
        
        // Check if log exists first
        const log = await req.dal.get('SELECT id FROM logs WHERE id = ?', [id]);
        if (!log) {
            return res.status(404).json({ 
                success: false, 
                error: 'Log entry not found' 
            });
        }
        
        // Delete the log entry
        const result = await req.dal.run('DELETE FROM logs WHERE id = ?', [id]);
        
        // Broadcast deletion to WebSocket subscribers
        if (typeof global.broadcastToSubscribers === 'function') {
            global.broadcastToSubscribers('logs', 'log:deleted', { id: parseInt(id) });
        }
        
        res.json({ 
            success: true, 
            message: 'Log entry deleted',
            id: parseInt(id),
            changes: result.changes 
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting log:', error);
        res.status(500).json({ success: false, error: 'Failed to delete log: ' + error.message });
    }
});

/**
 * GET /api/logs/geolocation - Get geolocation data from logs
 * Used by geolocation map widget
 */
router.get('/geolocation', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 500;
        
        // Get logs with geolocation data in metadata
        const geoLogs = await req.dal.all(`
            SELECT 
                source,
                metadata,
                ip,
                COUNT(*) as count
            FROM logs 
            WHERE (metadata::text LIKE '%latitude%' OR metadata::text LIKE '%longitude%')
              AND timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY source, metadata, ip
            LIMIT $1
        `, [limit]) || [];
        
        // Parse geolocation data
        const locations = [];
        for (const log of geoLogs) {
            try {
                const meta = typeof log.metadata === 'string' 
                    ? JSON.parse(log.metadata) 
                    : log.metadata;
                
                if (meta && (meta.latitude || meta.lat) && (meta.longitude || meta.lon || meta.lng)) {
                    locations.push({
                        source: log.source,
                        lat: meta.latitude || meta.lat,
                        lon: meta.longitude || meta.lon || meta.lng,
                        count: log.count,
                        ip: log.ip || meta.ip || 'Unknown'
                    });
                }
            } catch (e) {
                // Skip invalid metadata
            }
        }
        
        res.json({ 
            success: true, 
            locations,
            totalLogs: geoLogs.length,
            message: locations.length === 0 ? 'No geolocation data found in logs' : undefined
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting geolocation data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;