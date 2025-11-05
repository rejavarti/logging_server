/**
 * Authentication Routes Module
 * Handles all authentication-related endpoints
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = function(dependencies) {
    const { dal, userManager, loggers, config } = dependencies;
    const router = express.Router();
    
    // Login endpoint
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }
            
            // Use UserManager for authentication
            const result = await userManager.authenticateUser(username, password);
            
            if (result.success) {
                // Generate JWT token
                const token = jwt.sign(
                    { userId: result.user.id, username: result.user.username, role: result.user.role },
                    config.auth.jwtSecret,
                    { expiresIn: '24h' }
                );
                
                // Log successful login via DAL
                await dal.logActivity(result.user.id, 'login', '/api/auth/login', `Successful login from ${req.ip}`, req);
                
                res.json({
                    success: true,
                    token,
                    user: result.user
                });
            } else {
                res.status(401).json({ error: result.error });
            }
        } catch (error) {
            loggers.system.error('Login error:', error);
            res.status(500).json({ error: 'Authentication failed' });
        }
    });
    
    // Logout endpoint
    router.post('/logout', async (req, res) => {
        try {
            if (req.user) {
                await dal.logActivity(req.user.id, 'logout', '/api/auth/logout', `User logged out from ${req.ip}`, req);
            }
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            loggers.system.error('Logout error:', error);
            res.status(500).json({ error: 'Logout failed' });
        }
    });
    
    // Token validation endpoint
    router.get('/validate', (req, res) => {
        // Middleware already validated the token
        res.json({
            success: true,
            user: req.user
        });
    });
    
    return router;
};