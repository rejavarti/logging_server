const express = require('express');
const router = express.Router();

// GET /api/logs - Get logs with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const {
            limit = 100,
            offset = 0,
            level,
            source,
            search,
            startDate,
            endDate,
            category
        } = req.query;

        const filters = {
            limit: parseInt(limit),
            offset: parseInt(offset)
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
            query += ' AND (message LIKE ? OR category LIKE ?)';
            countQuery += ' AND (message LIKE ? OR category LIKE ?)';
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
            query += ' AND category = ?';
            countQuery += ' AND category = ?';
            params.push(category);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const logs = await req.dal.all(query, params);
        const totalResult = await req.dal.get(countQuery, params.slice(0, -2)); // Remove limit and offset for count
        const total = totalResult ? totalResult.count : 0;

        res.json({
            logs,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('API logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
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
        res.json({ logs });
    } catch (error) {
        console.error('API logs latest error:', error);
        res.status(500).json({ error: 'Failed to fetch latest logs' });
    }
});

// GET /api/logs/analytics - Get analytics data for charts
router.get('/analytics', async (req, res) => {
    try {
        const { period = '24h' } = req.query;

        // Get hourly log statistics
        const hourlyStats = await req.dal.all(`
            SELECT 
                strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                COUNT(*) as count,
                level
            FROM logs 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY hour, level
            ORDER BY hour DESC
        `);

        // Get log level distribution  
        const levelStats = await req.dal.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY level
        `);

        // Get log sources
        const sourceStats = await req.dal.all(`
            SELECT source, COUNT(*) as count 
            FROM logs 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY source
            ORDER BY count DESC
            LIMIT 10
        `);

        res.json({
            hourlyStats,
            levelStats,
            sourceStats
        });
    } catch (error) {
        console.error('API logs analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
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
        console.error('API logs export error:', error);
        res.status(500).json({ error: 'Failed to export logs' });
    }
});

module.exports = router;