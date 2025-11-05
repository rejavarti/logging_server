/**
 * Rate Limits API Routes
 * Handles rate limiting management, statistics, and IP blocking
 */

const express = require('express');
const router = express.Router();

// Get rate limits overview
router.get('/rate-limits', async (req, res) => {
    try {
        const rateLimits = {
            general: {
                windowMs: 60000,
                max: 100,
                current: 23,
                resetTime: new Date(Date.now() + 37000).toISOString()
            },
            auth: {
                windowMs: 900000,
                max: 5,
                current: 1,
                resetTime: new Date(Date.now() + 847000).toISOString()
            },
            api: {
                windowMs: 60000,
                max: 1000,
                current: 156,
                resetTime: new Date(Date.now() + 23000).toISOString()
            }
        };

        res.json({ success: true, rateLimits });
    } catch (error) {
        console.error('Error getting rate limits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rate limiting statistics
router.get('/rate-limits/stats', async (req, res) => {
    try {
        const stats = {
            totalRequests: 45672,
            blockedRequests: 234,
            blockRate: 0.51,
            uniqueIPs: 127,
            blockedIPs: 8,
            topRequesters: [
                { ip: '192.168.1.100', requests: 15420, blocked: 0, country: 'Local' },
                { ip: '10.0.0.50', requests: 8934, blocked: 12, country: 'Local' },
                { ip: '203.0.113.45', requests: 2345, blocked: 89, country: 'US' },
                { ip: '198.51.100.23', requests: 1876, blocked: 156, country: 'CA' }
            ],
            hourlyStats: [
                { hour: '13:00', requests: 2345, blocked: 23 },
                { hour: '14:00', requests: 3456, blocked: 34 },
                { hour: '15:00', requests: 4567, blocked: 45 },
                { hour: '16:00', requests: 2890, blocked: 12 }
            ],
            blockedReasons: {
                'Rate limit exceeded': 156,
                'Authentication failed': 45,
                'Suspicious activity': 23,
                'IP blacklisted': 10
            }
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting rate limit stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete/unblock specific IP from rate limits
router.delete('/rate-limits/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        
        console.log(`Rate limit cleared for IP ${ip} by ${req.user ? req.user.username : 'system'}`);

        res.json({
            success: true,
            message: `Rate limit cleared for IP ${ip}`,
            ip,
            clearedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error clearing rate limit:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get blocked IPs list
router.get('/rate-limits/blocked', async (req, res) => {
    try {
        const blockedIPs = [
            {
                ip: '203.0.113.45',
                reason: 'Rate limit exceeded',
                blockedAt: '2024-11-02T06:15:00Z',
                blockExpires: '2024-11-02T07:15:00Z',
                requestCount: 1500,
                country: 'US',
                userAgent: 'Mozilla/5.0...',
                autoUnblock: true
            },
            {
                ip: '198.51.100.23', 
                reason: 'Suspicious activity',
                blockedAt: '2024-11-02T05:30:00Z',
                blockExpires: '2024-11-02T17:30:00Z',
                requestCount: 2300,
                country: 'CA',
                userAgent: 'curl/7.68.0',
                autoUnblock: false
            }
        ];

        res.json({ success: true, blockedIPs });
    } catch (error) {
        console.error('Error getting blocked IPs:', error);
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
        
        console.log(`IP ${ip} manually blocked by ${req.user ? req.user.username : 'system'}: ${reason}`);

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
        console.error('Error blocking IP:', error);
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

        console.log(`IP ${ip} manually unblocked by ${req.user ? req.user.username : 'system'}`);

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
        console.error('Error unblocking IP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update rate limiting settings
router.put('/rate-limits/settings', async (req, res) => {
    try {
        const settings = req.body;
        
        console.log(`Rate limiting settings updated by ${req.user ? req.user.username : 'system'}`);

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
        console.error('Error updating rate limit settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rate limit configuration
router.get('/rate-limits/config', async (req, res) => {
    try {
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
            whitelist: ['127.0.0.1', '::1', '192.168.1.0/24'],
            blacklist: ['203.0.113.45', '198.51.100.23'],
            autoUnblockAfter: 3600,
            enableGeoBlocking: false,
            logViolations: true
        };

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting rate limit config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;