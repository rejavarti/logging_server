/**
 * Themes API Routes
 * Manages system-wide themes (read from database instead of mocks)
 */

const express = require('express');
const router = express.Router();

// Shared handler to return the current theme (by user preference, else default)
// Defined first so route registrations below can reference it
async function handleGetCurrentTheme(req, res) {
    try {
        let theme = null;
        
        // Try to get user's theme preference if available
        let userThemeId = null;
        if (req.user && req.dal) {
            try {
                const user = await req.dal.get('SELECT preferences FROM users WHERE id = ?', [req.user.id]);
                if (user && user.preferences) {
                    try {
                        const prefs = JSON.parse(user.preferences);
                        userThemeId = prefs.theme?.themeId;
                    } catch (e) {}
                }
            } catch (e) {
                req.app.locals?.loggers?.api?.warn('Failed to get user preferences:', e.message);
            }
        }
        
        // If no user preference, use Default Light (id=1)
        const themeId = userThemeId || 1;
        
        // Try to get theme from database
        if (req.dal) {
            try {
                theme = await req.dal.get('SELECT * FROM themes WHERE id = ?', [themeId]);
            } catch (e) {
                req.app.locals?.loggers?.api?.warn('Failed to get theme from database:', e.message);
            }
        }
        
        // Default theme fallback
        const defaultTheme = {
            id: 1,
            name: 'Default Light',
            colors: {
                primary: '#3b82f6',
                secondary: '#8b5cf6',
                success: '#10b981',
                warning: '#f59e0b',
                error: '#ef4444',
                info: '#06b6d4',
                background: '#ffffff',
                surface: '#f9fafb',
                text: '#1f2937',
                textSecondary: '#6b7280',
                border: '#e5e7eb'
            },
            fonts: {
                primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                mono: '"Fira Code", "Courier New", monospace'
            },
            spacing: {
                xs: '0.25rem',
                sm: '0.5rem',
                md: '1rem',
                lg: '1.5rem',
                xl: '2rem'
            },
            borderRadius: {
                sm: '0.25rem',
                md: '0.5rem',
                lg: '0.75rem',
                xl: '1rem'
            }
        };
        
        // If database fails, return default theme
        if (!theme) {
            return res.json({
                success: true,
                theme: defaultTheme,
                lastModified: new Date().toISOString()
            });
        }
        
        // Parse theme data
        let themeData = {};
        try {
            themeData = JSON.parse(theme.data);
        } catch (e) {
            req.app.locals?.loggers?.api?.warn('Failed to parse theme data:', e.message);
            return res.json({
                success: true,
                theme: defaultTheme,
                lastModified: new Date().toISOString()
            });
        }
        
        return res.json({
            success: true,
            theme: {
                id: theme.id,
                name: theme.name,
                ...themeData
            },
            lastModified: theme.updated_at || theme.created_at
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Theme fetch error:', error);
        // Return default theme on error
        return res.json({
            success: true,
            theme: {
                id: 1,
                name: 'Default Light',
                colors: {
                    primary: '#3b82f6',
                    secondary: '#8b5cf6',
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#ef4444',
                    info: '#06b6d4',
                    background: '#ffffff',
                    surface: '#f9fafb',
                    text: '#1f2937',
                    textSecondary: '#6b7280',
                    border: '#e5e7eb'
                },
                fonts: {
                    primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    mono: '"Fira Code", "Courier New", monospace'
                },
                spacing: {
                    xs: '0.25rem',
                    sm: '0.5rem',
                    md: '1rem',
                    lg: '1.5rem',
                    xl: '2rem'
                },
                borderRadius: {
                    sm: '0.25rem',
                    md: '0.5rem',
                    lg: '0.75rem',
                    xl: '1rem'
                }
            },
            lastModified: new Date().toISOString()
        });
    }
}

// ============================================================================
// ROUTE DEFINITIONS - Order matters! Specific routes before param routes
// ============================================================================

// Get current theme - MUST be before :themeId param route to avoid capture
router.get('/themes/current', handleGetCurrentTheme);

// Get all themes (built-in + custom)
router.get('/themes/list', async (req, res) => {
    try {
        const themes = await req.dal.all(`
            SELECT 
                id,
                name,
                data,
                is_builtin,
                created_by,
                created_at,
                updated_at
            FROM themes
            ORDER BY is_builtin DESC, name ASC
        `);
        
        // Parse theme data and format for response
        const formattedThemes = themes.map(theme => {
            let themeData = {};
            try {
                themeData = JSON.parse(theme.data);
            } catch (e) {}
            
            return {
                id: theme.id.toString(),
                name: theme.name,
                preview: themeData.colors?.primary || '#3b82f6',
                type: theme.is_builtin ? 'built-in' : 'custom',
                lastModified: theme.updated_at || theme.created_at,
                createdBy: theme.created_by,
                colors: themeData.colors
            };
        });
        
        res.json({
            success: true,
            themes: formattedThemes,
            total: formattedThemes.length
        });
    } catch (error) {
        req.app.locals.loggers?.api?.error('Theme list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch theme list'
        });
    }
});

// Get specific theme by ID
router.get('/themes/:themeId', async (req, res) => {
    try {
        const theme = await req.dal.get(
            'SELECT * FROM themes WHERE id = ?',
            [req.params.themeId]
        );
        
        if (!theme) {
            return res.status(404).json({
                success: false,
                error: 'Theme not found'
            });
        }
        
        let themeData = {};
        try {
            themeData = JSON.parse(theme.data);
        } catch (e) {}
        
        res.json({
            success: true,
            theme: {
                id: theme.id,
                name: theme.name,
                ...themeData,
                isBuiltin: theme.is_builtin === 1,
                createdAt: theme.created_at,
                updatedAt: theme.updated_at
            }
        });
    } catch (error) {
        req.app.locals.loggers?.api?.error('Theme fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch theme'
        });
    }
});

// Save/create new theme
router.post('/themes/save', async (req, res) => {
    try {
        const { name, theme } = req.body;
        const userId = req.user?.id;
        
        if (!name || !theme) {
            return res.status(400).json({
                success: false,
                error: 'Theme name and data are required'
            });
        }
        
        // Validate theme structure
        const requiredFields = ['colors', 'fonts', 'spacing', 'borderRadius'];
        for (const field of requiredFields) {
            if (!theme[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required theme field: ${field}`
                });
            }
        }
        
        const themeData = JSON.stringify(theme);
        
        // Check if theme name already exists
        const existing = await req.dal.get(
            'SELECT id FROM themes WHERE name = ? AND is_builtin = 0',
            [name]
        );
        
        if (existing) {
            // Update existing custom theme
            await req.dal.run(
                `UPDATE themes 
                 SET data = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [themeData, existing.id]
            );
            
            req.app.locals.loggers?.security?.info(
                `Theme updated: ${name} by ${req.user?.username || 'unknown'}`
            );
            
            res.json({
                success: true,
                message: 'Theme updated successfully',
                theme: { id: existing.id, name, ...theme }
            });
        } else {
            // Create new custom theme
            const result = await req.dal.run(
                `INSERT INTO themes (name, data, created_by, is_builtin)
                 VALUES (?, ?, ?, 0)`,
                [name, themeData, userId]
            );
            
            req.app.locals.loggers?.security?.info(
                `Theme created: ${name} by ${req.user?.username || 'unknown'}`
            );
            
            res.json({
                success: true,
                message: 'Theme created successfully',
                theme: { id: result.lastID, name, ...theme }
            });
        }
    } catch (error) {
        req.app.locals.loggers?.api?.error('Theme save error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save theme'
        });
    }
});

// Delete custom theme
router.delete('/themes/:themeId', async (req, res) => {
    try {
        const themeId = req.params.themeId;
        
        // Check if theme exists and is not built-in
        const theme = await req.dal.get(
            'SELECT id, name, is_builtin FROM themes WHERE id = ?',
            [themeId]
        );
        
        if (!theme) {
            return res.status(404).json({
                success: false,
                error: 'Theme not found'
            });
        }
        
        if (theme.is_builtin) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete built-in themes'
            });
        }
        
        await req.dal.run('DELETE FROM themes WHERE id = ?', [themeId]);
        
        req.app.locals.loggers?.security?.warn(
            `Theme deleted: ${theme.name} (${themeId}) by ${req.user?.username || 'unknown'}`
        );
        
        res.json({
            success: true,
            message: 'Theme deleted successfully'
        });
    } catch (error) {
        req.app.locals.loggers?.api?.error('Theme delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete theme'
        });
    }
});

// Reset theme to default (for user preference)
router.post('/themes/reset', async (req, res) => {
    try {
        if (req.user) {
            // Update user preferences to use default theme
            const user = await req.dal.get('SELECT preferences FROM users WHERE id = ?', [req.user.id]);
            let preferences = {};
            if (user && user.preferences) {
                try {
                    preferences = JSON.parse(user.preferences);
                } catch (e) {}
            }
            
            preferences.theme = { themeId: 1 }; // Default Light
            
            await req.dal.run(
                'UPDATE users SET preferences = ? WHERE id = ?',
                [JSON.stringify(preferences), req.user.id]
            );
        }
        
        req.app.locals.loggers?.api?.info(
            `Theme reset to defaults by ${req.user?.username || 'unknown'}`
        );
        
        res.json({
            success: true,
            message: 'Theme reset to defaults successfully'
        });
    } catch (error) {
        req.app.locals.loggers?.api?.error('Theme reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset theme'
        });
    }
});

module.exports = router;
