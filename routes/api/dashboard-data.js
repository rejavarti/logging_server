/**
 * Dashboard Data API - Provides dashboard data via AJAX for faster initial page load
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/dashboard-data/stats
 * Get system statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.dal.getSystemStats() || {};
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error getting system stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/recent-logs
 * Get recent log entries
 */
router.get('/recent-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const recentLogs = await req.dal.getRecentLogs(limit) || [];
        res.json({ success: true, data: recentLogs });
    } catch (error) {
        console.error('Error getting recent logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/log-levels
 * Get log level distribution for the past 24 hours
 */
router.get('/log-levels', async (req, res) => {
    try {
        const logLevelStats = await req.dal.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY level 
            ORDER BY count DESC
        `) || [];
        res.json({ success: true, data: logLevelStats });
    } catch (error) {
        console.error('Error getting log level stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/hourly-stats
 * Get hourly log distribution for timeline chart
 */
router.get('/hourly-stats', async (req, res) => {
    try {
        const hourlyStats = await req.dal.all(`
            SELECT 
                TO_CHAR(DATE_TRUNC('hour', timestamp), 'HH24:00') as hour,
                COUNT(*) as count,
                level
            FROM logs 
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY DATE_TRUNC('hour', timestamp), level
            ORDER BY DATE_TRUNC('hour', timestamp)
        `) || [];
        res.json({ success: true, data: hourlyStats });
    } catch (error) {
        console.error('Error getting hourly stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/integrations
 * Get integration health stats
 */
router.get('/integrations', async (req, res) => {
    try {
        const integrations = await req.dal.all(`
            SELECT name, type, enabled 
            FROM integrations 
            WHERE enabled = true
        `) || [];
        
        let integrationStats = [];
        if (integrations.length > 0) {
            integrationStats = integrations.map(i => ({
                type: i.name || i.type || 'Unknown',
                total: 1,
                healthy: 1
            }));
        } else {
            integrationStats = [{ type: 'No active integrations', total: 0, healthy: 0 }];
        }
        
        res.json({ success: true, data: integrationStats });
    } catch (error) {
        console.error('Error getting integration stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/all
 * Get all dashboard data in a single request (for initial load)
 */
router.get('/all', async (req, res) => {
    try {
        const [stats, health, recentLogs, logLevelStats, hourlyStats, integrations] = await Promise.all([
            req.dal.getSystemStats().catch(() => ({})),
            req.dal.getSystemHealth().catch(() => ({ cpu: 0, memory: 0, disk: 0 })),
            req.dal.getRecentLogs(20).catch(() => []),
            req.dal.all(`
                SELECT level, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= NOW() - INTERVAL '24 hours' 
                GROUP BY level 
                ORDER BY count DESC
            `).catch(() => []),
            req.dal.all(`
                SELECT 
                    TO_CHAR(DATE_TRUNC('hour', timestamp), 'HH24:00') as hour,
                    COUNT(*) as count,
                    level
                FROM logs 
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY hour, level
                ORDER BY hour
            `).catch(() => []),
            req.dal.all(`SELECT name, type, enabled FROM integrations WHERE enabled = true`).catch(() => [])
        ]);
        
        // Merge stats with health metrics
        const mergedStats = { 
            ...stats, 
            cpu: health.cpu || 0, 
            memory: health.memory || 0, 
            disk: health.disk || 0 
        };

        let integrationStats = [];
        if (integrations.length > 0) {
            integrationStats = integrations.map(i => ({
                type: i.name || i.type || 'Unknown',
                total: 1,
                healthy: 1
            }));
        } else {
            integrationStats = [{ type: 'No active integrations', total: 0, healthy: 0 }];
        }

        res.json({
            success: true,
            data: {
                stats: mergedStats,
                recentLogs,
                logLevelStats,
                hourlyStats,
                integrationStats
            }
        });
    } catch (error) {
        console.error('Error getting dashboard data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard-data/geolocation
 * Get geolocation data for the map widget
 * Alias for /api/logs/geolocation (backwards compatibility)
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
            LIMIT ?
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
        console.error('Error getting geolocation data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
