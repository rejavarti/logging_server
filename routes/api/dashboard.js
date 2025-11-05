const express = require('express');
const router = express.Router();

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

        // Get log level statistics
        const logLevelStats = await req.dal.all(`
            SELECT level, COUNT(*) as count 
            FROM log_events 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY level
        `);

        // Get hourly statistics
        const hourlyStats = await req.dal.all(`
            SELECT 
                strftime('%H', timestamp) as hour,
                COUNT(*) as count
            FROM log_events 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY hour
            ORDER BY hour
        `);

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
        console.error('API dashboard refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh dashboard data' });
    }
});

// GET /api/dashboard/widgets - Get available widget types
router.get('/widgets', async (req, res) => {
    try {
        const widgetTypes = [
            {
                id: 'log_count',
                name: 'Log Count',
                description: 'Total number of logs',
                icon: 'fas fa-list-ol',
                category: 'metrics'
            },
            {
                id: 'error_rate',
                name: 'Error Rate',
                description: 'Percentage of error logs',
                icon: 'fas fa-exclamation-triangle',
                category: 'metrics'
            },
            {
                id: 'system_health',
                name: 'System Health',
                description: 'CPU, Memory, and Disk usage',
                icon: 'fas fa-heart',
                category: 'system'
            },
            {
                id: 'recent_logs',
                name: 'Recent Logs',
                description: 'Latest log entries',
                icon: 'fas fa-clock',
                category: 'logs'
            },
            {
                id: 'log_timeline',
                name: 'Log Timeline',
                description: 'Hourly log activity chart',
                icon: 'fas fa-chart-line',
                category: 'charts'
            },
            {
                id: 'log_levels_pie',
                name: 'Log Levels Distribution',
                description: 'Pie chart of log levels',
                icon: 'fas fa-chart-pie',
                category: 'charts'
            }
        ];

        res.json({ widgetTypes });
    } catch (error) {
        console.error('API dashboard widgets error:', error);
        res.status(500).json({ error: 'Failed to get widget types' });
    }
});

module.exports = router;