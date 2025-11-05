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
            uptime: 0
        };
        this.integrationMetrics = {};
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
        setInterval(() => {
            this.serverMetrics.uptime = Date.now() - this.serverMetrics.startTime.getTime();
        }, 60000);

        // Collect performance metrics every 30 seconds
        setInterval(() => {
            this.collectPerformanceMetrics();
        }, 30000);
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

    incrementErrors() {
        this.serverMetrics.errors++;
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
            performance: this.performanceMetrics
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
}

module.exports = MetricsManager;