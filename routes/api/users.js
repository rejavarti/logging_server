const express = require('express');
const router = express.Router();

// Users API endpoints
router.get('/users', async (req, res) => {
    try {
        const users = [
            {
                id: 1,
                username: 'admin',
                email: 'admin@localhost',
                role: 'admin',
                status: 'active',
                created: '2024-01-01T00:00:00Z',
                lastLogin: '2024-11-02T06:15:00Z',
                permissions: ['admin:*', 'logs:*', 'dashboards:*', 'users:*']
            },
            {
                id: 2,
                username: 'viewer',
                email: 'viewer@localhost', 
                role: 'viewer',
                status: 'active',
                created: '2024-01-15T10:30:00Z',
                lastLogin: '2024-11-01T18:20:00Z',
                permissions: ['logs:read', 'dashboards:read']
            },
            {
                id: 3,
                username: 'analyst',
                email: 'analyst@localhost',
                role: 'analyst',
                status: 'active', 
                created: '2024-02-01T09:15:00Z',
                lastLogin: '2024-11-01T14:45:00Z',
                permissions: ['logs:*', 'dashboards:*', 'search:*']
            }
        ];

        res.json({ success: true, users });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/users', async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username, email and password are required' 
            });
        }

        const newUser = {
            id: Date.now(),
            username,
            email,
            role: role || 'viewer',
            status: 'active',
            created: new Date().toISOString(),
            lastLogin: null,
            permissions: role === 'admin' ? ['admin:*', 'logs:*', 'dashboards:*', 'users:*'] 
                       : role === 'analyst' ? ['logs:*', 'dashboards:*', 'search:*']
                       : ['logs:read', 'dashboards:read']
        };

        res.json({ success: true, user: newUser });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Update user in database
        const updatedUser = {
            id: parseInt(id),
            ...updates,
            updated: new Date().toISOString()
        };

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === '1') {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete admin user' 
            });
        }

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin-specific endpoints
router.get('/admin/sessions', async (req, res) => {
    try {
        const sessions = [
            {
                id: 'sess_1234567890',
                userId: 1,
                username: 'admin',
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                created: '2024-11-02T05:30:00Z',
                lastActivity: '2024-11-02T06:25:00Z',
                status: 'active',
                location: 'Local Network'
            },
            {
                id: 'sess_0987654321',
                userId: 2,
                username: 'viewer',
                ip: '192.168.1.150',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                created: '2024-11-01T18:15:00Z',
                lastActivity: '2024-11-01T19:30:00Z',
                status: 'expired',
                location: 'Local Network'
            }
        ];

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/admin/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Invalidate session
        
        res.json({ success: true, message: 'Session terminated successfully' });
    } catch (error) {
        console.error('Error terminating session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// User roles and permissions
router.get('/roles', async (req, res) => {
    try {
        const roles = [
            {
                name: 'admin',
                displayName: 'Administrator',
                description: 'Full system access including user management',
                permissions: ['admin:*', 'logs:*', 'dashboards:*', 'users:*', 'settings:*']
            },
            {
                name: 'analyst',
                displayName: 'Log Analyst',
                description: 'Advanced log analysis and dashboard creation',
                permissions: ['logs:*', 'dashboards:*', 'search:*', 'alerts:read']
            },
            {
                name: 'viewer',
                displayName: 'Viewer',
                description: 'Read-only access to logs and dashboards',
                permissions: ['logs:read', 'dashboards:read']
            },
            {
                name: 'operator',
                displayName: 'System Operator',
                description: 'System monitoring and basic configuration',
                permissions: ['logs:read', 'dashboards:read', 'alerts:*', 'settings:basic']
            }
        ];

        res.json({ success: true, roles });
    } catch (error) {
        console.error('Error getting roles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;