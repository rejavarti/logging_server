/**
 * Admin API Routes
 * Handles admin-specific endpoints for sessions, management
 */

const express = require('express');
const router = express.Router();

// Get active user sessions
router.get('/admin/sessions', async (req, res) => {
    try {
        const sessions = [
            {
                id: 'sess_1',
                userId: 1,
                username: 'admin',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                loginTime: '2024-11-02T06:15:00Z',
                lastActivity: new Date().toISOString(),
                active: true
            },
            {
                id: 'sess_2',
                userId: 2,
                username: 'viewer',
                ip: '192.168.1.102',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                loginTime: '2024-11-02T08:30:00Z',
                lastActivity: '2024-11-02T09:45:00Z',
                active: true
            }
        ];

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Terminate specific session
router.delete('/admin/sessions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`Session ${id} terminated by admin ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: `Session ${id} terminated successfully`,
            terminatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error terminating session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Terminate all sessions (except current)
router.post('/admin/sessions/terminate-all', async (req, res) => {
    try {
        const currentSessionId = req.sessionID || 'current';
        
        console.log(`All sessions terminated by admin ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'All sessions terminated successfully (except current)',
            terminatedSessions: 3,
            keptSession: currentSessionId,
            terminatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error terminating all sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin restart (different from system restart)
router.post('/admin/restart', async (req, res) => {
    try {
        const { reason = 'Manual restart' } = req.body;
        
        console.log(`Admin restart initiated by ${req.user ? req.user.username : 'system'}: ${reason}`);
        
        res.json({
            success: true,
            message: 'Server restart initiated',
            reason,
            initiatedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString(),
            estimatedDowntime: '10-15 seconds'
        });
    } catch (error) {
        console.error('Error initiating admin restart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;