const fs = require('fs');
const path = require('path');

class MetricsManager {
    constructor(loggers) {
        this.loggers = loggers;
        this.serverMetrics = {
            startTime: new Date(),
            totalRequests: 0,
            totalLogs: 0,
            totalBytes: 0,
            activeConnections: 0,
            errors: 0,
            avgResponseTime: 0,
            uptime: 0,
            lockedInserts: 0,
            retriedInserts: 0,
            failedInserts: 0,
            batchedInserts: 0,
            batchFlushes: 0
        };
        this.integrationMetrics = {};
    // Per-source ingestion metrics: counts and bytes grouped by source label
    this.sourceMetrics = {}; // { [source]: { logs: number, bytes: number } }
        this.performanceMetrics = {
            cpuUsage: 0,
            memoryUsage: 0,
            diskUsage: 0
        };
        this.initialized = false;
        this.lastCpuUsage = null;
        this.lastCpuTime = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        this.loggers.system.info('📊 Initializing Metrics Manager...');
        
        // Start metrics collection intervals
        this.initializeMetricsCollection();
        
        this.initialized = true;
        this.loggers.system.info('✅ Metrics Manager initialized');
    }

    initializeMetricsCollection() {
        // Update server uptime every minute
        this.uptimeInterval = setInterval(() => {
            this.serverMetrics.uptime = Date.now() - this.serverMetrics.startTime.getTime();
        }, 60000);

        // Collect performance metrics every 30 seconds
        this.perfInterval = setInterval(() => {
            this.collectPerformanceMetrics();
        }, 30000);
        
        // Cleanup old metrics every 5 minutes to prevent memory growth
        this.cleanupInterval = setInterval(() => {
            this.cleanupMetrics();
        }, 300000);
    }

    collectPerformanceMetrics() {
        const used = process.memoryUsage();
        this.performanceMetrics.memoryUsage = Math.round(used.heapUsed / 1024 / 1024); // MB
        
        // CPU usage calculation
        this.updateCpuUsage();
        
        // Disk usage calculation
        this.updateDiskUsage();
    }

    incrementRequests() {
        this.serverMetrics.totalRequests++;
    }

    incrementLogs() {
        this.serverMetrics.totalLogs++;
    }

    incrementBytes(bytes) {
        this.serverMetrics.totalBytes += bytes;
    }

    // Record ingestion event grouped by source (e.g., 'file', 'syslog', 'gelf', custom sources)
    recordIngestion(source = 'unknown', bytes = 0) {
        const key = String(source || 'unknown');
        if (!this.sourceMetrics[key]) this.sourceMetrics[key] = { logs: 0, bytes: 0 };
        this.sourceMetrics[key].logs += 1;
        this.sourceMetrics[key].bytes += (Number(bytes) || 0);
        // Maintain global counters too
        this.incrementLogs();
        this.incrementBytes(Number(bytes) || 0);
    }

    incrementErrors() {
        this.serverMetrics.errors++;
    }

    incrementLockedInsert() {
        this.serverMetrics.lockedInserts++;
    }

    incrementRetriedInsert() {
        this.serverMetrics.retriedInserts++;
    }

    incrementFailedInsert() {
        this.serverMetrics.failedInserts++;
    }

    incrementBatchedInsert(count = 1) {
        this.serverMetrics.batchedInserts += count;
    }

    incrementBatchFlush() {
        this.serverMetrics.batchFlushes++;
    }

    updateCpuUsage() {
        // Real CPU usage calculation using process.cpuUsage()
        if (!this.lastCpuUsage) {
            this.lastCpuUsage = process.cpuUsage();
            this.lastCpuTime = Date.now();
            this.performanceMetrics.cpuUsage = 0;
            return;
        }

        const currentUsage = process.cpuUsage();
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastCpuTime;
        
        if (timeDiff > 0) {
            // Calculate CPU usage percentage
            const userDiff = currentUsage.user - this.lastCpuUsage.user;
            const systemDiff = currentUsage.system - this.lastCpuUsage.system;
            const totalDiff = userDiff + systemDiff;
            
            // Convert microseconds to percentage
            const cpuPercent = (totalDiff / (timeDiff * 1000)) * 100;
            this.performanceMetrics.cpuUsage = Math.min(Math.max(cpuPercent, 0), 100);
        }

        this.lastCpuUsage = currentUsage;
        this.lastCpuTime = currentTime;
    }

    updateDiskUsage() {
        // Calculate database size as disk usage indicator
        try {
            const dbPath = path.join(__dirname, '..', 'data', 'databases', 'logs.db');
            
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                const sizeInMB = stats.size / (1024 * 1024);
                
                // Estimate disk usage percentage based on database size
                // Assume 1GB = 100%, adjust as needed
                this.performanceMetrics.diskUsage = Math.min((sizeInMB / 1024) * 100, 100);
            } else {
                this.performanceMetrics.diskUsage = 0;
            }
        } catch (error) {
            // Fallback to minimal usage if file system check fails
            this.performanceMetrics.diskUsage = 5; // 5% default
        }
    }

    getMetrics() {
        return {
            server: this.serverMetrics,
            integrations: this.integrationMetrics,
            performance: this.performanceMetrics,
            sources: this.sourceMetrics
        };
    }

    // Additional utility methods for metrics
    setActiveConnections(count) {
        this.serverMetrics.activeConnections = count;
    }

    updateResponseTime(responseTime) {
        // Simple moving average for response time
        if (this.serverMetrics.avgResponseTime === 0) {
            this.serverMetrics.avgResponseTime = responseTime;
        } else {
            this.serverMetrics.avgResponseTime = (this.serverMetrics.avgResponseTime * 0.9) + (responseTime * 0.1);
        }
    }

    recordIntegrationMetric(integration, metric, value) {
        if (!this.integrationMetrics[integration]) {
            this.integrationMetrics[integration] = {};
        }
        this.integrationMetrics[integration][metric] = value;
    }

    getServerUptime() {
        return Date.now() - this.serverMetrics.startTime.getTime();
    }

    getFormattedUptime() {
        const uptimeMs = this.getServerUptime();
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    
    cleanupMetrics() {
        // Limit source metrics to top 100 sources to prevent unbounded growth
        const sources = Object.keys(this.sourceMetrics);
        if (sources.length > 100) {
            // Sort by total logs + bytes, keep top 100
            const sorted = sources.sort((a, b) => {
                const scoreA = this.sourceMetrics[a].logs + (this.sourceMetrics[a].bytes / 1000);
                const scoreB = this.sourceMetrics[b].logs + (this.sourceMetrics[b].bytes / 1000);
                return scoreB - scoreA;
            });
            
            // Remove bottom entries
            sorted.slice(100).forEach(source => {
                delete this.sourceMetrics[source];
            });
        }
        
        // Limit integration metrics to 50 integrations
        const integrations = Object.keys(this.integrationMetrics);
        if (integrations.length > 50) {
            integrations.slice(50).forEach(integration => {
                delete this.integrationMetrics[integration];
            });
        }
    }
    
    shutdown() {
        // Clear all intervals to prevent memory leaks
        if (this.uptimeInterval) clearInterval(this.uptimeInterval);
        if (this.perfInterval) clearInterval(this.perfInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    }
}

module.exports = MetricsManager;