/**
 * Response Cache Middleware
 * Caches expensive database queries and rendered pages to improve performance
 */

class ResponseCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.defaultTTL = options.defaultTTL || 30000; // 30 seconds default
        this.maxSize = options.maxSize || 100; // Max 100 cached items
    }

    /**
     * Get cached value
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // Check if expired
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    /**
     * Set cached value
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict oldest if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }

    /**
     * Clear cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        return size;
    }

    /**
     * Clear cache entries matching a pattern
     */
    clearPattern(pattern) {
        let cleared = 0;
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                cleared++;
            }
        }
        return cleared;
    }

    /**
     * Clear expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Middleware factory for caching GET requests
     */
    middleware(ttl) {
        return (req, res, next) => {
            // Only cache GET requests
            if (req.method !== 'GET') {
                return next();
            }

            const key = `${req.originalUrl || req.url}`;
            const cached = this.get(key);

            if (cached) {
                // Send cached response
                res.setHeader('X-Cache', 'HIT');
                return res.send(cached);
            }

            // Intercept res.send to cache the response
            const originalSend = res.send;
            res.send = (body) => {
                // Only cache successful responses
                if (res.statusCode === 200) {
                    this.set(key, body, ttl);
                    res.setHeader('X-Cache', 'MISS');
                }
                return originalSend.call(res, body);
            };

            next();
        };
    }
}

// Create global cache instance
const cache = new ResponseCache({
    defaultTTL: 30000, // 30 seconds
    maxSize: 200
});

// Cleanup expired entries every 60 seconds
setInterval(() => cache.cleanup(), 60000);

module.exports = cache;
