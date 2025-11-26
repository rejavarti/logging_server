/**
 * SLA Tracker Middleware
 * Captures request latency and stores rolling metrics for SLA monitoring
 */

const metricsStore = {
    requests: [], // Rolling window of request metrics
    maxSize: 10000, // Keep last 10k requests
    
    // Add request metric
    add(metric) {
        this.requests.push(metric);
        if (this.requests.length > this.maxSize) {
            this.requests.shift(); // Remove oldest
        }
    },
    
    // Get metrics for specific endpoint or all
    getMetrics(endpoint = null, timeWindowMs = 3600000) { // Default 1 hour
        const now = Date.now();
        const cutoff = now - timeWindowMs;
        
        let filtered = this.requests.filter(r => r.timestamp >= cutoff);
        if (endpoint) {
            filtered = filtered.filter(r => r.endpoint === endpoint);
        }
        
        if (filtered.length === 0) {
            return {
                count: 0,
                avgLatencyMs: 0,
                p50Ms: 0,
                p95Ms: 0,
                p99Ms: 0,
                errorRate: 0,
                errors: 0
            };
        }
        
        // Calculate metrics
        const latencies = filtered.map(r => r.latencyMs).sort((a, b) => a - b);
        const errors = filtered.filter(r => r.statusCode >= 400).length;
        
        return {
            count: filtered.length,
            avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
            p50Ms: percentile(latencies, 50),
            p95Ms: percentile(latencies, 95),
            p99Ms: percentile(latencies, 99),
            errorRate: ((errors / filtered.length) * 100).toFixed(2),
            errors
        };
    },
    
    // Get top endpoints by request count
    getTopEndpoints(limit = 10, timeWindowMs = 3600000) {
        const now = Date.now();
        const cutoff = now - timeWindowMs;
        const filtered = this.requests.filter(r => r.timestamp >= cutoff);
        
        const byEndpoint = {};
        filtered.forEach(r => {
            if (!byEndpoint[r.endpoint]) {
                byEndpoint[r.endpoint] = [];
            }
            byEndpoint[r.endpoint].push(r);
        });
        
        return Object.entries(byEndpoint)
            .map(([endpoint, reqs]) => {
                const latencies = reqs.map(r => r.latencyMs).sort((a, b) => a - b);
                const errors = reqs.filter(r => r.statusCode >= 400).length;
                return {
                    endpoint,
                    count: reqs.length,
                    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
                    p95Ms: percentile(latencies, 95),
                    errorRate: ((errors / reqs.length) * 100).toFixed(2)
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
};

// Calculate percentile
function percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return Math.round(sortedArray[Math.max(0, index)]);
}

// Middleware function
function slaTracker(req, res, next) {
    const startTime = Date.now();
    
    // Capture response finish
    res.on('finish', () => {
        const latencyMs = Date.now() - startTime;
        
        // Normalize endpoint path (remove IDs, query params)
        const endpoint = normalizeEndpoint(req.path);
        
        metricsStore.add({
            timestamp: Date.now(),
            endpoint,
            method: req.method,
            statusCode: res.statusCode,
            latencyMs
        });
    });
    
    next();
}

// Normalize endpoint to remove variable parts
function normalizeEndpoint(path) {
    return path
        .replace(/\/\d+/g, '/:id')  // Replace numeric IDs
        .replace(/\/[a-f0-9-]{36}/g, '/:uuid')  // Replace UUIDs
        .replace(/\?.*$/, '');  // Remove query string
}

// Export middleware and store accessor
slaTracker.getMetrics = (endpoint, timeWindowMs) => metricsStore.getMetrics(endpoint, timeWindowMs);
slaTracker.getTopEndpoints = (limit, timeWindowMs) => metricsStore.getTopEndpoints(limit, timeWindowMs);

module.exports = slaTracker;
