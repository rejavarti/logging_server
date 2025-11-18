const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const moment = require('moment');

class UserManager {
    constructor(config, loggers, dal) {
        this.config = config;
        this.loggers = loggers;
        this.dal = dal;
        this.jwtSecret = config.auth.jwtSecret;
        this.initializeDefaultAdmin();
    }

    async initializeDefaultAdmin() {
        try {
            // Check if admin user exists using DAL (now handles both active/is_active columns)
            let adminUser;
            try {
                adminUser = await this.dal.getUserByUsername('admin');
                this.loggers.system.info('✅ Admin user lookup successful');
            } catch (error) {
                if (error.message.includes('no such column')) {
                    this.loggers.system.warn('Database schema migration detected, retrying admin user check in 2 seconds...');
                    // Wait briefly for schema to settle, then retry once
                    setTimeout(async () => {
                        try {
                            adminUser = await this.dal.getUserByUsername('admin');
                            if (adminUser) {
                                this.loggers.system.info('✅ Admin user found after schema migration');
                            }
                        } catch (retryError) {
                            this.loggers.system.error('Admin user check failed after retry:', retryError.message);
                        }
                    }, 2000);
                    return; // Skip immediate admin creation, let retry handle it
                }
                throw error;
            }
            
            if (adminUser && adminUser.role !== 'admin') {
                try {
                    await this.dal.updateUser(adminUser.id, { role: 'admin' });
                    this.loggers.system.warn('Corrected existing admin user role to admin');
                } catch (e) {
                    this.loggers.system.error('Failed to correct admin role:', e.message);
                }
            }

            if (!adminUser) {
                // Create default admin user using DAL
                const defaultPassword = process.env.AUTH_PASSWORD;
                if (!defaultPassword) {
                    console.error('\n🚨 CRITICAL: No AUTH_PASSWORD environment variable set!');
                    console.error('🔧 SETUP REQUIRED: Run one of these commands:');
                    console.error('   • Set environment: $env:AUTH_PASSWORD="YourSecurePassword123!"');
                    console.error('   • Interactive setup: node scripts/setup.js');
                    console.error('   • Docker setup: -e AUTH_PASSWORD=YourSecurePassword123!');
                    console.error('\n⚠️  System will NOT start without proper authentication setup.\n');
                    process.exit(1);
                }
                const passwordHash = await bcrypt.hash(defaultPassword, this.config.auth.saltRounds);
                
                const newAdmin = await this.dal.createUser({
                    username: 'admin',
                    email: 'admin@enterprise.local',
                    password_hash: passwordHash,
                    role: 'admin'
                });
                
                if (newAdmin) {
                    this.loggers.system.info('✅ Default admin user created', {
                        username: 'admin',
                        password: defaultPassword
                    });
                    console.log(`\n🔐 Default Admin Created:`);
                    console.log(`   Username: admin`);
                    console.log(`   Password: ${defaultPassword}`);
                    console.log(`   Please change this password after first login!\n`);
                } else {
                    this.loggers.system.error('Failed to create default admin user');
                }
            }
        } catch (error) {
            this.loggers.system.error('Error initializing default admin:', error);
        }
    }

    async authenticateUser(username, password) {
        try {
            // Get user using DAL
            const user = await this.dal.getUserByUsername(username);
            
            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (validPassword) {
                // Update last login using DAL
                const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
                await this.dal.updateUser(user.id, { last_login: utcNow });
                
                return {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                };
            } else {
                return { success: false, error: 'Invalid credentials' };
            }
        } catch (error) {
            this.loggers.system.error('Authentication error:', error);
            return { success: false, error: 'Authentication failed' };
        }
    }

    generateJWT(user) {
        return jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            this.jwtSecret,
            { expiresIn: '24h' }
        );
    }

    verifyJWT(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            return null;
        }
    }

    async createUser(userData) {
        try {
            // Hash password
            const passwordHash = await bcrypt.hash(userData.password, this.config.auth.saltRounds);
            
            // Create user via DAL
            const newUser = await this.dal.createUser({
                username: userData.username,
                email: userData.email,
                password_hash: passwordHash,
                role: userData.role || 'user'
            });
            
            return newUser;
        } catch (error) {
            this.loggers.system.error('Error creating user:', error);
            throw error;
        }
    }

    async updateUser(userId, updates) {
        try {
            // If password is being updated, hash it
            if (updates.password) {
                updates.password_hash = await bcrypt.hash(updates.password, this.config.auth.saltRounds);
                delete updates.password; // Remove plain text password
            }
            
            return await this.dal.updateUser(userId, updates);
        } catch (error) {
            this.loggers.system.error('Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(userId) {
        try {
            return await this.dal.deleteUser(userId);
        } catch (error) {
            this.loggers.system.error('Error deleting user:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            return await this.dal.getAllUsers();
        } catch (error) {
            this.loggers.system.error('Error getting all users:', error);
            throw error;
        }
    }

    async getUserById(userId) {
        try {
            return await this.dal.getUserById(userId);
        } catch (error) {
            this.loggers.system.error('Error getting user by ID:', error);
            throw error;
        }
    }

    async getUserByUsername(username) {
        try {
            return await this.dal.getUserByUsername(username);
        } catch (error) {
            this.loggers.system.error('Error getting user by username:', error);
            throw error;
        }
    }

    async createSession(userId, sessionData) {
        try {
            return await this.dal.createSession(userId, sessionData);
        } catch (error) {
            this.loggers.system.error('Error creating session:', error);
            throw error;
        }
    }

    async validateSession(sessionToken) {
        try {
            return await this.dal.getActiveSession(sessionToken);
        } catch (error) {
            this.loggers.system.error('Error validating session:', error);
            throw error;
        }
    }

    async invalidateSession(sessionToken) {
        try {
            return await this.dal.invalidateSession(sessionToken);
        } catch (error) {
            this.loggers.system.error('Error invalidating session:', error);
            throw error;
        }
    }

    async cleanExpiredSessions() {
        try {
            return await this.dal.cleanExpiredSessions();
        } catch (error) {
            this.loggers.system.error('Error cleaning expired sessions:', error);
            throw error;
        }
    }

    // Password reset functionality
    async generatePasswordResetToken(email) {
        try {
            const user = await this.dal.getUserByEmail(email);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const resetToken = require('crypto').randomBytes(32).toString('hex');
            const resetExpires = moment().add(1, 'hour').utc().format('YYYY-MM-DD HH:mm:ss');
            
            await this.dal.updateUser(user.id, {
                reset_token: resetToken,
                reset_expires: resetExpires
            });
            
            return { success: true, resetToken, user };
        } catch (error) {
            this.loggers.system.error('Error generating password reset token:', error);
            return { success: false, error: 'Failed to generate reset token' };
        }
    }

    async resetPassword(resetToken, newPassword) {
        try {
            const user = await this.dal.getUserByResetToken(resetToken);
            
            if (!user || moment().utc().isAfter(moment(user.reset_expires))) {
                return { success: false, error: 'Invalid or expired reset token' };
            }

            const passwordHash = await bcrypt.hash(newPassword, this.config.auth.saltRounds);
            
            await this.dal.updateUser(user.id, {
                password_hash: passwordHash,
                reset_token: null,
                reset_expires: null
            });
            
            return { success: true };
        } catch (error) {
            this.loggers.system.error('Error resetting password:', error);
            return { success: false, error: 'Failed to reset password' };
        }
    }

    // Activity logging
    async logActivity(userId, action, resourceType, resourceId, details, ipAddress, userAgent) {
        try {
            return await this.dal.logActivity({
                user_id: userId,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                details,
                ip_address: ipAddress,
                user_agent: userAgent
            });
        } catch (error) {
            this.loggers.system.error('Error logging activity:', error);
            throw error;
        }
    }

    async getUserActivity(userId, limit = 50, offset = 0) {
        try {
            return await this.dal.getUserActivity(userId, limit, offset);
        } catch (error) {
            this.loggers.system.error('Error getting user activity:', error);
            throw error;
        }
    }
}

module.exports = UserManager;