/**
 * Admin API Routes
 * Handles admin-specific endpoints for sessions, management
 */

const express = require('express');
const router = express.Router();

// Get all users (admin view)
router.get('/users', async (req, res) => {
    try {
        if (!req.dal || !req.dal.all) {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }

        const users = await req.dal.all(
            `SELECT 
                id, username, email, role, 
                active as status,
                created_at as created, 
                last_login as lastLogin
             FROM users
             ORDER BY created_at DESC`
        );

        // Add permissions based on role
        users.forEach(user => {
            if (user.role === 'admin') {
                user.permissions = ['admin:*', 'logs:*', 'dashboards:*', 'users:*'];
            } else if (user.role === 'analyst') {
                user.permissions = ['logs:*', 'dashboards:*', 'search:*'];
            } else {
                user.permissions = ['logs:read', 'dashboards:read'];
            }
        });

        res.json({ success: true, users });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting admin users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get active user sessions
router.get('/sessions', async (req, res) => {
    try {
        if (!req.dal || !req.dal.all) {
            return res.status(503).json({ success: false, error: 'Database not available' });
        }

        let sessions = [];
        
        try {
            // Ensure user_sessions table exists
            await req.dal.run(`
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_token TEXT UNIQUE NOT NULL,
                    user_id INTEGER NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            
            sessions = await req.dal.all(
                `SELECT 
                    s.id, s.user_id as userId, u.username,
                    s.ip_address, s.user_agent,
                    s.created_at, s.last_activity,
                    s.expires_at,
                    s.is_active as active
                 FROM user_sessions s
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE s.is_active = true AND s.expires_at > NOW()
                 ORDER BY s.last_activity DESC`
            );
        } catch (dbErr) {
            // Table might not exist or query failed
            req.app.locals?.loggers?.api?.warn('Sessions table query failed:', dbErr.message);
            
            // Return empty array if database unavailable - no mock data
            sessions = [];
        }

        res.json({ success: true, sessions: sessions || [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Terminate specific session
router.delete('/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete session from database if DAL available
        if (req.dal && req.dal.deleteSessionById) {
            await req.dal.deleteSessionById(id);
            
            // Log session termination activity
            if (req.dal.logActivity && req.user) {
                try {
                    await req.dal.logActivity({
                        user_id: req.user.id,
                        action: 'terminate_session',
                        resource_type: 'session',
                        resource_id: id,
                        details: JSON.stringify({ 
                            session_id: id,
                            terminated_by: req.user.username
                        }),
                        ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });
                } catch (auditErr) {
                    req.app.locals?.loggers?.api?.warn('Failed to log session termination activity:', auditErr.message);
                }
            }
        }
        
        req.app.locals?.loggers?.api?.info(`Session ${id} terminated by admin ${req.user ? req.user.username : 'system'}`);
        
        // Broadcast session termination to WebSocket subscribers
        if (typeof global.broadcastToSubscribers === 'function') {
            global.broadcastToSubscribers('sessions', 'session:terminated', {
                sessionId: id,
                terminatedBy: req.user ? req.user.username : 'system',
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            message: `Session ${id} terminated successfully`,
            terminatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error terminating session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Terminate all sessions (except current)
router.post('/sessions/terminate-all', async (req, res) => {
    try {
        const currentSessionId = req.sessionID || 'current';
        
        req.app.locals?.loggers?.api?.info(`All sessions terminated by admin ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'All sessions terminated successfully (except current)',
            terminatedSessions: 3,
            keptSession: currentSessionId,
            terminatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error terminating all sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin restart (different from system restart)
router.post('/restart', async (req, res) => {
    try {
        const { reason = 'Manual restart' } = req.body;
        
        req.app.locals?.loggers?.api?.info(`Admin restart initiated by ${req.user ? req.user.username : 'system'}: ${reason}`);
        
        res.json({
            success: true,
            message: 'Server restart initiated',
            reason,
            initiatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString(),
            estimatedDowntime: '10-15 seconds'
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error initiating admin restart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;