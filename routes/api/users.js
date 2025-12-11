const express = require('express');
const router = express.Router();

// Users API endpoints
router.get('/', async (req, res) => {
    try {
        // Get users from database if DAL available
        let users;
        if (req.dal && req.dal.getAllUsers) {
            users = await req.dal.getAllUsers();
            // Map database fields to API format
            users = users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role || 'viewer',
                status: user.is_active ? 'active' : 'inactive',
                is_active: user.is_active,
                created: user.created_at,
                created_at: user.created_at,
                lastLogin: user.last_login,
                last_login: user.last_login,
                permissions: user.role === 'admin' ? ['admin:*', 'logs:*', 'dashboards:*', 'users:*'] 
                           : user.role === 'analyst' ? ['logs:*', 'dashboards:*', 'search:*']
                           : ['logs:read', 'dashboards:read']
            }));
        } else {
            // No mock data - return empty array if DAL unavailable
            users = [];
        }

        res.json({ success: true, users });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username, email and password are required' 
            });
        }

        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Hash password using bcrypt
        const bcrypt = require('bcrypt');
        const password_hash = await bcrypt.hash(password, 10);
        
        // Check if username already exists
        const existingUser = await req.dal.get(
            `SELECT id FROM users WHERE username = ?`,
            [username]
        );
        
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Username already exists' });
        }
        
        // Insert user
        const result = await req.dal.run(
            `INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)`,
            [username, email, password_hash, role || 'viewer', true]
        );
        
        const newUser = {
            id: result.lastID,
            username,
            email,
            role: role || 'viewer',
            status: 'active',
            is_active: true,
            created: new Date().toISOString(),
            lastLogin: null,
            permissions: role === 'admin' ? ['admin:*', 'logs:*', 'dashboards:*', 'users:*'] 
                       : role === 'analyst' ? ['logs:*', 'dashboards:*', 'search:*']
                       : ['logs:read', 'dashboards:read']
        };
        
        // Log user creation activity
        if (req.user) {
            try {
                await req.dal.run(
                    `INSERT INTO activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.user.id,
                        'create_user',
                        'user',
                        result.lastID.toString(),
                        JSON.stringify({ username, email, role: newUser.role }),
                        req.ip || 'unknown',
                        req.headers['user-agent'] || 'unknown'
                    ]
                ).catch(() => {}); // Ignore activity log errors
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log user creation activity:', auditErr.message);
            }
        }

        res.json({ success: true, user: newUser });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Build dynamic update query
        const updateFields = [];
        const params = [];
        
        if (updates.username) {
            updateFields.push('username = ?');
            params.push(updates.username);
        }
        
        if (updates.email) {
            updateFields.push('email = ?');
            params.push(updates.email);
        }
        
        if (updates.role) {
            updateFields.push('role = ?');
            params.push(updates.role);
        }
        
        if (updates.password) {
            const bcrypt = require('bcrypt');
            const password_hash = await bcrypt.hash(updates.password, 10);
            updateFields.push('password_hash = ?');
            params.push(password_hash);
        }
        
        if (updates.status) {
            updateFields.push('is_active = ?');
            params.push(updates.status === 'active' ? true : false);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }
        
        params.push(parseInt(id));
        
        const result = await req.dal.run(
            `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
            params
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get updated user
        const user = await req.dal.get(`SELECT * FROM users WHERE id = ?`, [parseInt(id)]);
        
        const updatedUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'viewer',
            status: user.is_active ? 'active' : 'inactive',
            is_active: user.is_active,
            created: user.created_at,
            lastLogin: user.last_login,
            updated: new Date().toISOString()
        };
        
        // Log user update activity
        if (req.user) {
            try {
                await req.dal.run(
                    `INSERT INTO activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.user.id,
                        'update_user',
                        'user',
                        id,
                        JSON.stringify({ updated_user_id: id, changes: Object.keys(req.body) }),
                        req.ip || 'unknown',
                        req.headers['user-agent'] || 'unknown'
                    ]
                ).catch(() => {}); // Ignore activity log errors
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log user update activity:', auditErr.message);
            }
        }
        
        res.json({ success: true, user: updatedUser });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Special protection for user ID 1 (initial admin)
        if (id === '1') {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete the primary admin user (ID 1)' 
            });
        }

        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Check if user exists first
        const user = await req.dal.get(`SELECT * FROM users WHERE id = ?`, [parseInt(id)]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Prevent deleting users with admin role
        if (user.role === 'admin') {
            return res.status(400).json({ 
                success: false, 
                error: `Cannot delete user with admin role. Current role: ${user.role}. Please change role to 'user' first.` 
            });
        }
        
        const result = await req.dal.run(`DELETE FROM users WHERE id = ?`, [parseInt(id)]);
        
        // Log user deletion activity
        if (req.user) {
            try {
                await req.dal.run(
                    `INSERT INTO activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.user.id,
                        'delete_user',
                        'user',
                        id,
                        JSON.stringify({ 
                            deleted_user_id: id,
                            deleted_username: user.username,
                            deleted_user_role: user.role
                        }),
                        req.ip || 'unknown',
                        req.headers['user-agent'] || 'unknown'
                    ]
                ).catch(() => {}); // Ignore activity log errors
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log user deletion activity:', auditErr.message);
            }
        }
        
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// User roles and permissions
router.get('/roles', async (req, res) => {
    try {
        if (req.dal && typeof req.dal.getRoles === 'function') {
            const roles = await req.dal.getRoles();
            return res.json({ success: true, roles });
        }
        // Graceful empty response (no mock) when DAL missing
        return res.json({ success: true, roles: [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting roles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;