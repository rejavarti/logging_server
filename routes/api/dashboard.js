const express = require('express');
const router = express.Router();
const _defaultWidgetTypes = [
    {
        id: 'log_count',
        name: 'Log Count',
        description: 'Total number of logs',
        icon: 'fas fa-list-ol',
        category: 'metrics',
        defaultSize: { w: 3, h: 2 }
    },
    {
        id: 'error_rate',
        name: 'Error Rate',
        description: 'Percentage of error logs',
        icon: 'fas fa-exclamation-triangle',
        category: 'metrics',
        defaultSize: { w: 3, h: 2 }
    },
    {
        id: 'system_health',
        name: 'System Health',
        description: 'CPU, Memory, and Disk usage',
        icon: 'fas fa-heart',
        category: 'system',
        defaultSize: { w: 4, h: 3 }
    },
    {
        id: 'recent_logs',
        name: 'Recent Logs',
        description: 'Latest log entries',
        icon: 'fas fa-clock',
        category: 'logs',
        defaultSize: { w: 6, h: 4 }
    },
    {
        id: 'log_timeline',
        name: 'Log Timeline',
        description: 'Hourly log activity chart',
        icon: 'fas fa-chart-line',
        category: 'charts',
        defaultSize: { w: 6, h: 3 }
    },
    {
        id: 'log_levels_pie',
        name: 'Log Levels Distribution',
        description: 'Pie chart of log levels',
        icon: 'fas fa-chart-pie',
        category: 'charts',
        defaultSize: { w: 4, h: 3 }
    },
    {
        id: 'system-stats',
        name: 'System Statistics',
        description: 'Overall system performance metrics',
        icon: 'fas fa-tachometer-alt',
        category: 'system',
        defaultSize: { w: 4, h: 3 }
    },
    {
        id: 'log-levels',
        name: 'Log Levels',
        description: 'Distribution of log severity levels',
        icon: 'fas fa-layer-group',
        category: 'charts',
        defaultSize: { w: 4, h: 3 }
    },
    {
        id: 'timeline',
        name: 'Timeline',
        description: 'Chronological log activity',
        icon: 'fas fa-timeline',
        category: 'charts',
        defaultSize: { w: 6, h: 3 }
    },
    {
        id: 'integrations',
        name: 'Integrations',
        description: 'Active integrations and connections',
        icon: 'fas fa-plug',
        category: 'integrations',
        defaultSize: { w: 4, h: 3 }
    }
];

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.dal.getSystemStats() || {
            totalLogs: 0,
            errorLogs: 0,
            warningLogs: 0,
            infoLogs: 0,
            debugLogs: 0,
            avgLogsPerHour: 0,
            logsToday: 0,
            errorRate: 0
        };
        
        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics' });
    }
});

// GET /api/dashboard/refresh - Refresh dashboard data
router.get('/refresh', async (req, res) => {
    try {
        // Get system stats
        const stats = await req.dal.getSystemStats() || {
            totalLogs: 0,
            errorLogs: 0,
            warningLogs: 0,
            infoLogs: 0,
            debugLogs: 0,
            avgLogsPerHour: 0
        };

        // Get recent logs
        const recentLogs = await req.dal.getRecentLogs(20) || [];

        // Get system health
        const systemHealth = await req.dal.getSystemHealth() || {
            cpu: { usage: 0, status: 'unknown' },
            memory: { usage: 0, total: 0, status: 'unknown' },
            disk: { usage: 0, total: 0, status: 'unknown' },
            status: 'unknown'
        };

        // Get log sources
        const logSources = await req.dal.getLogSources() || [];

        // Add logsToday calculation with localtime
        const todayLogsResult = await req.dal.get(`
            SELECT COUNT(*) as count 
            FROM logs 
            WHERE DATE(timestamp AT TIME ZONE 'America/Denver') = CURRENT_DATE
        `);
        stats.logsToday = todayLogsResult ? todayLogsResult.count : 0;

        // Get log level statistics
        const logLevelStats = await req.dal.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY level
        `) || [];

        // Get hourly statistics
        const hourlyStats = await req.dal.all(`
            SELECT 
                EXTRACT(HOUR FROM timestamp) as hour,
                COUNT(*) as count
            FROM logs 
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY hour
            ORDER BY hour
        `) || [];

        res.json({
            stats,
            recentLogs,
            systemHealth,
            logSources,
            logLevelStats,
            hourlyStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh dashboard data' });
    }
});

// GET /api/dashboard/widgets - Get available widget types
router.get('/widgets', async (req, res) => {
    try {
        res.json({ widgets: _defaultWidgetTypes, widgetTypes: _defaultWidgetTypes });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard widgets error:', error);
        res.status(500).json({ error: 'Failed to get widget types' });
    }
});

// GET /api/dashboard/positions - Retrieve saved widget layout/positions
router.get('/positions', async (req, res) => {
    try {
        const layoutJson = await req.dal.getSetting('dashboard_positions', '[]');
        const layout = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
        res.json({ success: true, layout });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard positions get error:', error);
        res.status(500).json({ success: false, error: 'Failed to get dashboard positions' });
    }
});

// POST /api/dashboard/positions - Save widget layout/positions
router.post('/positions', async (req, res) => {
    try {
        console.log('[Dashboard] POST /positions called with body:', JSON.stringify(req.body).substring(0, 200));
        const layout = Array.isArray(req.body?.layout) ? req.body.layout : [];
        console.log('[Dashboard] Saving layout with', layout.length, 'widgets');
        const result = await req.dal.setSetting('dashboard_positions', JSON.stringify(layout), 'Dashboard widget positions');
        console.log('[Dashboard] setSetting result:', result);
        res.json({ success: true, saved: layout.length });
    } catch (error) {
        console.error('[Dashboard] Save error:', error);
        req.app.locals?.loggers?.api?.error('API dashboard positions save error:', error);
        res.status(500).json({ success: false, error: 'Failed to save dashboard positions' });
    }
});

// POST /api/dashboard/fix-titles - Normalize widget titles based on known types
router.post('/fix-titles', async (req, res) => {
    try {
        const layoutJson = await req.dal.getSetting('dashboard_positions', '[]');
        let layout = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
        const typeMap = new Map(_defaultWidgetTypes.map(w => [w.id, w.name]));

        layout = layout.map(w => ({
            ...w,
            title: w.title && typeof w.title === 'string' && w.title.trim().length > 0
                ? w.title
                : (typeMap.get(w.type) || w.type || 'Widget')
        }));

        await req.dal.setSetting('dashboard_positions', JSON.stringify(layout), 'Dashboard widget positions');
        res.json({ success: true, updated: layout.length, layout });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard fix-titles error:', error);
        res.status(500).json({ success: false, error: 'Failed to normalize widget titles' });
    }
});

// POST /api/dashboard/fix-sizes - Enforce sane default sizes
router.post('/fix-sizes', async (req, res) => {
    try {
        const layoutJson = await req.dal.getSetting('dashboard_positions', '[]');
        let layout = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
        const typeSize = new Map(_defaultWidgetTypes.map(w => [w.id, w.defaultSize]));

        layout = layout.map(w => {
            const defaults = typeSize.get(w.type) || { w: 3, h: 2 };
            const wNew = Math.min(Math.max(w.w || defaults.w, 2), 12);
            const hNew = Math.min(Math.max(w.h || defaults.h, 1), 8);
            return { ...w, w: wNew, h: hNew };
        });

        await req.dal.setSetting('dashboard_positions', JSON.stringify(layout), 'Dashboard widget positions');
        res.json({ success: true, updated: layout.length, layout });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard fix-sizes error:', error);
        res.status(500).json({ success: false, error: 'Failed to normalize widget sizes' });
    }
});

// POST /api/dashboard/reset-positions - Clear layout to defaults
router.post('/reset-positions', async (req, res) => {
    try {
        await req.dal.setSetting('dashboard_positions', JSON.stringify([]), 'Dashboard widget positions');
        res.json({ success: true, layout: [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard reset-positions error:', error);
        res.status(500).json({ success: false, error: 'Failed to reset dashboard positions' });
    }
});

// GET /api/dashboard/widget-data/:type - Data provider per widget
router.get('/widget-data/:type', async (req, res) => {
    try {
        const { type } = req.params;

        if (type === 'log_count') {
            const stats = await req.dal.getSystemStats();
            return res.json({ success: true, value: stats?.totalLogs || 0 });
        }

        if (type === 'error_rate') {
            const stats = await req.dal.getSystemStats();
            const total = stats?.totalLogs || 0;
            const errors = stats?.errorLogs || 0;
            const rate = total > 0 ? Math.round((errors / total) * 10000) / 100 : 0;
            return res.json({ success: true, value: rate });
        }

        if (type === 'system_health') {
            const health = await req.dal.getSystemHealth();
            return res.json({ success: true, health });
        }

        if (type === 'recent_logs') {
            const recentLogs = await req.dal.getRecentLogs(20);
            return res.json({ success: true, logs: recentLogs || [] });
        }

        if (type === 'log_timeline') {
            const hourlyStats = await req.dal.all(`
                SELECT 
                    TO_CHAR(timestamp, 'HH24') as hour,
                    COUNT(*) as count
                FROM logs 
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY hour
                ORDER BY hour
            `) || [];
            return res.json({ success: true, series: hourlyStats || [] });
        }

        if (type === 'log_levels_pie') {
            const logLevelStats = await req.dal.all(`
                SELECT level, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY level
            `) || [];
            return res.json({ success: true, distribution: logLevelStats || [] });
        }

        return res.status(404).json({ success: false, error: 'Unknown widget type' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API dashboard widget-data error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
    }
});

module.exports = router;