// ============================================================================
// PERFORMANCE OPTIMIZATION ENGINE
// ============================================================================

class PerformanceOptimizationEngine {
    constructor(database, loggers, config) {
        this.db = database;
        this.loggers = loggers || console;
        this.config = config || {};
        this.optimizationRules = [];
        this.performanceHistory = [];
        this.thresholds = {
            highCpu: 80,
            highMemory: 85,
            highDisk: 90,
            slowQuery: 1000,
            errorRate: 5
        };
    }

    async initialize() {

        
        this.loggers.system.info('🚀 Initializing Performance Optimization Engine...');
        await this.loadOptimizationRules();
        this.startPerformanceMonitoring();
        this.loggers.system.info('✅ Performance Optimization Engine initialized successfully');
        return true;
    }

    async loadOptimizationRules() {
        this.optimizationRules = [
            {
                id: 'log_retention_optimization',
                name: 'Automatic Log Retention',
                type: 'cleanup',
                condition: 'log_count > 100000',
                action: 'archive_old_logs',
                priority: 'medium'
            },
            {
                id: 'database_vacuum',
                name: 'Database Optimization',
                type: 'database',
                condition: 'db_fragmentation > 20',
                action: 'vacuum_database',
                priority: 'low'
            },
            {
                id: 'memory_cleanup',
                name: 'Memory Usage Optimization',
                type: 'memory',
                condition: 'memory_usage > 85',
                action: 'clear_caches',
                priority: 'high'
            }
        ];
    }

    startPerformanceMonitoring() {
        // Monitor performance every 30 seconds
        setInterval(async () => {
            await this.collectPerformanceMetrics();
            await this.evaluateOptimizations();
        }, 30000);
    }

    async collectPerformanceMetrics() {
        try {

            
            const metrics = {
                timestamp: Date.now(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: await this.getCpuUsage(),
                uptime: process.uptime(),
                activeConnections: this.getActiveConnections(),
                databaseSize: await this.getDatabaseSize()
            };

            this.performanceHistory.push(metrics);
            
            // Keep only last 100 measurements (50 minutes of history)
            if (this.performanceHistory.length > 100) {
                this.performanceHistory.shift();
            }

            return metrics;
        } catch (error) {

        this.loggers.system.error('Error collecting performance metrics:', error);
            return null;
        }
    }

    async getCpuUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = Date.now();
            
            setTimeout(() => {
                const currentUsage = process.cpuUsage(startUsage);
                const totalTime = Date.now() - startTime;
                const cpuPercent = (currentUsage.user + currentUsage.system) / (totalTime * 1000) * 100;
                resolve(Math.min(Math.max(cpuPercent, 0), 100));
            }, 100);
        });
    }

    getActiveConnections() {
        // Count active WebSocket connections if available
        try {
            const IntegrationManager = require('../managers/integration-manager');
            const integrationManager = new IntegrationManager();
            
            if (integrationManager && integrationManager.connectedClients) {
                return integrationManager.connectedClients.size;
            }
        } catch (error) {
            // Integration manager might not be available
        }
        
        return 0;
    }

    async getDatabaseSize() {
        try {
            const result = await this.db.get("SELECT COUNT(*) as count FROM logs");
            return result ? result.count : 0;
        } catch (error) {
            return 0;
        }
    }

    async evaluateOptimizations() {
        const currentMetrics = this.performanceHistory[this.performanceHistory.length - 1];
        if (!currentMetrics) return;

        const memoryUsagePercent = (currentMetrics.memoryUsage.heapUsed / currentMetrics.memoryUsage.heapTotal) * 100;
        
        // Check for performance issues and apply optimizations
        if (memoryUsagePercent > this.thresholds.highMemory) {
            await this.optimizeMemoryUsage();
        }

        if (currentMetrics.databaseSize > 50000) {
            await this.optimizeDatabasePerformance();
        }
    }

    async optimizeMemoryUsage() {

        this.loggers.system.info('🧹 Optimizing memory usage...');
        
        try {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
        this.loggers.system.info('✅ Garbage collection completed');
            }

            // Clear performance history older than 30 minutes
            const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
            this.performanceHistory = this.performanceHistory.filter(m => m.timestamp > thirtyMinutesAgo);

        } catch (error) {
        this.loggers.system.error('Memory optimization failed:', error);
        }
    }

    async optimizeDatabasePerformance() {

        this.loggers.system.info('🗄️ Optimizing database performance...');
        
        try {
            // Run VACUUM to defragment database
            await new Promise((resolve, reject) => {
                this.db.run('VACUUM', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

        this.loggers.system.info('✅ Database optimization completed');
        } catch (error) {
        this.loggers.system.error('Database optimization failed:', error);
        }
    }

    getPerformanceReport() {
        if (this.performanceHistory.length === 0) {
            return { status: 'no_data', message: 'No performance data available' };
        }

        const latest = this.performanceHistory[this.performanceHistory.length - 1];
        const memoryUsagePercent = (latest.memoryUsage.heapUsed / latest.memoryUsage.heapTotal) * 100;
        
        return {
            status: 'active',
            currentMetrics: {
                memoryUsage: memoryUsagePercent.toFixed(1) + '%',
                uptime: Math.floor(latest.uptime / 3600) + 'h ' + Math.floor((latest.uptime % 3600) / 60) + 'm',
                activeConnections: latest.activeConnections,
                databaseSize: latest.databaseSize.toLocaleString() + ' logs'
            },
            optimizationRules: this.optimizationRules.length,
            historyLength: this.performanceHistory.length
        };
    }

    getStatistics() {
        const currentMetrics = this.performanceHistory[this.performanceHistory.length - 1];
        
        if (!currentMetrics) {
            return {
                status: 'initializing',
                uptime: process.uptime(),
                rulesActive: this.optimizationRules.length
            };
        }

        const memoryUsagePercent = (currentMetrics.memoryUsage.heapUsed / currentMetrics.memoryUsage.heapTotal) * 100;
        
        return {
            status: 'active',
            uptime: currentMetrics.uptime,
            memory: {
                used: Math.round(currentMetrics.memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(currentMetrics.memoryUsage.heapTotal / 1024 / 1024),
                percentage: memoryUsagePercent.toFixed(1)
            },
            cpu: currentMetrics.cpuUsage || 0,
            database: {
                size: currentMetrics.databaseSize,
                status: 'healthy'
            },
            connections: currentMetrics.activeConnections,
            optimizations: {
                rulesActive: this.optimizationRules.length,
                historyLength: this.performanceHistory.length,
                thresholds: this.thresholds
            }
        };
    }
}

module.exports = PerformanceOptimizationEngine;
