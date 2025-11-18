const express = require('express');
const router = express.Router();

// GET /api/logs - Get logs with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const {
            limit: limitRaw = 100,
            offset: offsetRaw = 0,
            level,
            source,
            search,
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
            pageSize: filters.limit
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
            WHERE timestamp >= datetime('now', '-24 hours')
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
            totalLogs,
            errorLogs,
            avgPerHour: Math.round(avgPerHour),
            activeSources,
            hourlyData,
            severityData,
            categoryData
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
});

// GET /api/logs/export - Export logs
router.get('/export', async (req, res) => {
    try {
        const filters = { ...req.query };
        delete filters.format;

        const logs = await req.dal.all(`
            SELECT * FROM logs 
            ORDER BY timestamp DESC 
            LIMIT 10000
        `);
        const format = req.query.format || 'json';

        if (format === 'csv') {
            const csv = logs.map(log => {
                return `"${log.timestamp}","${log.level}","${log.source}","${log.message?.replace(/"/g, '""') || ''}"`;
            }).join('\n');
            
            const csvContent = 'Timestamp,Level,Source,Message\n' + csv;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
            res.send(csvContent);
        } else {
            res.json({ logs });
        }
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs export error:', error);
        res.status(500).json({ error: 'Failed to export logs' });
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
        res.json({ count: row ? row.count : 0 });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API logs count error:', error);
        res.status(500).json({ error: 'Failed to get log count' });
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

// GET /api/logs/:id - Get single log entry details
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
        const result = await req.dal.run(
            `INSERT INTO logs (level, message, source, ip, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [level, message, source, req.ip || 'unknown', ts]
        );
        return res.status(200).json({ success: true, id: result.lastID });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API create log error:', error);
        res.status(500).json({ success: false, error: 'Failed to create log' });
    }
});

module.exports = router;