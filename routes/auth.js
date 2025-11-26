/**
 * Authentication Routes Module
 * Handles all authentication-related endpoints
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const moment = require('moment');

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
                // Generate JWT token (24h expiry)
                const token = jwt.sign(
                    { userId: result.user.id, username: result.user.username, role: result.user.role },
                    config.auth.jwtSecret,
                    { expiresIn: '24h' }
                );

                // Compute session expiry (match JWT validity)
                const expiresAt = moment.utc().add(24, 'hours').format('YYYY-MM-DD HH:mm:ss');

                // Create persistent session record (ignore failures but log them)
                if (dal && dal.createUserSession) {
                    try {
                        loggers?.system?.info(`Creating session for user ${result.user.id} (${result.user.username})`);
                        await dal.createUserSession({
                            session_token: token,
                            user_id: result.user.id,
                            ip_address: req.ip || req.connection?.remoteAddress || null,
                            user_agent: req.headers['user-agent'] || null,
                            expires_at: expiresAt
                        });
                        loggers?.system?.info(`Session created successfully for user ${result.user.username}`);
                    } catch (sessionErr) {
                        loggers?.system?.error('Failed to persist session record:', sessionErr.message, sessionErr.stack);
                    }
                } else {
                    loggers?.system?.warn('DAL or createUserSession method not available');
                }

                // Log successful login via DAL
                try {
                    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
                    const userAgent = req.headers['user-agent'] || 'unknown';
                    await dal.logActivity({
                        user_id: result.user.id,
                        action: 'login',
                        resource_type: 'LOGIN',
                        resource_id: result.user.username,
                        details: { username: result.user.username, ip: clientIp },
                        ip_address: clientIp,
                        user_agent: userAgent
                    });
                } catch (activityErr) {
                    loggers?.system?.warn('Login activity log failed:', activityErr.message);
                }

                res.json({
                    success: true,
                    token,
                    user: result.user,
                    session: {
                        expiresAt,
                        createdAt: moment.utc().format('YYYY-MM-DD HH:mm:ss')
                    }
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
            // Extract token (same logic pattern as auth middleware)
            let token = null;
            if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
                token = req.headers.authorization.substring(7);
            } else if (req.cookies && req.cookies.token) {
                token = req.cookies.token;
            }

            // Deactivate session if we can
            if (token && dal?.deactivateSession) {
                try {
                    await dal.deactivateSession(token);
                } catch (deactErr) {
                    loggers?.system?.warn('Failed to deactivate session:', deactErr.message);
                }
            }

            if (req.user) {
                try {
                    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
                    const userAgent = req.headers['user-agent'] || 'unknown';
                    await dal.logActivity({
                        user_id: req.user.id,
                        action: 'logout',
                        resource_type: 'LOGOUT',
                        resource_id: req.user.username,
                        details: { username: req.user.username, ip: clientIp },
                        ip_address: clientIp,
                        user_agent: userAgent
                    });
                } catch (activityErr) {
                    loggers?.system?.warn('Logout activity log failed:', activityErr.message);
                }
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