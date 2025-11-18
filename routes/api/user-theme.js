/**
 * User-specific API Routes
 * Handles user preferences, themes, and personal settings
 */

const express = require('express');
const router = express.Router();

// Get user's theme preference
router.get('/user/theme', async (req, res) => {
    try {
        let userTheme = {
            theme: 'dark',
            customizations: {
                primaryColor: '#007bff',
                fontSize: 14,
                sidebarCollapsed: false
            },
            lastUpdated: '2024-11-01T10:30:00Z'
        };

        // Get theme from database if available
        if (req.dal && req.dal.getUserById && req.user) {
            try {
                const user = await req.dal.getUserById(req.user.id);
                if (user && user.preferences) {
                    const prefs = typeof user.preferences === 'string' 
                        ? JSON.parse(user.preferences) 
                        : user.preferences;
                    if (prefs.theme) {
                        userTheme = prefs.theme;
                    }
                }
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Could not load user theme from database:', dbErr.message);
            }
        }

        res.json({ success: true, theme: userTheme });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting user theme:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user's theme preference
router.post('/user/theme', async (req, res) => {
    try {
        const themeData = req.body;
        const userId = req.user ? req.user.id : 'system';
        
        // Save theme to database if available
        if (req.dal && req.dal.updateUser && req.user) {
            try {
                // Get current preferences
                const user = await req.dal.getUserById(req.user.id);
                let preferences = {};
                if (user && user.preferences) {
                    preferences = typeof user.preferences === 'string' 
                        ? JSON.parse(user.preferences) 
                        : user.preferences;
                }
                
                // Update theme in preferences
                preferences.theme = {
                    ...themeData,
                    lastUpdated: new Date().toISOString()
                };
                
                // Save to database
                await req.dal.updateUser(req.user.id, {
                    preferences: JSON.stringify(preferences)
                });
                
                // Log theme update activity
                if (req.dal.logActivity) {
                    try {
                        await req.dal.logActivity({
                            user_id: req.user.id,
                            action: 'update_theme',
                            resource_type: 'user_preferences',
                            resource_id: req.user.id.toString(),
                            details: JSON.stringify({ 
                                theme: themeData.theme || 'custom',
                                customizations: Object.keys(themeData.customizations || {})
                            }),
                            ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                            user_agent: req.headers['user-agent'] || 'unknown'
                        });
                    } catch (auditErr) {
                        req.app.locals?.loggers?.api?.warn('Failed to log theme update activity:', auditErr.message);
                    }
                }
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Could not save user theme to database:', dbErr.message);
            }
        }
        
        req.app.locals?.loggers?.api?.info(`User theme updated by user ${userId}`);
        
        res.json({
            success: true,
            theme: {
                ...themeData,
                lastUpdated: new Date().toISOString(),
                userId
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating user theme:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset user's theme to default
router.delete('/user/theme', async (req, res) => {
    try {
        const userId = req.user ? req.user.id : 'system';
        
        // Reset theme in database if available
        if (req.dal && req.dal.updateUser && req.user) {
            try {
                const user = await req.dal.getUserById(req.user.id);
                let preferences = {};
                if (user && user.preferences) {
                    preferences = typeof user.preferences === 'string' 
                        ? JSON.parse(user.preferences) 
                        : user.preferences;
                }
                
                // Reset theme to default
                preferences.theme = {
                    theme: 'light',
                    customizations: {},
                    lastUpdated: new Date().toISOString()
                };
                
                await req.dal.updateUser(req.user.id, {
                    preferences: JSON.stringify(preferences)
                });
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Could not reset user theme in database:', dbErr.message);
            }
        }
        
        req.app.locals?.loggers?.api?.info(`User theme reset by user ${userId}`);
        
        res.json({
            success: true,
            message: 'Theme reset to default',
            theme: {
                theme: 'light',
                customizations: {},
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error resetting user theme:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get timezone information
router.get('/timezone', (req, res) => {
    try {
        const timezone = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset(),
            dst: new Date().getTimezoneOffset() !== new Date(2024, 0, 1).getTimezoneOffset(),
            serverTime: new Date().toISOString(),
            localTime: new Date().toLocaleString()
        };

        res.json(timezone);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting timezone:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;