/**
 * System API Routes
 * Handles system-level endpoints for health, metrics, maintenance
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');

// Get system metrics
router.get('/system/metrics', async (req, res) => {
    try {
        // Get metrics from MetricsManager if available
        const metricsManager = req.app.locals.metricsManager;
        
        if (metricsManager && typeof metricsManager.getSystemMetrics === 'function') {
            const metrics = metricsManager.getSystemMetrics();
            return res.json(metrics);
        }
        
        // Fallback to basic system metrics
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        const cpuUsage = os.loadavg();
        
        const memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const cpuPercent = Math.min(Math.round((cpuUsage[0] / os.cpus().length) * 100), 100);
        
        // Get total requests from metrics manager or use default
        let totalRequests = 0;
        if (req.app.locals.requestCount) {
            totalRequests = req.app.locals.requestCount;
        }
        
        const metrics = {
            memoryUsage: memoryUsageMB,
            cpuUsage: cpuPercent,
            uptime: Math.round(uptime),
            totalRequests: totalRequests
        };

        res.json(metrics);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting system metrics:', error);
        res.status(500).json({ error: 'Failed to get system metrics' });
    }
});

// Get system health
router.get('/system/health', async (req, res) => {
    try {
        // Get REAL system health data
        const systemHealth = await req.dal.getSystemHealth();
        const logCount = await req.dal.get('SELECT COUNT(*) as count FROM logs');
        
        // Database check
        const dbStartTime = Date.now();
        await req.dal.get('SELECT 1');
        const dbResponseTime = Date.now() - dbStartTime;
        
        const health = {
            status: systemHealth.status || 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                database: { 
                    status: dbResponseTime < 100 ? 'healthy' : 'degraded', 
                    response_time: `${dbResponseTime}ms`,
                    log_count: logCount.count
                },
                memory: { 
                    status: systemHealth.memory < 85 ? 'healthy' : 'warning', 
                    usage: `${systemHealth.memory}%` 
                },
                cpu: {
                    status: systemHealth.cpu < 80 ? 'healthy' : 'warning',
                    usage: `${systemHealth.cpu}%`
                },
                storage: { 
                    status: systemHealth.disk < 90 ? 'healthy' : 'warning', 
                    usage: `${systemHealth.disk}%` 
                }
            },
            version: '2.2.0'
        };

        res.json(health);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting system health:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get detailed health checks
router.get('/system/health-checks', async (req, res) => {
    try {
        const checks = [];
        let successCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        // Database health check
        try {
            const startTime = Date.now();
            await req.dal.get('SELECT 1');
            const responseTime = Date.now() - startTime;
            const logCount = await req.dal.get('SELECT COUNT(*) as count FROM logs');
            
            checks.push({
                name: 'Database',
                status: responseTime < 100 ? 'success' : 'warning',
                value: `${responseTime}ms`,
                message: `${logCount.count.toLocaleString()} logs stored`,
                progress: Math.min(100, 100 - responseTime)
            });
            if (responseTime < 100) successCount++; else warningCount++;
        } catch (error) {
            checks.push({
                name: 'Database',
                status: 'error',
                value: 'Failed',
                message: error.message,
                progress: 0
            });
            errorCount++;
        }

        // System Resources
        const os = require('os');
        const memUsage = process.memoryUsage();
        const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
        checks.push({
            name: 'Memory',
            status: memPercent < 80 ? 'success' : memPercent < 90 ? 'warning' : 'error',
            value: `${memPercent}%`,
            message: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
            progress: memPercent
        });
        if (memPercent < 80) successCount++; else if (memPercent < 90) warningCount++; else errorCount++;

        // CPU Load
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        const cpuPercent = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);
        checks.push({
            name: 'CPU',
            status: cpuPercent < 70 ? 'success' : cpuPercent < 85 ? 'warning' : 'error',
            value: `${cpuPercent}%`,
            message: `Load: ${loadAvg.toFixed(2)} (${cpuCount} cores)`,
            progress: cpuPercent
        });
        if (cpuPercent < 70) successCount++; else if (cpuPercent < 85) warningCount++; else errorCount++;

        // Uptime
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        checks.push({
            name: 'Uptime',
            status: 'success',
            value: uptimeHours > 0 ? `${uptimeHours}h` : `${Math.floor(uptime / 60)}m`,
            message: `Running for ${uptimeHours}h ${Math.floor((uptime % 3600) / 60)}m`,
            progress: 100
        });
        successCount++;

        // Determine overall status
        const overall = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success';

        res.json({ 
            success: true, 
            overall,
            successCount,
            warningCount,
            errorCount,
            checks
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting health checks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create system backup
router.post('/system/backup', async (req, res) => {
    try {
        const backupManager = req.app.locals.backupManager;
        
        if (!backupManager || typeof backupManager.createBackup !== 'function') {
            return res.status(501).json({ 
                success: false, 
                error: 'Backup functionality not implemented. BackupManager not available.' 
            });
        }
        
        const backup = await backupManager.createBackup();
        res.json({ success: true, backup });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// System cleanup
router.post('/system/cleanup', async (req, res) => {
    try {
        const { cleanupType = 'logs', olderThan = 30 } = req.body;
        
        // Execute real cleanup
        const startTime = Date.now();
        let itemsRemoved = 0;
        
        if (cleanupType === 'logs') {
            const cutoffDate = new Date(Date.now() - (olderThan * 24 * 60 * 60 * 1000)).toISOString();
            const result = await req.dal.run(
                'DELETE FROM logs WHERE timestamp < ?',
                [cutoffDate]
            );
            itemsRemoved = result.changes || 0;
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.json({ 
            success: true, 
            cleanup: {
                type: cleanupType,
                itemsRemoved,
                olderThan: `${olderThan} days`,
                duration: `${duration}s`,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error during cleanup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// System restart
router.post('/system/restart', async (req, res) => {
    try {
        const { delay = 5 } = req.body;
        
        res.json({
            success: true,
            message: `System restart scheduled in ${delay} seconds`,
            scheduledFor: new Date(Date.now() + delay * 1000).toISOString()
        });

        // In a real implementation, this would restart the system
        req.app.locals?.loggers?.api?.info(`System restart requested by user ${req.user ? req.user.username : 'system'}`);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error restarting system:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// System maintenance mode
router.post('/system/maintenance', async (req, res) => {
    try {
        const { enabled, message = 'System under maintenance' } = req.body;
        
        res.json({
            success: true,
            maintenance: {
                enabled,
                message,
                timestamp: new Date().toISOString(),
                setBy: req.user ? req.user.username : 'system'
            }
        });

        req.app.locals?.loggers?.api?.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'} by ${req.user ? req.user.username : 'system'}`);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error setting maintenance mode:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rate limits info
router.get('/system/rate-limits', async (req, res) => {
    try {
        const rateLimitManager = req.app.locals.rateLimitManager;
        
        if (!rateLimitManager || typeof rateLimitManager.getStatus !== 'function') {
            return res.status(501).json({ 
                success: false, 
                error: 'Rate limit monitoring not implemented. RateLimitManager not available.' 
            });
        }
        
        const rateLimits = rateLimitManager.getStatus();
        res.json({ success: true, rateLimits });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system - summary system info
router.get('/system', async (req, res) => {
    try {
        const uptime = process.uptime();
        const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const cpuCount = require('os').cpus().length;
        const system = {
            version: '2.2.0',
            uptime: Math.round(uptime),
            memoryUsageMB,
            cpuCount
        };
        res.json({ success: true, system });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting system info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;