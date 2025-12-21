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
        
        // Check if dashboardBuilder is available
        if (!req.dashboardBuilder || !req.dashboardBuilder.createDashboard) {
            return res.status(503).json({
                success: false,
                error: 'Dashboard builder service not available'
            });
        }
        
        try {
            const result = await req.dashboardBuilder.createDashboard(dashboardData, userId);
            
            if (result.success) {
                // Log dashboard creation activity
                if (req.dal && req.dal.logActivity) {
                    try {
                        await req.dal.logActivity({
                            user_id: userId,
                            action: 'create_dashboard',
                            resource_type: 'dashboard',
                            resource_id: result.id,
                            details: JSON.stringify({ name: dashboardData.name }),
                            ip_address: req.ip || 'unknown',
                            user_agent: req.headers['user-agent'] || 'unknown'
                        });
                    } catch (logErr) {
                        req.app.locals?.loggers?.api?.warn('Failed to log dashboard creation:', logErr.message);
                    }
                }
                
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (createError) {
            req.app.locals?.loggers?.api?.error('Dashboard creation error:', createError);
            
            // Check for specific database errors
            if (createError.message && createError.message.includes('UNIQUE constraint')) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'Dashboard with this name already exists'
                });
            } else if (createError.message && createError.message.includes('no such table')) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Dashboard database table not initialized. Please contact administrator.'
                });
            }
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create dashboard: ' + createError.message 
            });
        }
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Dashboard API create error:', error);
        res.status(500).json({ success: false, error: 'Failed to create dashboard: ' + error.message });
    }
});

// ============================================================================
// WIDGET TYPES AND TEMPLATES API (Must come before /:id routes)
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
                    cpu: health?.cpu || 0,
                    memory: health?.memory || 0,
                    disk: health?.disk || 0,
                    status: health?.status || 'unknown'
                };
                break;
                
            case 'log_levels_pie':
                // SECURITY FIX: Sanitize timeRange parameter to prevent SQL injection
                const validTimeRanges = ['1 hour', '24 hours', '7 days', '30 days'];
                const safeTimeRange = validTimeRanges.includes(timeRange) ? timeRange : '24 hours';
                
                const logCounts = await dal.all(`
                    SELECT level, COUNT(*) as count 
                    FROM logs 
                    WHERE timestamp >= NOW() - CAST($1 AS INTERVAL) 
                    GROUP BY level
                `, [safeTimeRange]);
                data = {
                    levels: logCounts.map(lc => ({ level: lc.level, count: lc.count }))
                };
                break;
                
            case 'network_traffic':
                // Network traffic monitoring from logs
                const networkLogs = await req.dal.all(`
                    SELECT source, COUNT(*) as requests, 
                           AVG(CAST(SUBSTRING(message FROM POSITION('bytes:' IN message) + 6) AS INTEGER)) as avg_bytes
                    FROM logs 
                    WHERE timestamp >= NOW() - INTERVAL '1 hour'
                      AND message LIKE '%bytes:%'
                    GROUP BY source
                    ORDER BY requests DESC
                    LIMIT 10
                `);
                data = {
                    traffic: networkLogs.map(log => ({
                        source: log.source,
                        requests: log.requests,
                        avgBytes: log.avg_bytes || 0
                    })),
                    totalRequests: networkLogs.reduce((sum, log) => sum + log.requests, 0),
                    timestamp: new Date().toISOString()
                };
                break;
                
            case 'custom_metric':
                // Custom metric aggregation from logs
                const metricName = req.query.metric || 'response_time';
                const metricData = await req.dal.all(`
                    SELECT 
                        TO_CHAR(DATE_TRUNC('hour', timestamp), 'YYYY-MM-DD HH24:00') as hour,
                        COUNT(*) as count,
                        AVG(CAST(SUBSTRING(message FROM POSITION(':' IN message) + 1) AS REAL)) as avg_value
                    FROM logs 
                    WHERE timestamp >= NOW() - INTERVAL '24 hours'
                      AND message LIKE $1
                    GROUP BY hour
                    ORDER BY hour DESC
                    LIMIT 24
                `, [`%${metricName}:%`]);
                data = {
                    metric: metricName,
                    dataPoints: metricData.map(d => ({
                        time: d.hour,
                        value: d.avg_value || 0,
                        count: d.count
                    })),
                    timestamp: new Date().toISOString()
                };
                break;
                
            case 'alert_history':
                // Recent alert history from alerts table
                const recentAlerts = await req.dal.all(`
                    SELECT id, type, title, severity, status, created, resolved
                    FROM alerts
                    WHERE created >= NOW() - INTERVAL '7 days'
                    ORDER BY created DESC
                    LIMIT 50
                `);
                data = {
                    alerts: recentAlerts.map(alert => ({
                        id: alert.id,
                        type: alert.type,
                        title: alert.title,
                        severity: alert.severity,
                        status: alert.status,
                        created: alert.created,
                        resolved: alert.resolved,
                        duration: alert.resolved ? 
                            Math.floor((new Date(alert.resolved) - new Date(alert.created)) / 1000) : null
                    })),
                    summary: {
                        total: recentAlerts.length,
                        active: recentAlerts.filter(a => a.status === 'active').length,
                        resolved: recentAlerts.filter(a => a.status === 'resolved').length
                    },
                    timestamp: new Date().toISOString()
                };
                break;
                
            case 'user_activity':
                // User activity from activity_log table
                const userActivity = await req.dal.all(`
                    SELECT user_id, action, COUNT(*) as count,
                           MAX(created_at) as last_activity
                    FROM activity_log
                    WHERE created_at >= NOW() - INTERVAL '24 hours'
                    GROUP BY user_id, action
                    ORDER BY count DESC
                    LIMIT 20
                `);
                const uniqueUsers = await req.dal.get(`
                    SELECT COUNT(DISTINCT user_id) as count
                    FROM activity_log
                    WHERE created_at >= NOW() - INTERVAL '24 hours'
                `);
                data = {
                    activities: userActivity.map(activity => ({
                        userId: activity.user_id,
                        action: activity.action,
                        count: activity.count,
                        lastActivity: activity.last_activity
                    })),
                    summary: {
                        uniqueUsers: uniqueUsers?.count || 0,
                        totalActions: userActivity.reduce((sum, a) => sum + a.count, 0)
                    },
                    timestamp: new Date().toISOString()
                };
                break;
                
            default:
                // Return structured empty data for unknown widget types
                data = { 
                    error: 'Unknown widget type',
                    widgetType,
                    available: false,
                    values: [],
                    message: null
                };
        }
        
        res.json({ success: true, data, widgetType, timestamp: new Date().toISOString() });
        
    } catch (error) {
        req.loggers.api.error('Widget data API error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
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

/**
 * GET /api/dashboards/widget-types - Get available widget types (Duplicate moved above)
 */

module.exports = router;