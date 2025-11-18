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
                status: user.active ? 'active' : 'inactive',
                is_active: user.active === 1,
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

        let newUser;
        
        // Create user in database if DAL available
        if (req.dal && req.dal.createUser) {
            // Hash password using bcrypt
            const bcrypt = require('bcrypt');
            const password_hash = await bcrypt.hash(password, 10);
            
            const userData = {
                username,
                email,
                password_hash,
                role: role || 'viewer',
                active: 1
            };
            
            const result = await req.dal.createUser(userData);
            
            newUser = {
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
        } else {
            // No DAL available - cannot create users
            return res.status(501).json({ 
                success: false, 
                error: 'User creation not implemented - database access layer unavailable' 
            });
        }
        
        // Log user creation activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'create_user',
                    resource_type: 'user',
                    resource_id: newUser.id.toString(),
                    details: JSON.stringify({ username, email, role: newUser.role }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
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
        
        // Update user in database if DAL available
        if (req.dal && req.dal.updateUser) {
            // If password is being updated, hash it
            if (updates.password) {
                const bcrypt = require('bcrypt');
                updates.password_hash = await bcrypt.hash(updates.password, 10);
                delete updates.password;
            }
            
            // Convert status to active boolean
            if (updates.status) {
                updates.active = updates.status === 'active' ? 1 : 0;
                delete updates.status;
            }
            
            await req.dal.updateUser(parseInt(id), updates);
            
            // Get updated user
            const user = await req.dal.getUserById(parseInt(id));
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            const updatedUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role || 'viewer',
                status: user.active ? 'active' : 'inactive',
                is_active: user.active === 1,
                created: user.created_at,
                lastLogin: user.last_login,
                updated: new Date().toISOString()
            };
            
            // Log user update activity
            if (req.dal.logActivity && req.user) {
                try {
                    await req.dal.logActivity({
                        user_id: req.user.id,
                        action: 'update_user',
                        resource_type: 'user',
                        resource_id: id,
                        details: JSON.stringify({ 
                            updated_user_id: id,
                            changes: Object.keys(req.body)
                        }),
                        ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });
                } catch (auditErr) {
                    req.app.locals?.loggers?.api?.warn('Failed to log user update activity:', auditErr.message);
                }
            }
            
            res.json({ success: true, user: updatedUser });
        } else {
            // Not implemented without DAL
            return res.status(501).json({ success: false, error: 'User update not implemented - database access layer unavailable' });
        }
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

        // Delete user from database if DAL available
        if (req.dal && req.dal.deleteUser) {
            // Check if user exists first - get FRESH data from database
            const user = await req.dal.getUserById(parseInt(id));
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            // Prevent deleting users with admin role (but ID 1 check above is primary protection)
            // Only check role if it's explicitly 'admin', not username
            if (user.role === 'admin') {
                return res.status(400).json({ 
                    success: false, 
                    error: `Cannot delete user with admin role. Current role: ${user.role}. Please change role to 'user' first.` 
                });
            }
            
            await req.dal.deleteUser(parseInt(id));
            
            // Log user deletion activity
            if (req.dal.logActivity && req.user) {
                try {
                    await req.dal.logActivity({
                        user_id: req.user.id,
                        action: 'delete_user',
                        resource_type: 'user',
                        resource_id: id,
                        details: JSON.stringify({ 
                            deleted_user_id: id,
                            deleted_username: user.username,
                            deleted_user_role: user.role
                        }),
                        ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });
                } catch (auditErr) {
                    req.app.locals?.loggers?.api?.warn('Failed to log user deletion activity:', auditErr.message);
                }
            }
            
            res.json({ success: true, message: 'User deleted successfully' });
        } else {
            // No DAL available - cannot delete users
            return res.status(501).json({ 
                success: false, 
                error: 'User deletion not implemented - database access layer unavailable' 
            });
        }
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