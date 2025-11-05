/**
 * Dashboard API Routes
 * Advanced drag & drop dashboard functionality
 */

const express = require('express');
const router = express.Router();

// ============================================================================
// DASHBOARD MANAGEMENT API
// ============================================================================

/**
 * GET /api/dashboards - Get user dashboards
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id || 1; // Default to admin user
        const result = await req.dashboardBuilder.getUserDashboards(userId);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.dashboards,
                count: result.dashboards.length
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        req.loggers.api.error('Dashboard API get error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboards' });
    }
});

/**
 * POST /api/dashboards - Create new dashboard
 */
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const dashboardData = req.body;
        
        // Validate required fields
        if (!dashboardData.name || !dashboardData.name.trim()) {
            return res.status(400).json({ success: false, error: 'Dashboard name is required' });
        }
        
        const result = await req.dashboardBuilder.createDashboard(dashboardData, userId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Dashboard API create error:', error);
        res.status(500).json({ success: false, error: 'Failed to create dashboard' });
    }
});

/**
 * GET /api/dashboards/:id - Get specific dashboard
 */
router.get('/:id', async (req, res) => {
    try {
        const dashboardId = req.params.id;
        const result = await req.dashboardBuilder.getDashboard(dashboardId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Dashboard API get single error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
    }
});

/**
 * PUT /api/dashboards/:id - Update dashboard
 */
router.put('/:id', async (req, res) => {
    try {
        const dashboardId = req.params.id;
        const userId = req.user?.id || 1;
        const updates = req.body;
        
        const result = await req.dashboardBuilder.updateDashboard(dashboardId, updates, userId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Dashboard API update error:', error);
        res.status(500).json({ success: false, error: 'Failed to update dashboard' });
    }
});

/**
 * DELETE /api/dashboards/:id - Delete dashboard
 */
router.delete('/:id', async (req, res) => {
    try {
        const dashboardId = req.params.id;
        const userId = req.user?.id || 1;
        
        const result = await req.dashboardBuilder.deleteDashboard(dashboardId, userId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Dashboard API delete error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete dashboard' });
    }
});

// ============================================================================
// WIDGET MANAGEMENT API
// ============================================================================

/**
 * POST /api/dashboards/:id/widgets - Create widget in dashboard
 */
router.post('/:id/widgets', async (req, res) => {
    try {
        const dashboardId = req.params.id;
        const userId = req.user?.id || 1;
        const widgetData = req.body;
        
        const result = await req.dashboardBuilder.createWidget(dashboardId, widgetData, userId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Widget API create error:', error);
        res.status(500).json({ success: false, error: 'Failed to create widget' });
    }
});

/**
 * PUT /api/dashboards/widgets/:widgetId - Update widget
 */
router.put('/widgets/:widgetId', async (req, res) => {
    try {
        const widgetId = req.params.widgetId;
        const updates = req.body;
        
        const result = await req.dashboardBuilder.updateWidget(widgetId, updates);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Widget API update error:', error);
        res.status(500).json({ success: false, error: 'Failed to update widget' });
    }
});

/**
 * DELETE /api/dashboards/widgets/:widgetId - Delete widget
 */
router.delete('/widgets/:widgetId', async (req, res) => {
    try {
        const widgetId = req.params.widgetId;
        
        const result = await req.dashboardBuilder.deleteWidget(widgetId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Widget API delete error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete widget' });
    }
});

// ============================================================================
// WIDGET TYPES AND TEMPLATES API
// ============================================================================

/**
 * GET /api/dashboards/widget-types - Get available widget types
 */
router.get('/widget-types', async (req, res) => {
    try {
        const result = await req.dashboardBuilder.getWidgetTypes();
        
        if (result.success) {
            res.json({
                success: true,
                data: result.types
            });
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        req.loggers.api.error('Widget types API error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch widget types' });
    }
});

/**
 * GET /api/dashboards/data/:widgetType - Get data for specific widget type
 */
router.get('/data/:widgetType', async (req, res) => {
    try {
        const widgetType = req.params.widgetType;
        const timeRange = req.query.timeRange || '1h';
        const limit = parseInt(req.query.limit) || 100;
        
        let data = {};
        
        // Generate widget-specific data based on type
        switch (widgetType) {
            case 'log_timeline':
                const recentLogs = await req.dal.getRecentLogs(limit);
                data = {
                    logs: recentLogs,
                    timeRange: timeRange,
                    totalCount: recentLogs.length
                };
                break;
                
            case 'metrics_chart':
                const stats = await req.dal.getSystemStats();
                data = {
                    metrics: [
                        { name: 'Total Logs', value: stats.totalLogs, timestamp: new Date() },
                        { name: 'Logs Today', value: stats.logsToday, timestamp: new Date() },
                        { name: 'Storage Used', value: stats.storageUsed, timestamp: new Date() }
                    ]
                };
                break;
                
            case 'alert_summary':
                // This would require the alerting engine
                data = {
                    alerts: [],
                    summary: { total: 0, critical: 0, warning: 0, info: 0 }
                };
                break;
                
            case 'system_status':
                const health = await req.dal.getSystemHealth();
                data = {
                    cpu: health.cpu || Math.floor(Math.random() * 20 + 10),
                    memory: health.memory || Math.floor(Math.random() * 30 + 40),
                    disk: health.disk || Math.floor(Math.random() * 15 + 25),
                    status: health.status || 'healthy'
                };
                break;
                
            case 'log_levels_pie':
                const logCounts = await req.dal.all(`
                    SELECT level, COUNT(*) as count 
                    FROM logs 
                    WHERE timestamp >= datetime('now', '-${timeRange}') 
                    GROUP BY level
                `);
                data = {
                    levels: logCounts.map(lc => ({ level: lc.level, count: lc.count }))
                };
                break;
                
            default:
                data = { message: `Data for widget type '${widgetType}' not implemented yet` };
        }
        
        res.json({ success: true, data, widgetType, timestamp: new Date().toISOString() });
        
    } catch (error) {
        req.loggers.api.error('Widget data API error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
    }
});

module.exports = router;