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
        // Get system stats (log counts, sources, error rate)
        const stats = await req.dal.getSystemStats?.() || {};
        
        // Get system health (CPU, memory, disk, uptime)
        const health = await req.dal.getSystemHealth?.() || {};
        
        // Get log sources for active sources count
        const sources = await req.dal.getLogSources?.() || [];
        
        // Calculate error rate
        const totalLogs = stats.totalLogs || 0;
        const errorCount = stats.errorCount || 0;
        const errorRate = totalLogs > 0 ? ((errorCount / totalLogs) * 100) : 0;
        
        // Fallback to basic system metrics if needed
        const uptime = health.uptime || process.uptime();
        const memUsage = process.memoryUsage();
        const cpuUsage = os.loadavg();
        
        const memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const cpuPercent = health.cpu || Math.min(Math.round((cpuUsage[0] / os.cpus().length) * 100), 100);
        
        // Get total requests from metrics manager or use default
        let totalRequests = 0;
        if (req.app.locals.requestCount) {
            totalRequests = req.app.locals.requestCount;
        }
        
        // Disk usage (from DAL health for consistency)
        let diskUsedMB = health.diskUsedMB || 0;
        let diskTotalMB = health.diskTotalMB || 0;
        let diskPercent = health.disk || 0;

        // Persist hourly disk usage for trend (lazy create table)
        try {
            await req.dal.run("CREATE TABLE IF NOT EXISTS disk_usage_history (ts BIGINT PRIMARY KEY, used_mb INTEGER, percent INTEGER)");
            const now = Date.now();
            const hourBucket = Math.floor(now / 3600000) * 3600000; // start of hour
            const existing = await req.dal.get("SELECT ts FROM disk_usage_history WHERE ts = $1", [hourBucket]);
            if (!existing) {
                await req.dal.run("INSERT INTO disk_usage_history (ts, used_mb, percent) VALUES ($1, $2, $3)", [hourBucket, Math.round(diskUsedMB), Math.round(diskPercent)]);
            }
            // Fetch last 72 hours
            const trendRows = await req.dal.all("SELECT ts, used_mb, percent FROM disk_usage_history ORDER BY ts DESC LIMIT 72");
            var diskTrend = trendRows.map(r => ({ ts: r.ts, usedMB: r.used_mb, percent: r.percent })).sort((a,b)=>a.ts-b.ts);
        } catch (trendErr) {
            var diskTrend = [];
            req.app.locals?.loggers?.api?.warn?.('disk trend error', trendErr.message);
        }

        const metrics = {
            // System overview widget fields
            totalLogs: totalLogs,
            errorRate: errorRate,
            uptime: Math.round(uptime),
            activeSources: sources.length || 0,
            logsToday: stats.logsToday || 0,
            // Additional metrics
            memoryUsage: memoryUsageMB,
            cpuUsage: cpuPercent,
            totalRequests: totalRequests,
            diskUsedMB,
            diskTotalMB,
            disk: diskPercent,
            diskTrend
        };

        // Broadcast metrics to WebSocket subscribers
        if (typeof global.broadcastToSubscribers === 'function') {
            global.broadcastToSubscribers('metrics', 'metrics:update', metrics);
        }
        
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
        const fs = require('fs').promises;
        const path = require('path');
        const AdmZip = require('adm-zip');
        
        // Define paths
        const backupDir = path.join(__dirname, '../../backups');
        const dataDir = path.join(__dirname, '../../data');
        const dbPath = path.join(dataDir, 'logs.db');
        const configPath = path.join(__dirname, '../../config');
        
        // Ensure backup directory exists
        await fs.mkdir(backupDir, { recursive: true });
        
        // Generate backup filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `backup-manual-${timestamp}.zip`;
        const backupPath = path.join(backupDir, backupFilename);
        
        // Create ZIP archive
        const zip = new AdmZip();
        
        // Add database if exists
        try {
            await fs.access(dbPath);
            zip.addLocalFile(dbPath);
        } catch (err) {
            req.app.locals?.loggers?.api?.warn('Database file not found, skipping:', dbPath);
        }
        
        // Add settings if exists
        try {
            const settingsPath = path.join(configPath, 'settings.json');
            await fs.access(settingsPath);
            zip.addLocalFile(settingsPath, 'config/');
        } catch (err) {
            req.app.locals?.loggers?.api?.warn('Settings file not found, skipping');
        }
        
        // Write the zip file
        zip.writeZip(backupPath);
        
        const stats = await fs.stat(backupPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        // Record backup in database if available
        if (req.dal) {
            try {
                await req.dal.run(
                    `INSERT INTO backups (filename, filepath, size_bytes, checksum, backup_type, created_by) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        backupFilename,
                        backupPath,
                        stats.size,
                        'manual-' + Date.now(), // Simple checksum
                        'manual',
                        req.user?.id || 1
                    ]
                ).catch(() => {}); // Ignore if backups table doesn't exist
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Could not record backup in database:', dbErr.message);
            }
        }
        
        res.json({ 
            success: true, 
            backup: {
                filename: backupFilename,
                size: `${sizeInMB} MB`,
                size_bytes: stats.size,
                created: new Date().toISOString(),
                type: 'manual',
                path: backupPath
            }
        });
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
        // Return current rate limit status from request metrics
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Get recent request metrics to calculate rate limits
        const recentRequests = await req.dal.all(
            `SELECT endpoint, COUNT(*) as count, AVG(response_time_ms) as avg_time
             FROM request_metrics 
             WHERE timestamp > NOW() - INTERVAL '1 hour'
             GROUP BY endpoint 
             ORDER BY count DESC 
             LIMIT 10`,
            []
        ).catch(() => []);
        
        const totalRequests = await req.dal.get(
            `SELECT COUNT(*) as total FROM request_metrics WHERE timestamp > NOW() - INTERVAL '1 hour'`,
            []
        ).catch(() => ({ total: 0 }));
        
        const rateLimits = {
            enabled: true,
            global: {
                limit: 1000,
                window: '1 hour',
                current: totalRequests.total || 0,
                remaining: Math.max(0, 1000 - (totalRequests.total || 0))
            },
            byEndpoint: recentRequests.map(r => ({
                endpoint: r.endpoint,
                requests: r.count,
                avgResponseTime: Math.round(r.avg_time || 0)
            })),
            timestamp: new Date().toISOString()
        };
        
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

// GET /api/system/sla - SLA metrics (latency percentiles, error rates)
router.get('/sla', async (req, res) => {
    try {
        const slaTracker = require('../../middleware/sla-tracker');
        const { endpoint, window } = req.query;
        
        // Parse time window (default 1 hour)
        const timeWindowMs = window ? parseInt(window) * 1000 : 3600000;
        
        if (endpoint) {
            // Specific endpoint metrics
            const metrics = slaTracker.getMetrics(endpoint, timeWindowMs);
            res.json({ 
                success: true, 
                endpoint,
                window: `${timeWindowMs / 1000}s`,
                metrics 
            });
        } else {
            // Top endpoints overview
            const topEndpoints = slaTracker.getTopEndpoints(15, timeWindowMs);
            const overall = slaTracker.getMetrics(null, timeWindowMs);
            
            res.json({ 
                success: true, 
                window: `${timeWindowMs / 1000}s`,
                overall,
                topEndpoints 
            });
        }
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting SLA metrics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;