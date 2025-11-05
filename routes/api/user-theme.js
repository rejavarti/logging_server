/**
 * User-specific API Routes
 * Handles user preferences, themes, and personal settings
 */

const express = require('express');
const router = express.Router();

// Get user's theme preference
router.get('/user/theme', async (req, res) => {
    try {
        const userTheme = {
            theme: 'dark',
            customizations: {
                primaryColor: '#007bff',
                fontSize: 14,
                sidebarCollapsed: false
            },
            lastUpdated: '2024-11-01T10:30:00Z'
        };

        res.json({ success: true, theme: userTheme });
    } catch (error) {
        console.error('Error getting user theme:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user's theme preference
router.post('/user/theme', async (req, res) => {
    try {
        const themeData = req.body;
        const userId = req.user ? req.user.id : 'system';
        
        console.log(`User theme updated by user ${userId}`);
        
        res.json({
            success: true,
            theme: {
                ...themeData,
                lastUpdated: new Date().toISOString(),
                userId
            }
        });
    } catch (error) {
        console.error('Error updating user theme:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset user's theme to default
router.delete('/user/theme', async (req, res) => {
    try {
        const userId = req.user ? req.user.id : 'system';
        
        console.log(`User theme reset by user ${userId}`);
        
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
        console.error('Error resetting user theme:', error);
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
        console.error('Error getting timezone:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;