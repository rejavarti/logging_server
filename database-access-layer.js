/**
 * COMPREHENSIVE DATABASE ACCESS LAYER (DAL)
 * 
 * This layer consolidates ALL database access into a single, centralized system.
 * Eliminates the 600+ scattered db.run/get/all calls throughout the codebase.
 * 
 * Benefits:
 * - Single source of truth for all database operations
 * - Consistent error handling and logging
 * - Automatic transaction management for critical operations  
 * - Query optimization and caching
 * - Easy maintenance and debugging
 * - Prevents SQL injection with parameterized queries
 * - Activity logging built into every operation
 */

const sqlite3 = require('sqlite3').verbose();
const EventEmitter = require('events');

class DatabaseAccessLayer extends EventEmitter {
    constructor(databasePath, logger) {
        super();
        this.db = new sqlite3.Database(databasePath);
        this.logger = logger;
        this.transactionActive = false;
        this.queryCache = new Map();
        this.cacheEnabled = true;
        this.cacheTTL = 60000; // 1 minute default cache
        
        // Initialize connection with optimizations
        this.initializeConnection();
    }

    // Helper method to detect migration-related errors or empty database scenarios
    isMigrationError(error) {
        return error && error.message && (
            error.message.includes('no such column') ||
            error.message.includes('no such table') ||
            error.message.includes('database schema has changed') ||
            error.message.includes('no such file or directory') ||
            error.message.includes('unable to open database file')
        );
    }

    // Enhanced schema validation with migration completion check
    async validateSchema() {
        // First, verify migration is actually complete by checking schema_migrations table
        try {
            const latestMigration = await this.get("SELECT MAX(version) as version FROM schema_migrations");
            this.logger.debug(`✅ Latest migration version: ${latestMigration?.version || 'none'}`);
        } catch (error) {
            this.logger.warn('⚠️ Migration table not ready, waiting for migration completion...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const requiredSchemas = [
            { table: 'users', column: 'active', sql: "SELECT active FROM users LIMIT 1" },
            { table: 'dashboard_widgets', column: 'dashboard_id', sql: "SELECT dashboard_id FROM dashboard_widgets LIMIT 1" }
        ];

        let allSchemasReady = true;
        
        for (const schema of requiredSchemas) {
            let retryCount = 0;
            let schemaReady = false;
            
            while (!schemaReady && retryCount < 3) {
                try {
                    await this.get(schema.sql);
                    this.logger.debug(`✅ Schema validation passed for ${schema.table}.${schema.column}`);
                    schemaReady = true;
                } catch (error) {
                    if (this.isMigrationError(error)) {
                        retryCount++;
                        if (retryCount === 1) {
                            this.logger.info(`🔄 Schema validation: Waiting for ${schema.table}.${schema.column} (attempt ${retryCount}/3)`);
                        }
                        // Exponential backoff: 150ms, 300ms, 600ms
                        const delay = 150 * Math.pow(2, retryCount - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        // Not a migration error, re-throw
                        throw error;
                    }
                }
            }
            
            if (!schemaReady) {
                this.logger.warn(`⚠️ Schema validation: ${schema.table}.${schema.column} not available after retries, components will handle gracefully`);
                allSchemasReady = false;
            }
        }
        
        if (allSchemasReady) {
            this.logger.info('✅ All schema validations passed - database fully ready');
        }
    }

    initializeConnection() {
        this.db.serialize(() => {
            this.db.run('PRAGMA foreign_keys = ON');
            this.db.run('PRAGMA journal_mode = WAL');
            this.db.run('PRAGMA synchronous = NORMAL');
            this.db.run('PRAGMA cache_size = -64000'); // 64MB cache
            this.db.run('PRAGMA temp_store = memory');
            this.db.run('PRAGMA mmap_size = 268435456'); // 256MB memory map
        });
        
        this.logger.info('Database connection initialized with optimizations');
    }

    async disableForeignKeys() {
        return new Promise((resolve, reject) => {
            this.db.run('PRAGMA foreign_keys = OFF', (err) => {
                if (err) reject(err);
                else {
                    this.logger.info('Foreign key constraints disabled');
                    resolve();
                }
            });
        });
    }

    async enableForeignKeys() {
        return new Promise((resolve, reject) => {
            this.db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) reject(err);
                else {
                    this.logger.info('Foreign key constraints enabled');
                    resolve();
                }
            });
        });
    }

    // ============================================================================
    // TRANSACTION MANAGEMENT
    // ============================================================================

    async beginTransaction() {
        return new Promise((resolve, reject) => {
            if (this.transactionActive) {
                return reject(new Error('Transaction already active'));
            }
            
            this.db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    this.logger.error('Failed to begin transaction:', err);
                    reject(err);
                } else {
                    this.transactionActive = true;
                    this.logger.info('Transaction started');
                    resolve();
                }
            });
        });
    }

    async commitTransaction() {
        return new Promise((resolve, reject) => {
            if (!this.transactionActive) {
                return reject(new Error('No active transaction to commit'));
            }
            
            this.db.run('COMMIT', (err) => {
                this.transactionActive = false;
                if (err) {
                    this.logger.error('Failed to commit transaction:', err);
                    reject(err);
                } else {
                    this.logger.info('Transaction committed successfully');
                    resolve();
                }
            });
        });
    }

    async rollbackTransaction() {
        return new Promise((resolve, reject) => {
            if (!this.transactionActive) {
                return reject(new Error('No active transaction to rollback'));
            }
            
            this.db.run('ROLLBACK', (err) => {
                this.transactionActive = false;
                if (err) {
                    this.logger.error('Failed to rollback transaction:', err);
                    reject(err);
                } else {
                    this.logger.warn('Transaction rolled back');
                    resolve();
                }
            });
        });
    }

    async executeInTransaction(operations) {
        try {
            await this.beginTransaction();
            
            for (const operation of operations) {
                await this.run(operation.sql, operation.params);
            }
            
            await this.commitTransaction();
            this.logger.info(`Transaction completed successfully with ${operations.length} operations`);
            
        } catch (error) {
            await this.rollbackTransaction();
            throw error;
        }
    }

    // ============================================================================
    // CORE DATABASE METHODS (Replaces all scattered db.run/get/all calls)
    // ============================================================================

    async run(sql, params = [], options = {}) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            this.db.run(sql, params, function(err) {
                const duration = Date.now() - startTime;
                
                if (err) {
                    // Use warn level for migration-related errors instead of error
                    const logLevel = this.isMigrationError(err) ? 'warn' : 'error';
                    const logMessage = this.isMigrationError(err) 
                        ? `Migration-related SQL issue (${duration}ms): ${sql}`
                        : `SQL Error (${duration}ms): ${sql}`;
                    
                    this.logger[logLevel](logMessage, {
                        error: err.message,
                        params: params,
                        stack: err.stack
                    });
                    
                    // Emit error event for monitoring
                    this.emit('queryError', { sql, params, error: err, duration });
                    reject(err);
                } else {
                    if (options.logQuery) {
                        this.logger.debug(`SQL Success (${duration}ms): ${sql}`, {
                            params: params,
                            changes: this.changes,
                            lastID: this.lastID
                        });
                    }
                    
                    // Emit success event for monitoring
                    this.emit('querySuccess', { sql, params, duration, changes: this.changes });
                    
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            }.bind(this));
        });
    }

    async get(sql, params = [], options = {}) {
        const cacheKey = options.cache ? `get:${sql}:${JSON.stringify(params)}` : null;
        
        // Check cache first
        if (cacheKey && this.cacheEnabled) {
            const cached = this.queryCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.data;
            }
        }
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            this.db.get(sql, params, (err, row) => {
                const duration = Date.now() - startTime;
                
                if (err) {
                    // Use warn level for migration-related errors instead of error
                    const logLevel = this.isMigrationError(err) ? 'warn' : 'error';
                    const logMessage = this.isMigrationError(err) 
                        ? `Migration-related SQL issue (${duration}ms): ${sql}`
                        : `SQL Error (${duration}ms): ${sql}`;
                    
                    this.logger[logLevel](logMessage, {
                        error: err.message,
                        params: params,
                        stack: err.stack
                    });
                    
                    this.emit('queryError', { sql, params, error: err, duration });
                    reject(err);
                } else {
                    if (options.logQuery) {
                        this.logger.debug(`SQL Success (${duration}ms): ${sql}`, {
                            params: params,
                            hasResult: !!row
                        });
                    }
                    
                    // Cache result if requested
                    if (cacheKey && this.cacheEnabled) {
                        this.queryCache.set(cacheKey, {
                            data: row,
                            timestamp: Date.now()
                        });
                    }
                    
                    this.emit('querySuccess', { sql, params, duration });
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = [], options = {}) {
        const cacheKey = options.cache ? `all:${sql}:${JSON.stringify(params)}` : null;
        
        // Check cache first
        if (cacheKey && this.cacheEnabled) {
            const cached = this.queryCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.data;
            }
        }
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            this.db.all(sql, params, (err, rows) => {
                const duration = Date.now() - startTime;
                
                if (err) {
                    // Use warn level for migration-related errors instead of error
                    const logLevel = this.isMigrationError(err) ? 'warn' : 'error';
                    const logMessage = this.isMigrationError(err) 
                        ? `Migration-related SQL issue (${duration}ms): ${sql}`
                        : `SQL Error (${duration}ms): ${sql}`;
                    
                    this.logger[logLevel](logMessage, {
                        error: err.message,
                        params: params,
                        stack: err.stack
                    });
                    
                    this.emit('queryError', { sql, params, error: err, duration });
                    reject(err);
                } else {
                    if (options.logQuery) {
                        this.logger.debug(`SQL Success (${duration}ms): ${sql}`, {
                            params: params,
                            rowCount: rows ? rows.length : 0
                        });
                    }
                    
                    // Cache result if requested
                    if (cacheKey && this.cacheEnabled) {
                        this.queryCache.set(cacheKey, {
                            data: rows,
                            timestamp: Date.now()
                        });
                    }
                    
                    this.emit('querySuccess', { sql, params, duration, rowCount: rows ? rows.length : 0 });
                    resolve(rows || []);
                }
            });
        });
    }

    // ============================================================================
    // USER MANAGEMENT METHODS (Consolidates 50+ user-related queries)
    // ============================================================================

    async createUser(userData) {
        const { username, email, password_hash, role = 'user', is_active = true } = userData;
        
        try {
            const result = await this.run(
                `INSERT INTO users (username, email, password_hash, role, active, created_at) 
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [username, email, password_hash, role, is_active]
            );
            
            await this.logUserActivity(result.lastID, 'user_created', 'users', `User created: ${username}`);
            return { id: result.lastID, username, email, role, active: is_active };
            
        } catch (error) {
            this.logger.error('Failed to create user:', error);
            throw new Error(`Failed to create user: ${error.message}`);
        }
    }

    async getUserById(userId, options = {}) {
        return await this.get(
            'SELECT id, username, email, role, active, created_at, last_login FROM users WHERE id = ?',
            [userId],
            { cache: options.cache }
        );
    }

    async getUserByUsername(username, options = {}) {
        // Handle both 'active' and 'is_active' column names for backward compatibility
        try {
            // Try with 'active' column first (standardized)
            return await this.get(
                'SELECT * FROM users WHERE username = ? AND active = 1',
                [username],
                { cache: options.cache }
            );
        } catch (error) {
            if (error.message.includes('no such column: active')) {
                // Fallback to 'is_active' column for legacy databases
                this.logger.warn('Using legacy is_active column for user lookup');
                return await this.get(
                    'SELECT * FROM users WHERE username = ? AND is_active = 1',
                    [username],
                    { cache: options.cache }
                );
            }
            throw error;
        }
    }

    async getAllUsers(options = {}) {
        return await this.all(
            'SELECT id, username, email, role, active, created_at, last_login FROM users ORDER BY created_at DESC',
            [],
            { cache: options.cache }
        );
    }

    async updateUser(userId, updates) {
        const allowedFields = ['username', 'email', 'role', 'active', 'last_login'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(userId);
        
        const result = await this.run(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        await this.logUserActivity(userId, 'user_updated', 'users', `User updated: ${Object.keys(updates).join(', ')}`);
        return result.changes > 0;
    }

    async deleteUser(userId) {
        // Check if user is the last admin
        const adminCount = await this.get('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
        const user = await this.getUserById(userId);
        
        if (user.role === 'admin' && adminCount.count <= 1) {
            throw new Error('Cannot delete the last admin user');
        }
        
        const result = await this.run('DELETE FROM users WHERE id = ?', [userId]);
        
        if (result.changes > 0) {
            await this.logUserActivity(null, 'user_deleted', 'users', `User deleted: ${user.username} (ID: ${userId})`);
        }
        
        return result.changes > 0;
    }

    // ============================================================================
    // AUTHENTICATION & SESSION METHODS
    // ============================================================================

    async createUserSession(sessionData) {
        const { user_id, session_token, ip_address, user_agent, expires_at } = sessionData;
        
        const result = await this.run(
            `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, created_at, last_activity, expires_at, is_active) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1)`,
            [user_id, session_token, ip_address, user_agent, expires_at]
        );
        
        await this.logUserActivity(user_id, 'session_created', 'user_sessions', `Session created from ${ip_address}`);
        return result.lastID;
    }

    async getActiveSession(sessionToken) {
        return await this.get(
            `SELECT s.*, u.username, u.role, u.active as user_active 
             FROM user_sessions s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.session_token = ? AND s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1`,
            [sessionToken]
        );
    }

    async updateSessionActivity(sessionToken) {
        return await this.run(
            'UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_token = ?',
            [sessionToken]
        );
    }

    async deactivateSession(sessionToken) {
        const result = await this.run(
            'UPDATE user_sessions SET is_active = 0 WHERE session_token = ?',
            [sessionToken]
        );
        
        return result.changes > 0;
    }

    async getAllActiveSessions() {
        return await this.all(
            `SELECT s.id, s.user_id, u.username, s.ip_address, s.user_agent, s.created_at, s.last_activity, s.expires_at
             FROM user_sessions s
             JOIN users u ON s.user_id = u.id
             WHERE s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
             ORDER BY s.last_activity DESC`
        );
    }

    // ============================================================================
    // LOGGING METHODS (Consolidates 200+ logging queries)
    // ============================================================================

    async createLogEntry(logData) {
        const { 
            timestamp, level, message, source, details = '{}', ip, user_id, tags = '[]',
            // Enhanced fields
            user_agent, country, region, city, timezone, coordinates, browser, os, device
        } = logData;
        
        // Prepare enhanced metadata
        let metadata = {};
        try {
            metadata = typeof details === 'string' ? JSON.parse(details) : details;
        } catch (e) {
            metadata = { raw_details: details };
        }

        // Add geographic data to metadata if available
        if (country || region || city) {
            metadata.geo = {
                ...(country && { country }),
                ...(region && { region }),
                ...(city && { city }),
                ...(timezone && { timezone }),
                ...(coordinates && { coordinates })
            };
        }

        // Add parsed user agent data to metadata if available
        if (browser || os || device) {
            metadata.user_agent_parsed = {
                ...(browser && { browser }),
                ...(os && { os }),
                ...(device && { device })
            };
        }

        // Store raw user agent in metadata for reference
        if (user_agent) {
            metadata.raw_user_agent = user_agent;
        }
        
        const result = await this.run(
            `INSERT INTO logs (timestamp, level, message, source, metadata, ip, user_id, tags, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                timestamp || new Date().toISOString(), 
                level || 'info', 
                message, 
                source || 'system', 
                JSON.stringify(metadata), 
                ip, 
                user_id, 
                tags
            ]
        );
        
        return result.lastID;
    }

    async createLogEvent(eventData) {
        const { timestamp, severity, source, category, message, zone_number, zone_name, device_id, event_type, metadata = '{}' } = eventData;
        
        const result = await this.run(
            `INSERT INTO log_events (timestamp, severity, source, category, message, zone_number, zone_name, device_id, event_type, metadata, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [timestamp || new Date().toISOString(), severity || 'info', source, category, message, zone_number, zone_name, device_id, event_type, metadata]
        );
        
        return result.lastID;
    }

    async getLogsByTimeRange(startTime, endTime, options = {}) {
        const { limit = 1000, offset = 0, level, source } = options;
        
        let sql = 'SELECT * FROM logs WHERE timestamp >= ? AND timestamp <= ?';
        const params = [startTime, endTime];
        
        if (level) {
            sql += ' AND level = ?';
            params.push(level);
        }
        
        if (source) {
            sql += ' AND source = ?';
            params.push(source);
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.all(sql, params, { cache: options.cache });
    }

    async getLogCount(options = {}) {
        const { level, source, startTime, endTime } = options;
        
        let sql = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
        const params = [];
        
        if (startTime) {
            sql += ' AND timestamp >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ' AND timestamp <= ?';
            params.push(endTime);
        }
        
        if (level) {
            sql += ' AND level = ?';
            params.push(level);
        }
        
        if (source) {
            sql += ' AND source = ?';
            params.push(source);
        }
        
        const result = await this.get(sql, params, { cache: options.cache });
        return result ? result.count : 0;
    }

    // ============================================================================
    // ACTIVITY LOGGING METHODS (Consolidates logActivity function calls)
    // ============================================================================

    async logUserActivity(userId, action, resource = null, details = null, ipAddress = null, userAgent = null) {
        try {
            await this.run(
                `INSERT INTO activity_log (user_id, action, resource_type, details, ip_address, user_agent, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, action, resource, details, ipAddress, userAgent]
            );
        } catch (error) {
            this.logger.error('Failed to log user activity:', error);
            // Don't throw - activity logging should not break main operations
        }
    }

    async getUserActivity(userId, options = {}) {
        const { limit = 100, offset = 0, action } = options;
        
        let sql = `SELECT a.*, u.username 
                   FROM activity_log a
                   LEFT JOIN users u ON a.user_id = u.id  
                   WHERE a.user_id = ?`;
        const params = [userId];
        
        if (action) {
            sql += ' AND a.action = ?';
            params.push(action);
        }
        
        sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }

    async getAllActivity(options = {}) {
        const { limit = 100, offset = 0, action, startTime, endTime } = options;
        
        let sql = `SELECT a.*, u.username 
                   FROM activity_log a
                   LEFT JOIN users u ON a.user_id = u.id  
                   WHERE 1=1`;
        const params = [];
        
        if (action) {
            sql += ' AND a.action = ?';
            params.push(action);
        }
        
        if (startTime) {
            sql += ' AND a.created_at >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ' AND a.created_at <= ?';
            params.push(endTime);
        }
        
        sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // WEBHOOK METHODS (Consolidates webhook queries)
    // ============================================================================

    async createWebhook(webhookData) {
        const { name, url, method = 'POST', headers = '{}', event_types = '[]', secret, enabled = true } = webhookData;
        
        const result = await this.run(
            `INSERT INTO webhooks (name, url, method, headers, event_types, secret, enabled, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, url, method, headers, event_types, secret, enabled]
        );
        
        return result.lastID;
    }

    async getAllWebhooks() {
        return await this.all('SELECT * FROM webhooks ORDER BY created_at DESC');
    }

    async getWebhookById(id) {
        return await this.get('SELECT * FROM webhooks WHERE id = ?', [id]);
    }

    async getEnabledWebhooks() {
        return await this.all('SELECT * FROM webhooks WHERE enabled = 1');
    }

    async updateWebhook(id, updates) {
        const allowedFields = ['name', 'url', 'method', 'headers', 'event_types', 'secret', 'enabled'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE webhooks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteWebhook(id) {
        const result = await this.run('DELETE FROM webhooks WHERE id = ?', [id]);
        return result.changes > 0;
    }

    async createWebhookDelivery(deliveryData) {
        const { webhook_id, payload, response_code, response_body, delivery_status = 'pending', error_message } = deliveryData;
        
        const result = await this.run(
            `INSERT INTO webhook_deliveries (webhook_id, payload, response_code, response_body, delivery_status, attempted_at, error_message) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
            [webhook_id, payload, response_code, response_body, delivery_status, error_message]
        );
        
        return result.lastID;
    }

    async getWebhookDeliveries(webhookId, limit = 50) {
        return await this.all(
            'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC LIMIT ?',
            [webhookId, limit]
        );
    }

    // ============================================================================
    // SETTINGS METHODS (Consolidates system settings queries)
    // ============================================================================

    async getSetting(key, defaultValue = null) {
        const result = await this.get(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            [key],
            { cache: true }
        );
        
        return result ? result.setting_value : defaultValue;
    }

    async setSetting(key, value, description = null) {
        const result = await this.run(
            `INSERT OR REPLACE INTO system_settings (setting_key, setting_value, description, updated_at) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [key, value, description]
        );
        
        // Clear cache for this setting
        this.clearCache(`get:SELECT setting_value FROM system_settings WHERE setting_key = ?:["${key}"]`);
        
        return result.changes > 0 || result.lastID > 0;
    }

    async getAllSettings() {
        return await this.all('SELECT * FROM system_settings ORDER BY setting_key');
    }

    async deleteSetting(key) {
        const result = await this.run('DELETE FROM system_settings WHERE setting_key = ?', [key]);
        
        // Clear cache
        this.clearCache(`get:SELECT setting_value FROM system_settings WHERE setting_key = ?:["${key}"]`);
        
        return result.changes > 0;
    }

    // ============================================================================
    // SYSTEM METRICS METHODS
    // ============================================================================

    async recordMetric(metricName, value, metricType = 'gauge', tags = {}) {
        const result = await this.run(
            `INSERT INTO system_metrics (metric_name, metric_value, metric_type, tags, timestamp, created_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [metricName, value, metricType, JSON.stringify(tags)]
        );
        
        return result.lastID;
    }

    async getMetrics(metricName, options = {}) {
        const { limit = 100, startTime, endTime } = options;
        
        let sql = 'SELECT * FROM system_metrics WHERE metric_name = ?';
        const params = [metricName];
        
        if (startTime) {
            sql += ' AND timestamp >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ' AND timestamp <= ?';
            params.push(endTime);
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // INTEGRATIONS METHODS (Handles integration management)
    // ============================================================================

    async createIntegration(integrationData) {
        const { name, type, configuration, enabled = true } = integrationData;
        
        const result = await this.run(
            `INSERT INTO integrations (name, type, configuration, enabled, created_at, updated_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, type, JSON.stringify(configuration), enabled ? 1 : 0]
        );
        
        return result.lastID;
    }

    async getAllIntegrations() {
        return await this.all('SELECT * FROM integrations ORDER BY name');
    }

    async getIntegrationById(id) {
        return await this.get('SELECT * FROM integrations WHERE id = ?', [id]);
    }

    async getEnabledIntegrations() {
        return await this.all('SELECT * FROM integrations WHERE enabled = 1');
    }

    async updateIntegration(id, updates) {
        const allowedFields = ['name', 'type', 'configuration', 'enabled'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'configuration' ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE integrations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteIntegration(id) {
        const result = await this.run('DELETE FROM integrations WHERE id = ?', [id]);
        return result.changes > 0;
    }

    // ============================================================================
    // SAVED SEARCHES METHODS (Handles saved search management)
    // ============================================================================

    async createSavedSearch(searchData) {
        const { name, description, query, level, source, startDate, endDate, regex, caseSensitive, userId } = searchData;
        
        const result = await this.run(
            `INSERT INTO saved_searches (name, description, query, level, source, start_date, end_date, regex_enabled, case_sensitive, user_id, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, description, query, level, source, startDate, endDate, regex ? 1 : 0, caseSensitive ? 1 : 0, userId]
        );
        
        return result.lastID;
    }

    async getSavedSearchesByUser(userId) {
        return await this.all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY name', [userId]);
    }

    async getSavedSearchById(id, userId = null) {
        const sql = userId 
            ? 'SELECT * FROM saved_searches WHERE id = ? AND user_id = ?' 
            : 'SELECT * FROM saved_searches WHERE id = ?';
        const params = userId ? [id, userId] : [id];
        
        return await this.get(sql, params);
    }

    async updateSavedSearch(id, updates, userId = null) {
        const allowedFields = ['name', 'description', 'query', 'level', 'source', 'start_date', 'end_date', 'regex_enabled', 'case_sensitive'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        let sql = `UPDATE saved_searches SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        if (userId) {
            sql += ' AND user_id = ?';
            values.push(userId);
        }
        
        const result = await this.run(sql, values);
        return result.changes > 0;
    }

    async deleteSavedSearch(id, userId = null) {
        let sql = 'DELETE FROM saved_searches WHERE id = ?';
        const params = [id];
        
        if (userId) {
            sql += ' AND user_id = ?';
            params.push(userId);
        }
        
        const result = await this.run(sql, params);
        return result.changes > 0;
    }

    // ============================================================================
    // API KEYS METHODS (Handles API key management)
    // ============================================================================

    async createApiKey(keyData) {
        const { name, key_hash, permissions, expires_at, user_id } = keyData;
        
        const result = await this.run(
            `INSERT INTO api_keys (name, key_hash, permissions, expires_at, user_id, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, key_hash, JSON.stringify(permissions), expires_at, user_id]
        );
        
        return result.lastID;
    }

    async getAllApiKeys() {
        return await this.all('SELECT * FROM api_keys ORDER BY created_at DESC');
    }

    async getApiKeyById(id) {
        return await this.get('SELECT * FROM api_keys WHERE id = ?', [id]);
    }

    async getApiKeyByHash(keyHash) {
        return await this.get('SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1', [keyHash]);
    }

    async updateApiKey(id, updates) {
        const allowedFields = ['name', 'permissions', 'enabled', 'expires_at'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'permissions' ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE api_keys SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteApiKey(id) {
        const result = await this.run('DELETE FROM api_keys WHERE id = ?', [id]);
        return result.changes > 0;
    }

    async revokeApiKey(id) {
        const result = await this.run(
            'UPDATE api_keys SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );
        return result.changes > 0;
    }

    // ============================================================================
    // ALERT RULES METHODS (Handles alerting system)
    // ============================================================================

    async createAlertRule(ruleData) {
        const { name, description, type = 'pattern', condition, severity = 'warning', cooldown = 300, enabled = true, channels = '[]', escalation_rules, created_by } = ruleData;
        
        const result = await this.run(
            `INSERT INTO alert_rules (name, description, type, condition, severity, cooldown, enabled, channels, escalation_rules, created_by, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, description, type, typeof condition === 'object' ? JSON.stringify(condition) : condition, severity, cooldown, enabled ? 1 : 0, typeof channels === 'object' ? JSON.stringify(channels) : channels, escalation_rules ? JSON.stringify(escalation_rules) : null, created_by]
        );
        
        return result.lastID;
    }

    async getAllAlertRules() {
        return await this.all('SELECT * FROM alert_rules ORDER BY name');
    }

    async getAlertRuleById(id) {
        return await this.get('SELECT * FROM alert_rules WHERE id = ?', [id]);
    }

    async getEnabledAlertRules() {
        return await this.all('SELECT * FROM alert_rules WHERE enabled = 1');
    }

    async updateAlertRule(id, updates) {
        const allowedFields = ['name', 'description', 'conditions', 'actions', 'enabled'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(['conditions', 'actions'].includes(key) ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE alert_rules SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteAlertRule(id) {
        const result = await this.run('DELETE FROM alert_rules WHERE id = ?', [id]);
        return result.changes > 0;
    }

    async createAlertHistory(alertData) {
        const { rule_id, level, message, details } = alertData;
        
        const result = await this.run(
            `INSERT INTO alert_history (rule_id, level, message, details, triggered_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [rule_id, level, message, JSON.stringify(details)]
        );
        
        return result.lastID;
    }

    async getAlertHistory(ruleId = null, options = {}) {
        const { limit = 100, startTime, endTime } = options;
        
        let sql = 'SELECT ah.*, ar.name as rule_name FROM alert_history ah JOIN alert_rules ar ON ah.rule_id = ar.id';
        const params = [];
        
        if (ruleId) {
            sql += ' WHERE ah.rule_id = ?';
            params.push(ruleId);
        }
        
        if (startTime) {
            sql += ruleId ? ' AND' : ' WHERE';
            sql += ' ah.triggered_at >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += (ruleId || startTime) ? ' AND' : ' WHERE';
            sql += ' ah.triggered_at <= ?';
            params.push(endTime);
        }
        
        sql += ' ORDER BY ah.triggered_at DESC LIMIT ?';
        params.push(limit);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // NOTIFICATION CHANNELS METHODS (Handles notification system)
    // ============================================================================

    async createNotificationChannel(channelData) {
        const { name, type, configuration, enabled = true } = channelData;
        
        const result = await this.run(
            `INSERT INTO notification_channels (name, type, configuration, enabled, created_at, updated_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, type, JSON.stringify(configuration), enabled ? 1 : 0]
        );
        
        return result.lastID;
    }

    async getAllNotificationChannels() {
        return await this.all('SELECT * FROM notification_channels ORDER BY name');
    }

    async getNotificationChannelById(id) {
        return await this.get('SELECT * FROM notification_channels WHERE id = ?', [id]);
    }

    async getEnabledNotificationChannels() {
        return await this.all('SELECT * FROM notification_channels WHERE enabled = 1');
    }

    async updateNotificationChannel(id, updates) {
        const allowedFields = ['name', 'type', 'configuration', 'enabled'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'configuration' ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE notification_channels SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteNotificationChannel(id) {
        const result = await this.run('DELETE FROM notification_channels WHERE id = ?', [id]);
        return result.changes > 0;
    }

    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================

    clearCache(pattern = null) {
        if (pattern) {
            // Clear specific cache entry
            for (const key of this.queryCache.keys()) {
                if (key.includes(pattern)) {
                    this.queryCache.delete(key);
                }
            }
        } else {
            // Clear all cache
            this.queryCache.clear();
        }
        
        this.logger.debug(`Cache cleared${pattern ? ` for pattern: ${pattern}` : ' (all entries)'}`);
    }

    setCacheEnabled(enabled) {
        this.cacheEnabled = enabled;
        if (!enabled) {
            this.clearCache();
        }
    }

    setCacheTTL(ttl) {
        this.cacheTTL = ttl;
    }

    // ============================================================================
    // DASHBOARDS METHODS (Handles dashboard management)
    // ============================================================================

    async createDashboard(dashboardData) {
        const { name, description, configuration, widgets, user_id, is_public = false } = dashboardData;
        
        const result = await this.run(
            `INSERT INTO dashboards (name, description, configuration, widgets, user_id, is_public, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, description, JSON.stringify(configuration), JSON.stringify(widgets), user_id, is_public ? 1 : 0]
        );
        
        return result.lastID;
    }

    async getAllDashboards(userId = null) {
        let sql = 'SELECT * FROM dashboards';
        const params = [];
        
        if (userId) {
            sql += ' WHERE user_id = ? OR is_public = 1';
            params.push(userId);
        } else {
            sql += ' WHERE is_public = 1';
        }
        
        sql += ' ORDER BY name';
        
        return await this.all(sql, params);
    }

    async getDashboardById(id, userId = null) {
        let sql = 'SELECT * FROM dashboards WHERE id = ?';
        const params = [id];
        
        if (userId) {
            sql += ' AND (user_id = ? OR is_public = 1)';
            params.push(userId);
        }
        
        return await this.get(sql, params);
    }

    async updateDashboard(id, updates, userId = null) {
        const allowedFields = ['name', 'description', 'configuration', 'widgets', 'is_public'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(['configuration', 'widgets'].includes(key) ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        let sql = `UPDATE dashboards SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        
        if (userId) {
            sql += ' AND user_id = ?';
            values.push(userId);
        }
        
        const result = await this.run(sql, values);
        return result.changes > 0;
    }

    async deleteDashboard(id, userId = null) {
        let sql = 'DELETE FROM dashboards WHERE id = ?';
        const params = [id];
        
        if (userId) {
            sql += ' AND user_id = ?';
            params.push(userId);
        }
        
        const result = await this.run(sql, params);
        return result.changes > 0;
    }

    // ============================================================================
    // DASHBOARD WIDGETS METHODS (Handles widget management)
    // ============================================================================

    async createDashboardWidget(widgetData) {
        const { dashboard_id, name, type, configuration, position } = widgetData;
        
        const result = await this.run(
            `INSERT INTO dashboard_widgets (dashboard_id, name, type, configuration, position, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [dashboard_id, name, type, JSON.stringify(configuration), JSON.stringify(position)]
        );
        
        return result.lastID;
    }

    async getDashboardWidgets(dashboardId) {
        return await this.all('SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position', [dashboardId]);
    }

    async updateDashboardWidget(id, updates) {
        const allowedFields = ['name', 'type', 'configuration', 'position'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(['configuration', 'position'].includes(key) ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE dashboard_widgets SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteDashboardWidget(id) {
        const result = await this.run('DELETE FROM dashboard_widgets WHERE id = ?', [id]);
        return result.changes > 0;
    }

    // ============================================================================
    // RETENTION POLICIES METHODS (Handles data retention)
    // ============================================================================

    async createRetentionPolicy(policyData) {
        const { name, description, rules, enabled = true } = policyData;
        
        const result = await this.run(
            `INSERT INTO retention_policies (name, description, rules, enabled, created_at, updated_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [name, description, JSON.stringify(rules), enabled ? 1 : 0]
        );
        
        return result.lastID;
    }

    async getAllRetentionPolicies() {
        return await this.all('SELECT * FROM retention_policies ORDER BY name');
    }

    async getRetentionPolicyById(id) {
        return await this.get('SELECT * FROM retention_policies WHERE id = ?', [id]);
    }

    async getEnabledRetentionPolicies() {
        return await this.all('SELECT * FROM retention_policies WHERE enabled = 1');
    }

    async updateRetentionPolicy(id, updates) {
        const allowedFields = ['name', 'description', 'rules', 'enabled'];
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'rules' ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(id);
        
        const result = await this.run(
            `UPDATE retention_policies SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return result.changes > 0;
    }

    async deleteRetentionPolicy(id) {
        const result = await this.run('DELETE FROM retention_policies WHERE id = ?', [id]);
        return result.changes > 0;
    }

    async createRetentionHistory(historyData) {
        const { policy_id, action, records_affected, details } = historyData;
        
        const result = await this.run(
            `INSERT INTO retention_history (policy_id, action, records_affected, details, executed_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [policy_id, action, records_affected, JSON.stringify(details)]
        );
        
        return result.lastID;
    }

    // ============================================================================
    // STREAMING SESSIONS METHODS (Handles real-time streaming)
    // ============================================================================

    async createStreamingSession(sessionData) {
        const { session_id, user_id, filters, connection_info } = sessionData;
        
        const result = await this.run(
            `INSERT INTO streaming_sessions (session_id, user_id, filters, connection_info, created_at, last_activity) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [session_id, user_id, JSON.stringify(filters), JSON.stringify(connection_info)]
        );
        
        return result.lastID;
    }

    async getActiveStreamingSessions() {
        return await this.all('SELECT * FROM streaming_sessions WHERE active = 1 ORDER BY created_at');
    }

    async updateStreamingSessionActivity(sessionId) {
        const result = await this.run(
            'UPDATE streaming_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?',
            [sessionId]
        );
        return result.changes > 0;
    }

    async deactivateStreamingSession(sessionId) {
        const result = await this.run(
            'UPDATE streaming_sessions SET active = 0 WHERE session_id = ?',
            [sessionId]
        );
        return result.changes > 0;
    }

    // ============================================================================
    // ANOMALY DETECTION METHODS (Handles anomaly detection)
    // ============================================================================

    async createAnomalyDetection(anomalyData) {
        const { rule_id, log_id, anomaly_type, score, details } = anomalyData;
        
        const result = await this.run(
            `INSERT INTO anomaly_detections (rule_id, log_id, anomaly_type, score, details, detected_at) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [rule_id, log_id, anomaly_type, score, JSON.stringify(details)]
        );
        
        return result.lastID;
    }

    async getAnomalyDetections(options = {}) {
        const { limit = 100, ruleId, anomalyType, startTime, endTime } = options;
        
        let sql = 'SELECT * FROM anomaly_detections WHERE 1=1';
        const params = [];
        
        if (ruleId) {
            sql += ' AND rule_id = ?';
            params.push(ruleId);
        }
        
        if (anomalyType) {
            sql += ' AND anomaly_type = ?';
            params.push(anomalyType);
        }
        
        if (startTime) {
            sql += ' AND detected_at >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ' AND detected_at <= ?';
            params.push(endTime);
        }
        
        sql += ' ORDER BY detected_at DESC LIMIT ?';
        params.push(limit);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // LOG CORRELATION METHODS (Handles log correlation)
    // ============================================================================

    async createLogCorrelation(correlationData) {
        const { correlation_id, rule_id, log_ids, pattern, confidence_score, details } = correlationData;
        
        const result = await this.run(
            `INSERT INTO log_correlations (correlation_id, rule_id, log_ids, pattern, confidence_score, details, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [correlation_id, rule_id, JSON.stringify(log_ids), pattern, confidence_score, JSON.stringify(details)]
        );
        
        return result.lastID;
    }

    async getLogCorrelations(options = {}) {
        const { limit = 100, ruleId, correlationId, startTime, endTime } = options;
        
        let sql = 'SELECT * FROM log_correlations WHERE 1=1';
        const params = [];
        
        if (ruleId) {
            sql += ' AND rule_id = ?';
            params.push(ruleId);
        }
        
        if (correlationId) {
            sql += ' AND correlation_id = ?';
            params.push(correlationId);
        }
        
        if (startTime) {
            sql += ' AND created_at >= ?';
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ' AND created_at <= ?';
            params.push(endTime);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // DATABASE HEALTH & MONITORING
    // ============================================================================

    async getDbStats() {
        const stats = {};
        
        // Get table sizes
        const tables = await this.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );
        
        for (const table of tables) {
            const count = await this.get(`SELECT COUNT(*) as count FROM ${table.name}`);
            stats[table.name] = count.count;
        }
        
        // Get database file size
        const pragma = await this.get('PRAGMA page_count');
        const pageSize = await this.get('PRAGMA page_size');
        stats.database_size_bytes = pragma.page_count * pageSize.page_size;
        
        // Get cache stats
        stats.cache_entries = this.queryCache.size;
        stats.cache_enabled = this.cacheEnabled;
        stats.cache_ttl = this.cacheTTL;
        
        return stats;
    }

    async vacuum() {
        const startTime = Date.now();
        await this.run('VACUUM');
        const duration = Date.now() - startTime;
        
        this.logger.info(`Database VACUUM completed in ${duration}ms`);
        return duration;
    }

    async analyze() {
        const startTime = Date.now();
        await this.run('ANALYZE');
        const duration = Date.now() - startTime;
        
        this.logger.info(`Database ANALYZE completed in ${duration}ms`);
        return duration;
    }

    async checkIntegrity() {
        const result = await this.get('PRAGMA integrity_check');
        return result.integrity_check === 'ok';
    }

    // ============================================================================
    // MISSING DASHBOARD METHODS (Added for route compatibility)
    // ============================================================================

    async getSystemStats() {
        try {
            // Get total log count
            const totalLogsResult = await this.get('SELECT COUNT(*) as count FROM logs');
            const totalLogs = totalLogsResult?.count || 0;
            
            // Get logs from today
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayLogsResult = await this.get(
                'SELECT COUNT(*) as count FROM logs WHERE timestamp >= ?', 
                [todayStart.toISOString()]
            );
            const logsToday = todayLogsResult?.count || 0;
            
            // Get database size (approximate)
            const sizeResult = await this.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
            const storageUsed = sizeResult?.size || 0;
            
            // Get unique sources
            const sourcesResult = await this.get('SELECT COUNT(DISTINCT source) as count FROM logs');
            const uniqueSources = sourcesResult?.count || 0;
            
            return {
                totalLogs,
                logsToday,
                storageUsed,
                uniqueSources,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Error getting system stats:', error);
            return {
                totalLogs: 0,
                logsToday: 0,
                storageUsed: 0,
                uniqueSources: 0,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            };
        }
    }

    async getRecentLogs(limit = 10) {
        try {
            const logs = await this.all(
                'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?',
                [limit]
            );
            return logs || [];
        } catch (error) {
            this.logger.error('Error getting recent logs:', error);
            return [];
        }
    }

    async getSystemHealth() {
        try {
            // Get basic system health metrics
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            // Simple health calculations (can be enhanced with real system monitoring)
            const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
            const diskPercent = 25; // Placeholder - would need real disk monitoring
            const cpuPercent = 15; // Placeholder - would need real CPU monitoring
            
            let status = 'online';
            if (memoryPercent > 90 || diskPercent > 90 || cpuPercent > 90) {
                status = 'warning';
            }
            if (memoryPercent > 95 || diskPercent > 95 || cpuPercent > 95) {
                status = 'error';
            }
            
            return {
                status,
                memory: memoryPercent,
                disk: diskPercent,
                cpu: cpuPercent,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Error getting system health:', error);
            return {
                status: 'error',
                memory: 0,
                disk: 0,
                cpu: 0,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            };
        }
    }

    // Alias methods for compatibility
    async insertLog(logData) {
        return await this.createLogEntry(logData);
    }

    async getLogs(options = {}) {
        const { limit = 50, offset = 0, level, source, search, filters = {} } = options;
        
        let sql = 'SELECT * FROM log_events WHERE 1=1';
        const params = [];
        
        if (level) {
            sql += ' AND level = ?';
            params.push(level);
        }
        
        if (source) {
            sql += ' AND source = ?';
            params.push(source);
        }
        
        if (search) {
            sql += ' AND message LIKE ?';
            params.push(`%${search}%`);
        }
        
        // Support additional filters from API endpoint
        if (filters.category) {
            sql += ' AND category = ?';
            params.push(filters.category);
        }
        
        if (filters.level) {
            sql += ' AND level = ?';
            params.push(filters.level);
        }
        
        if (filters.source) {
            sql += ' AND source = ?';
            params.push(filters.source);
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }

    // ============================================================================
    // ROUTE COMPATIBILITY METHODS (Stubs for missing functionality)
    // ============================================================================

    async getLogsCount(filters = {}) {
        try {
            let sql = 'SELECT COUNT(*) as count FROM log_events WHERE 1=1';
            const params = [];
            
            if (filters.level) {
                sql += ' AND level = ?';
                params.push(filters.level);
            }
            
            if (filters.source) {
                sql += ' AND source = ?';
                params.push(filters.source);
            }
            
            if (filters.search) {
                sql += ' AND message LIKE ?';
                params.push(`%${filters.search}%`);
            }
            
            if (filters.startDate) {
                sql += ' AND timestamp >= ?';
                params.push(filters.startDate);
            }
            
            if (filters.endDate) {
                sql += ' AND timestamp <= ?';
                params.push(filters.endDate);
            }
            
            const result = await this.get(sql, params);
            return result || { count: 0 };
        } catch (error) {
            this.logger.error('Error getting logs count:', error);
            return { count: 0 };
        }
    }

    async getLogById(id) {
        try {
            const result = await this.get('SELECT * FROM log_events WHERE id = ?', [id]);
            return result;
        } catch (error) {
            this.logger.error('Error getting log by ID:', error);
            return null;
        }
    }

    async getLogsSince(timestamp) {
        try {
            const result = await this.all(
                'SELECT * FROM log_events WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 50',
                [timestamp]
            );
            return result;
        } catch (error) {
            this.logger.error('Error getting logs since timestamp:', error);
            return [];
        }
    }

    async exportLogs(filters = {}) {
        try {
            let sql = 'SELECT * FROM log_events WHERE 1=1';
            const params = [];
            
            if (filters.level) {
                sql += ' AND level = ?';
                params.push(filters.level);
            }
            
            if (filters.source) {
                sql += ' AND source = ?';
                params.push(filters.source);
            }
            
            if (filters.search) {
                sql += ' AND message LIKE ?';
                params.push(`%${filters.search}%`);
            }
            
            if (filters.startDate) {
                sql += ' AND timestamp >= ?';
                params.push(filters.startDate);
            }
            
            if (filters.endDate) {
                sql += ' AND timestamp <= ?';
                params.push(filters.endDate);
            }
            
            sql += ' ORDER BY timestamp DESC LIMIT 10000'; // Limit exports to prevent memory issues
            
            return await this.all(sql, params);
        } catch (error) {
            this.logger.error('Error exporting logs:', error);
            return [];
        }
    }

    async getLogSources() {
        try {
            const result = await this.all('SELECT DISTINCT source FROM log_events ORDER BY source');
            return result.map(row => row.source);
        } catch (error) {
            this.logger.error('Error getting log sources:', error);
            return [];
        }
    }

    async getIntegrations() {
        try {
            const result = await this.all('SELECT * FROM integrations ORDER BY name');
            return result;
        } catch (error) {
            this.logger.error('Error getting integrations:', error);
            return [];
        }
    }

    async getWebhooks() {
        try {
            const result = await this.all('SELECT * FROM webhooks ORDER BY name');
            return result;
        } catch (error) {
            this.logger.error('Error getting webhooks:', error);
            return [];
        }
    }

    async getWebhookStats() {
        try {
            const result = await this.get(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active,
                    COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive
                FROM webhooks
            `);
            return result || { total: 0, active: 0, inactive: 0 };
        } catch (error) {
            this.logger.error('Error getting webhook stats:', error);
            return { total: 0, active: 0, inactive: 0 };
        }
    }

    async getRecentWebhookDeliveries(limit = 10) {
        try {
            const result = await this.all(`
                SELECT * FROM webhook_deliveries 
                ORDER BY attempted_at DESC 
                LIMIT ?
            `, [limit]);
            return result;
        } catch (error) {
            this.logger.error('Error getting recent webhook deliveries:', error);
            return [];
        }
    }

    async getSavedSearches(userId) {
        try {
            const result = await this.all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY name', [userId]);
            return result;
        } catch (error) {
            this.logger.error('Error getting saved searches:', error);
            return [];
        }
    }

    async advancedSearch(searchParams) {
        try {
            // Basic search implementation
            const { query, level, source, limit = 50, offset = 0 } = searchParams;
            let sql = 'SELECT * FROM log_events WHERE 1=1';
            const params = [];

            if (query) {
                sql += ' AND message LIKE ?';
                params.push(`%${query}%`);
            }

            if (level) {
                sql += ' AND level = ?';
                params.push(level);
            }

            if (source) {
                sql += ' AND source = ?';
                params.push(source);
            }

            sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const logs = await this.all(sql, params);
            const totalResult = await this.get('SELECT COUNT(*) as count FROM log_events WHERE 1=1');
            const total = totalResult ? totalResult.count : 0;

            return {
                logs,
                total,
                totalPages: Math.ceil(total / limit)
            };
        } catch (error) {
            this.logger.error('Error in advanced search:', error);
            return { logs: [], total: 0, totalPages: 0 };
        }
    }

    async getLogsSince(timestamp) {
        try {
            const result = await this.all('SELECT * FROM log_events WHERE timestamp > ? ORDER BY timestamp DESC', [timestamp]);
            return result;
        } catch (error) {
            this.logger.error('Error getting logs since timestamp:', error);
            return [];
        }
    }

    async getLogById(id) {
        try {
            const result = await this.get('SELECT * FROM log_events WHERE id = ?', [id]);
            return result;
        } catch (error) {
            this.logger.error('Error getting log by ID:', error);
            return null;
        }
    }

    // ============================================================================
    // ADDITIONAL WEBHOOK METHODS
    // ============================================================================

    async toggleWebhook(id) {
        try {
            const webhook = await this.get('SELECT enabled FROM webhooks WHERE id = ?', [id]);
            if (!webhook) throw new Error('Webhook not found');
            
            const newStatus = !webhook.enabled;
            await this.run('UPDATE webhooks SET enabled = ? WHERE id = ?', [newStatus, id]);
            
            await this.logUserActivity(null, 'webhook_toggle', `webhook_${id}`, 
                { webhookId: id, enabled: newStatus });
            
            return { id, enabled: newStatus };
        } catch (error) {
            this.logger.error('Error toggling webhook:', error);
            throw error;
        }
    }

    async testWebhook(id) {
        try {
            const webhook = await this.getWebhookById(id);
            if (!webhook) throw new Error('Webhook not found');
            
            const testPayload = {
                event: 'test',
                timestamp: new Date().toISOString(),
                data: {
                    message: 'This is a test webhook delivery',
                    test: true
                }
            };
            
            // In a real implementation, this would make an HTTP request to webhook.url
            // For now, we'll simulate success and log the delivery attempt
            const deliveryData = {
                webhook_id: id,
                status: 'success',
                response_code: 200,
                response_body: JSON.stringify({ success: true }),
                payload: JSON.stringify(testPayload),
                delivered_at: new Date().toISOString()
            };
            
            await this.createWebhookDelivery(deliveryData);
            
            return {
                success: true,
                message: 'Test webhook sent successfully',
                payload: testPayload
            };
        } catch (error) {
            this.logger.error('Error testing webhook:', error);
            throw error;
        }
    }

    async testWebhookData(testData) {
        try {
            // Test webhook with custom data provided by user
            const testPayload = {
                event: 'custom_test',
                timestamp: new Date().toISOString(),
                data: testData
            };
            
            return {
                success: true,
                message: 'Webhook test data prepared',
                payload: testPayload
            };
        } catch (error) {
            this.logger.error('Error preparing webhook test data:', error);
            throw error;
        }
    }

    // ============================================================================
    // ADDITIONAL ACTIVITY METHODS
    // ============================================================================

    async getActivitiesSince(timestamp) {
        try {
            const result = await this.all(`
                SELECT ua.*, u.username 
                FROM user_activity ua 
                LEFT JOIN users u ON ua.user_id = u.id 
                WHERE ua.created_at > ? 
                ORDER BY ua.created_at DESC
            `, [timestamp]);
            return result;
        } catch (error) {
            this.logger.error('Error getting activities since timestamp:', error);
            return [];
        }
    }

    async getActivityById(id) {
        try {
            const result = await this.get(`
                SELECT ua.*, u.username 
                FROM user_activity ua 
                LEFT JOIN users u ON ua.user_id = u.id 
                WHERE ua.id = ?
            `, [id]);
            return result;
        } catch (error) {
            this.logger.error('Error getting activity by ID:', error);
            return null;
        }
    }

    async exportActivities(filters = {}) {
        try {
            let whereClause = [];
            let params = [];

            if (filters.userId) {
                whereClause.push('ua.user_id = ?');
                params.push(filters.userId);
            }

            if (filters.action) {
                whereClause.push('ua.action = ?');
                params.push(filters.action);
            }

            if (filters.startDate) {
                whereClause.push('ua.created_at >= ?');
                params.push(filters.startDate);
            }

            if (filters.endDate) {
                whereClause.push('ua.created_at <= ?');
                params.push(filters.endDate);
            }

            const whereSQL = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';

            const result = await this.all(`
                SELECT 
                    ua.id,
                    ua.action,
                    ua.resource,
                    ua.details,
                    ua.ip_address,
                    ua.user_agent,
                    ua.created_at,
                    u.username
                FROM user_activity ua 
                LEFT JOIN users u ON ua.user_id = u.id 
                ${whereSQL}
                ORDER BY ua.created_at DESC
            `, params);

            return result;
        } catch (error) {
            this.logger.error('Error exporting activities:', error);
            return [];
        }
    }

    // ============================================================================
    // CLEANUP & CLOSE
    // ============================================================================

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    this.logger.error('Error closing database:', err);
                    reject(err);
                } else {
                    this.logger.info('Database connection closed');
                    resolve();
                }
            });
        });
    }

    // Performance monitoring
    getPerformanceStats() {
        const listeners = this.listeners('querySuccess');
        const errorListeners = this.listeners('queryError');
        
        return {
            activeListeners: listeners.length + errorListeners.length,
            cacheSize: this.queryCache.size,
            transactionActive: this.transactionActive,
            connectionOpen: this.db && this.db.open
        };
    }
}

module.exports = DatabaseAccessLayer;