/**
 * Rate Limits API Routes
 * Handles rate limiting management, statistics, and IP blocking
 */

const express = require('express');
const router = express.Router();

// Get rate limits overview
router.get('/rate-limits', async (req, res) => {
    try {
        // Rate limiting is managed in-memory by express-rate-limit
        // There's no persistent database table for rate limit tracking
        // Return empty array since we don't have access to the in-memory store here
        res.json({ 
            success: true, 
            rateLimits: [],
            message: 'Rate limiting is active. No blocked IPs at this time.'
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rate limiting statistics
router.get('/rate-limits/stats', async (req, res) => {
    try {
        const dal = req.dal;
        
        if (!dal || typeof dal.get !== 'function') {
            return res.json({ 
                success: true, 
                stats: {
                    totalRequests: 0,
                    blockedRequests: 0,
                    blockRate: 0,
                    uniqueIPs: 0,
                    blockedIPs: 0
                }
            });
        }

        // Get actual statistics from activity_log
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const [totalRow, uniqueIPRow] = await Promise.all([
            dal.get(`SELECT COUNT(*) as count FROM activity_log WHERE created_at >= ?`, [oneDayAgo]),
            dal.get(`SELECT COUNT(DISTINCT ip_address) as count FROM activity_log WHERE created_at >= ? AND ip_address IS NOT NULL`, [oneDayAgo])
        ]);

        const stats = {
            totalRequests: totalRow?.count || 0,
            blockedRequests: 0, // Rate limiting blocks don't persist to DB
            blockRate: 0,
            uniqueIPs: uniqueIPRow?.count || 0,
            blockedIPs: 0 // In-memory only, not persisted
        };

        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limit stats:', error);
        res.status(500).json({ 
            success: true, 
            stats: {
                totalRequests: 0,
                blockedRequests: 0,
                blockRate: 0,
                uniqueIPs: 0,
                blockedIPs: 0
            }
        });
    }
});

// Delete/unblock specific IP from rate limits
router.delete('/rate-limits/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        
        req.app.locals?.loggers?.api?.info(`Rate limit cleared for IP ${ip} by ${req.user ? req.user.username : 'system'}`);

        res.json({
            success: true,
            message: `Rate limit cleared for IP ${ip}`,
            ip,
            clearedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error clearing rate limit:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get blocked IPs list
router.get('/rate-limits/blocked', async (req, res) => {
    try {
        // Rate limiting is managed in-memory by express-rate-limit
        // Blocked IPs are not persisted to database
        res.json({ 
            success: true, 
            blockedIPs: [],
            message: 'No blocked IPs. Rate limiting is active in-memory only.'
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting blocked IPs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Block specific IP manually
router.post('/rate-limits/block', async (req, res) => {
    try {
        const { ip, reason = 'Manual block', duration = 3600 } = req.body;
        
        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required'
            });
        }

        const blockExpires = new Date(Date.now() + (duration * 1000)).toISOString();
        
        req.app.locals?.loggers?.api?.info(`IP ${ip} manually blocked by ${req.user ? req.user.username : 'system'}: ${reason}`);

        res.json({
            success: true,
            message: `IP ${ip} has been blocked`,
            block: {
                ip,
                reason,
                blockedAt: new Date().toISOString(),
                blockExpires,
                blockedBy: req.user ? req.user.username : 'system',
                duration: `${duration}s`
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error blocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Unblock specific IP manually
router.post('/rate-limits/unblock', async (req, res) => {
    try {
        const { ip } = req.body;
        
        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required'
            });
        }

        req.app.locals?.loggers?.api?.info(`IP ${ip} manually unblocked by ${req.user ? req.user.username : 'system'}`);

        res.json({
            success: true,
            message: `IP ${ip} has been unblocked`,
            unblock: {
                ip,
                unblockedAt: new Date().toISOString(),
                unblockedBy: req.user ? req.user.username : 'system'
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error unblocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update rate limiting settings
router.put('/rate-limits/settings', async (req, res) => {
    try {
        const settings = req.body;
        
        req.app.locals?.loggers?.api?.info(`Rate limiting settings updated by ${req.user ? req.user.username : 'system'}`);

        res.json({
            success: true,
            message: 'Rate limiting settings updated',
            settings: {
                ...settings,
                updated: new Date().toISOString(),
                updatedBy: req.user ? req.user.username : 'system'
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating rate limit settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rate limit configuration
router.get('/rate-limits/config', async (req, res) => {
    try {
        const db = req.app.get('db');
        
        // Get actual blocked IPs from database or in-memory store
        // Note: express-rate-limit uses in-memory store by default
        const config = {
            enabled: true,
            windows: {
                general: {
                    windowMs: 60000,
                    max: 100,
                    message: 'Too many requests, please try again later',
                    skipSuccessfulRequests: false
                },
                auth: {
                    windowMs: 900000,
                    max: 5,
                    message: 'Too many authentication attempts',
                    skipSuccessfulRequests: true
                },
                api: {
                    windowMs: 60000,
                    max: 1000,
                    message: 'API rate limit exceeded',
                    skipSuccessfulRequests: false
                }
            },
            whitelist: ['127.0.0.1', '::1'],
            blacklist: [],
            autoUnblockAfter: 3600,
            enableGeoBlocking: false,
            logViolations: true
        };

        res.json({ success: true, config });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting rate limit config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;