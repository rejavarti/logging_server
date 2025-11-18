/**
 * SIMPLIFIED DATABASE ACCESS LAYER WITH UNIVERSAL SQLITE ADAPTER
 * 
 * Uses the Universal SQLite Adapter for optimal performance:
 * 🐳 Docker/Linux: better-sqlite3 (native performance)
 * 💻 Windows: sql.js (universal compatibility)
 * 🔄 Fallback: sqlite3 (legacy support)
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const EventEmitter = require('events');

class DatabaseAccessLayer extends EventEmitter {
    constructor(databasePath, logger) {
        super();
        this.db = new UniversalSQLiteAdapter(databasePath);
        this.logger = logger;
        this.transactionActive = false;
        // Cross-platform CPU sampling (for Windows where os.loadavg is zero)
        this._lastCpuSample = null; // { usage: process.cpuUsage(), time: Date.now() }
        
        // Initialize with optimizations
        this.initializeConnection();
    }

    async initializeConnection() {
        try {
            // Additional pragma settings if needed
            if (this.db.dbType === 'sqlite3') {
                await this.db.run('PRAGMA foreign_keys = ON');
            }
            
            // Ensure required tables exist
            await this.ensureRequiredTables();
            
            const driverInfo = this.db.getDriverInfo();
            this.logger.info(`Database initialized with ${driverInfo.type} (${driverInfo.performance})`);
        } catch (error) {
            this.logger.error('Database initialization error:', error);
        }
    }

    // Ensure required tables exist (especially user_sessions which is critical for session tracking)
    async ensureRequiredTables() {
        try {
            // Create user_sessions table if it doesn't exist
            await this.db.run(`
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
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `);
            
            // Create index for faster session lookups
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_user_sessions_token 
                ON user_sessions(session_token)
            `);
            
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_user_sessions_active 
                ON user_sessions(is_active, expires_at)
            `);
            
            this.logger.info('Required tables verified/created successfully');
        } catch (error) {
            this.logger.error('Failed to ensure required tables:', error);
            // Don't throw - let the app continue, but log the issue
        }
    }

    // Transaction management
    async beginTransaction() {
        if (this.transactionActive) {
            throw new Error('Transaction already active');
        }
        
        try {
            await this.db.run('BEGIN TRANSACTION');
            this.transactionActive = true;
            this.logger.info('Transaction started');
        } catch (error) {
            this.logger.error('Failed to begin transaction:', error);
            throw error;
        }
    }

    async commitTransaction() {
        if (!this.transactionActive) {
            throw new Error('No active transaction to commit');
        }
        
        try {
            await this.db.run('COMMIT');
            this.transactionActive = false;
            this.logger.info('Transaction committed successfully');
        } catch (error) {
            this.transactionActive = false;
            this.logger.error('Failed to commit transaction:', error);
            throw error;
        }
    }

    async rollbackTransaction() {
        if (!this.transactionActive) {
            throw new Error('No active transaction to rollback');
        }
        
        try {
            await this.db.run('ROLLBACK');
            this.transactionActive = false;
            this.logger.warn('Transaction rolled back');
        } catch (error) {
            this.transactionActive = false;
            this.logger.error('Failed to rollback transaction:', error);
            throw error;
        }
    }

    // Core database operations with logging and error handling
    async run(sql, params = [], options = {}) {
        const startTime = Date.now();
        
        try {
            const result = await this.db.run(sql, params);
            const duration = Date.now() - startTime;
            
            if (options.logQuery) {
                this.logger.debug(`SQL Success (${duration}ms): ${sql}`, {
                    params: params,
                    changes: result.changes,
                    lastID: result.lastID
                });
            }
            
            this.emit('querySuccess', { sql, params, duration, changes: result.changes, lastID: result.lastID });
            
            return {
                lastID: result.lastID,
                changes: result.changes
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.logger.error(`SQL Error (${duration}ms): ${sql}`, {
                error: error.message,
                params: params,
                stack: error.stack
            });
            
            this.emit('queryError', { sql, params, error, duration });
            throw error;
        }
    }

    async get(sql, params = [], options = {}) {
        const startTime = Date.now();
        
        try {
            const result = await this.db.get(sql, params);
            const duration = Date.now() - startTime;
            
            if (options.logQuery) {
                this.logger.debug(`SQL Get Success (${duration}ms): ${sql}`, {
                    params: params,
                    hasResult: !!result
                });
            }
            
            this.emit('querySuccess', { sql, params, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.logger.error(`SQL Get Error (${duration}ms): ${sql}`, {
                error: error.message,
                params: params,
                stack: error.stack
            });
            
            this.emit('queryError', { sql, params, error, duration });
            throw error;
        }
    }

    async all(sql, params = [], options = {}) {
        const startTime = Date.now();
        
        try {
            const results = await this.db.all(sql, params);
            const duration = Date.now() - startTime;
            
            if (options.logQuery) {
                this.logger.debug(`SQL All Success (${duration}ms): ${sql}`, {
                    params: params,
                    rowCount: results ? results.length : 0
                });
            }
            
            this.emit('querySuccess', { sql, params, duration, rowCount: results ? results.length : 0 });
            return results || [];
        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.logger.error(`SQL All Error (${duration}ms): ${sql}`, {
                error: error.message,
                params: params,
                stack: error.stack
            });
            
            this.emit('queryError', { sql, params, error, duration });
            throw error;
        }
    }

    // User management methods
    async createUser(userData) {
        const sql = `INSERT INTO users (username, password_hash, email, role, created_at, active) 
                     VALUES (?, ?, ?, ?, datetime('now'), ?)`;
        const params = [userData.username, userData.password_hash, userData.email, userData.role || 'user', userData.active || 1];
        return await this.run(sql, params);
    }

    async getUserById(userId) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        return await this.get(sql, [userId]);
    }

    async getUserByUsername(username) {
        const sql = `SELECT * FROM users WHERE username = ?`;
        return await this.get(sql, [username]);
    }

    async getAllUsers() {
        const sql = `SELECT id, username, email, created_at, last_login, active FROM users ORDER BY created_at DESC`;
        return await this.all(sql);
    }

    async updateUser(userId, updates) {
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['username', 'email', 'password_hash', 'active', 'last_login', 'preferences', 'role'];
        const fields = Object.keys(updates).filter(field => allowedFields.includes(field));
        
        if (fields.length === 0) {
            throw new Error('No valid fields provided for update');
        }
        
        const values = fields.map(field => updates[field]);
        const setClause = fields.map(field => `\`${field}\` = ?`).join(', ');
        const sql = `UPDATE users SET ${setClause} WHERE id = ?`;
        return await this.run(sql, [...values, userId]);
    }

    async deleteUser(userId) {
        const sql = `DELETE FROM users WHERE id = ?`;
        return await this.run(sql, [userId]);
    }

    // Role management methods (Unix philosophy: simple CRUD with clear boundaries)
    async getRoles() {
        try {
            const sql = `SELECT id, name, description, permissions, created_at, updated_at FROM roles ORDER BY id`;
            const rows = await this.all(sql);
            return rows.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                permissions: (() => { try { return JSON.parse(r.permissions); } catch { return []; } })(),
                created_at: r.created_at,
                updated_at: r.updated_at
            }));
        } catch (error) {
            this.logger.warn('Failed to get roles:', error.message);
            return [];
        }
    }

    async createRole(roleData) {
        const sql = `INSERT INTO roles (name, description, permissions, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`;
        const perms = Array.isArray(roleData.permissions) ? JSON.stringify(roleData.permissions) : JSON.stringify([]);
        return await this.run(sql, [roleData.name, roleData.description || null, perms]);
    }

    async updateRole(roleId, updates) {
        const fields = [];
        const values = [];
        if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
        if (updates.permissions) { fields.push('permissions = ?'); values.push(JSON.stringify(updates.permissions)); }
        if (!fields.length) throw new Error('No valid role fields to update');
        const sql = `UPDATE roles SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`;
        values.push(roleId);
        return await this.run(sql, values);
    }

    async deleteRole(roleId) {
        const sql = `DELETE FROM roles WHERE id = ?`;
        return await this.run(sql, [roleId]);
    }

    // Log management methods
    async insertLogEntry(logData) {
        // Forward to createLogEntry which matches the migrated logs table structure
        return this.createLogEntry(logData);
    }

    /**
     * createLogEntry
     * Unified, schema‑aware log insertion matching migrated `logs` table:
     * Columns: id, timestamp, level, source, message, metadata, ip, user_id, tags, created_at
     * Accepts legacy fields (category, device_id, user_agent, country, region, city, timezone, coordinates, browser, os, device, tags).
     */
    async createLogEntry(entry) {
        try {
            // Build metadata object if not explicitly provided as JSON/string
            let meta = null;
            if (entry.metadata) {
                if (typeof entry.metadata === 'string') {
                    // Assume already serialized
                    meta = entry.metadata;
                } else {
                    meta = JSON.stringify(entry.metadata);
                }
            } else {
                const derived = {};
                const metaFields = ['user_agent','country','region','city','timezone','coordinates','browser','os','device','device_id'];
                metaFields.forEach(f => { if (entry[f] !== undefined) derived[f] = entry[f]; });
                if (Object.keys(derived).length) meta = JSON.stringify(derived); // Only set if we captured something
            }

            // Normalize tags (can be array, object, string)
            let tags = null;
            if (entry.tags) {
                if (Array.isArray(entry.tags)) tags = entry.tags.join(',');
                else if (typeof entry.tags === 'object') tags = Object.keys(entry.tags).join(',');
                else tags = String(entry.tags);
            }

            const sql = `INSERT INTO logs (timestamp, level, source, message, metadata, ip, user_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const params = [
                entry.timestamp || new Date().toISOString(),
                entry.level || 'info',
                // Allow category fallback for legacy callers
                entry.source || entry.category || 'system',
                entry.message || '',
                meta,
                entry.ip || entry.clientIp || null,
                entry.user_id || entry.userId || null,
                tags
            ];
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to create log entry:', error);
            throw error;
        }
    }

    // Integration docs methods
    async getIntegrationDoc(type) {
        try {
            const sql = `SELECT type, doc, updated_at FROM integration_docs WHERE type = ?`;
            return await this.get(sql, [type]);
        } catch (error) {
            this.logger.warn('Failed to get integration doc:', error.message);
            return null;
        }
    }

    async getAllIntegrationDocs() {
        try {
            const sql = `SELECT type, doc, updated_at FROM integration_docs ORDER BY type`;
            return await this.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get integration docs:', error.message);
            return [];
        }
    }

    async upsertIntegrationDoc(type, doc) {
        const sql = `INSERT INTO integration_docs (type, doc, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(type) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`;
        return await this.run(sql, [type, doc]);
    }

    // File ingestion offset persistence
    async getFileOffset(filePath) {
        try {
            const sql = `SELECT file_path, last_offset FROM file_ingestion_offsets WHERE file_path = ?`;
            return await this.get(sql, [filePath]);
        } catch (error) {
            this.logger.warn('Failed to get file offset:', error.message);
            return null;
        }
    }

    async setFileOffset(filePath, offset) {
        const sql = `INSERT INTO file_ingestion_offsets (file_path, last_offset, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(file_path) DO UPDATE SET last_offset = excluded.last_offset, updated_at = excluded.updated_at`;
        return await this.run(sql, [filePath, offset]);
    }

    // Parse error recording (non-blocking notifications)
    async recordParseError(err) {
        try {
            const sql = `INSERT INTO parse_errors (source, file_path, line_number, line_snippet, reason, created_at, acknowledged) VALUES (?, ?, ?, ?, ?, datetime('now'), 0)`;
            const params = [
                err.source || 'unknown',
                err.file_path || null,
                typeof err.line_number === 'number' ? err.line_number : null,
                err.line_snippet || null,
                err.reason || 'unparsable'
            ];
            return await this.run(sql, params);
        } catch (error) {
            this.logger.warn('Failed to record parse error:', error.message);
            return { changes: 0 };
        }
    }

    async getRecentParseErrors(limit = 10) {
        try {
            const sql = `SELECT id, source, file_path, line_number, line_snippet, reason, created_at, acknowledged FROM parse_errors ORDER BY created_at DESC LIMIT ?`;
            return await this.all(sql, [limit]);
        } catch (error) {
            this.logger.warn('Failed to get recent parse errors:', error.message);
            return [];
        }
    }

    async getUnreadParseErrorCount() {
        try {
            const row = await this.get(`SELECT COUNT(*) as cnt FROM parse_errors WHERE acknowledged = 0`, []);
            return row?.cnt || 0;
        } catch (error) {
            this.logger.warn('Failed to count unread parse errors:', error.message);
            return 0;
        }
    }

    async acknowledgeParseError(id) {
        try {
            const sql = `UPDATE parse_errors SET acknowledged = 1 WHERE id = ? AND acknowledged = 0`;
            return await this.run(sql, [id]);
        } catch (error) {
            this.logger.warn('Failed to acknowledge parse error:', error.message);
            return { changes: 0 };
        }
    }

    async getLogEntries(filters = {}, limit = 100, offset = 0) {
        let sql = `SELECT * FROM logs WHERE 1=1`;
        const params = [];
        
        if (filters.level) {
            sql += ` AND level = ?`;
            params.push(filters.level);
        }
        
        if (filters.source) {
            sql += ` AND source = ?`;
            params.push(filters.source);
        }
        
        if (filters.device_id) {
            sql += ` AND device_id = ?`;
            params.push(filters.device_id);
        }
        
        if (filters.start_date) {
            sql += ` AND timestamp >= ?`;
            params.push(filters.start_date);
        }
        
        if (filters.end_date) {
            sql += ` AND timestamp <= ?`;
            params.push(filters.end_date);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }

    async getLogCount(filters = {}) {
        let sql = `SELECT COUNT(*) as count FROM logs WHERE 1=1`;
        const params = [];
        
        if (filters.level) {
            sql += ` AND level = ?`;
            params.push(filters.level);
        }
        
        if (filters.source) {
            sql += ` AND source = ?`;
            params.push(filters.source);
        }
        
        if (filters.device_id) {
            sql += ` AND device_id = ?`;
            params.push(filters.device_id);
        }
        
        // Support date range filtering for analytics
        if (filters.start_date) {
            sql += ` AND date(timestamp) >= date(?)`;
            params.push(filters.start_date);
        }
        
        if (filters.end_date) {
            sql += ` AND date(timestamp) <= date(?)`;
            params.push(filters.end_date);
        }
        
        // Support time-based relative filters
        if (filters.since_hours) {
            sql += ` AND timestamp >= datetime('now', 'localtime', '-' || ? || ' hours')`;
            params.push(filters.since_hours);
        }
        
        if (filters.since_days) {
            sql += ` AND timestamp >= datetime('now', 'localtime', '-' || ? || ' days')`;
            params.push(filters.since_days);
        }
        
        const result = await this.get(sql, params);
        return result ? result.count : 0;
    }
    
    // Analytics: Get daily log trends for the past N days
    async getDailyLogTrends(days = 7) {
        const sql = `
            SELECT 
                date(timestamp) as date,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= datetime('now', 'localtime', '-' || ? || ' days')
            GROUP BY date(timestamp)
            ORDER BY date ASC
        `;
        return await this.all(sql, [days]);
    }
    
    // Analytics: Get hourly log distribution for the past N hours
    async getHourlyLogTrends(hours = 24) {
        const sql = `
            SELECT 
                strftime('%Y-%m-%d %H:00', timestamp) as hour,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= datetime('now', 'localtime', '-' || ? || ' hours')
            GROUP BY strftime('%Y-%m-%d %H:00', timestamp)
            ORDER BY hour ASC
        `;
        return await this.all(sql, [hours]);
    }
    
    // Analytics: Get weekly aggregation
    async getWeeklyLogTrends(weeks = 4) {
        const sql = `
            SELECT 
                strftime('%Y-W%W', timestamp) as week,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= datetime('now', 'localtime', '-' || ? || ' days')
            GROUP BY strftime('%Y-W%W', timestamp)
            ORDER BY week ASC
        `;
        return await this.all(sql, [weeks * 7]);
    }
    
    // Analytics: Get log statistics by level
    async getLogStatsByLevel(days = 7) {
        const sql = `
            SELECT 
                level,
                COUNT(*) as count,
                MIN(timestamp) as first_seen,
                MAX(timestamp) as last_seen
            FROM logs
            WHERE timestamp >= datetime('now', 'localtime', '-' || ? || ' days')
            GROUP BY level
            ORDER BY count DESC
        `;
        return await this.all(sql, [days]);
    }

    // Dashboard widget methods
    async createDashboardWidget(widgetData) {
        const sql = `INSERT INTO dashboard_widgets (dashboard_id, type, title, config, position_x, position_y, width, height, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
        const params = [
            widgetData.dashboard_id,
            widgetData.type,
            widgetData.title,
            JSON.stringify(widgetData.config),
            widgetData.position_x || 0,
            widgetData.position_y || 0,
            widgetData.width || 1,
            widgetData.height || 1
        ];
        return await this.run(sql, params);
    }

    async getDashboardWidgets(dashboardId) {
        const sql = `SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position_y, position_x`;
        return await this.all(sql, [dashboardId]);
    }

    async updateDashboardWidget(widgetId, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        
        // Handle config field JSON serialization
        const processedValues = values.map((value, index) => {
            if (fields[index] === 'config' && typeof value === 'object') {
                return JSON.stringify(value);
            }
            return value;
        });
        
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['title', 'type', 'config', 'position_x', 'position_y', 'width', 'height', 'dashboard_id'];
        const validFields = fields.filter(field => allowedFields.includes(field));
        
        if (validFields.length === 0) {
            throw new Error('No valid fields provided for widget update');
        }
        
        const validValues = validFields.map(field => processedData[field]);
        const setClause = validFields.map(field => `\`${field}\` = ?`).join(', ');
        const sql = `UPDATE dashboard_widgets SET ${setClause} WHERE id = ?`;
        return await this.run(sql, [...validValues, widgetId]);
    }

    async deleteDashboardWidget(widgetId) {
        const sql = `DELETE FROM dashboard_widgets WHERE id = ?`;
        return await this.run(sql, [widgetId]);
    }

    // Device management methods
    async registerDevice(deviceData) {
        const sql = `INSERT OR REPLACE INTO devices (id, name, type, status, last_seen, metadata) 
                     VALUES (?, ?, ?, ?, datetime('now'), ?)`;
        const params = [
            deviceData.id,
            deviceData.name,
            deviceData.type,
            deviceData.status || 'active',
            deviceData.metadata ? JSON.stringify(deviceData.metadata) : null
        ];
        return await this.run(sql, params);
    }

    async getDevice(deviceId) {
        const sql = `SELECT * FROM devices WHERE id = ?`;
        return await this.get(sql, [deviceId]);
    }

    async getAllDevices() {
        const sql = `SELECT * FROM devices ORDER BY last_seen DESC`;
        return await this.all(sql);
    }

    async updateDeviceStatus(deviceId, status) {
        const sql = `UPDATE devices SET status = ?, last_seen = datetime('now') WHERE id = ?`;
        return await this.run(sql, [status, deviceId]);
    }

    // Cleanup and maintenance
    async cleanup() {
        if (this.db) {
            this.db.close();
        }
    }

    // System settings methods
    async getSetting(key, defaultValue = null) {
        try {
            const sql = `SELECT setting_value FROM system_settings WHERE setting_key = ?`;
            const result = await this.get(sql, [key]);
            return result ? result.setting_value : defaultValue;
        } catch (error) {
            this.logger.warn(`Failed to get setting ${key}:`, error.message);
            return defaultValue;
        }
    }

    async setSetting(key, value, description = null) {
        try {
            const sql = `INSERT OR REPLACE INTO system_settings (setting_key, setting_value, description, updated_at) 
                         VALUES (?, ?, ?, datetime('now'))`;
            const result = await this.run(sql, [key, value, description]);
            return result.changes > 0 || result.lastID > 0;
        } catch (error) {
            this.logger.error(`Failed to set setting ${key}:`, error);
            throw error;
        }
    }

    async getAllSettings() {
        try {
            const sql = `SELECT * FROM system_settings ORDER BY setting_key`;
            return await this.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get all settings:', error.message);
            return [];
        }
    }

    async deleteSetting(key) {
        try {
            const sql = `DELETE FROM system_settings WHERE setting_key = ?`;
            const result = await this.run(sql, [key]);
            return result.changes > 0;
        } catch (error) {
            this.logger.error(`Failed to delete setting ${key}:`, error);
            throw error;
        }
    }

    // Session management methods (updated to match current user_sessions schema)
    // Table columns: id, user_id, session_token, ip_address, user_agent, expires_at, created_at, last_activity, is_active
    async createUserSession(sessionData) {
        try {
            const sql = `INSERT INTO user_sessions (session_token, user_id, ip_address, user_agent, expires_at)
                         VALUES (?, ?, ?, ?, ?)`;
            const params = [
                sessionData.session_token,
                sessionData.user_id,
                sessionData.ip_address || null,
                sessionData.user_agent || null,
                sessionData.expires_at
            ];
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to create user session:', error.message);
            throw error;
        }
    }

    async getActiveSession(sessionToken) {
        const sql = `SELECT * FROM user_sessions WHERE session_token = ? AND expires_at > datetime('now')`;
        return await this.get(sql, [sessionToken]);
    }

    async deleteSession(sessionToken) {
        const sql = `DELETE FROM user_sessions WHERE session_token = ?`;
        return await this.run(sql, [sessionToken]);
    }

    async deactivateSession(sessionToken) {
        const sql = `UPDATE user_sessions SET is_active = 0, last_activity = datetime('now') WHERE session_token = ?`;
        return await this.run(sql, [sessionToken]);
    }

        async deleteSessionById(sessionId) {
            const sql = `DELETE FROM user_sessions WHERE id = ?`;
            return await this.run(sql, [sessionId]);
        }

    async cleanExpiredSessions() {
        const sql = `DELETE FROM user_sessions WHERE expires_at <= datetime('now')`;
        return await this.run(sql);
    }

    // Alert and notification methods
    async getAlertRules() {
        try {
            const sql = `SELECT * FROM alert_rules WHERE enabled = 1 ORDER BY priority DESC`;
            return await this.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get alert rules:', error.message);
            return [];
        }
    }

    async createAlertRule(ruleData) {
        const sql = `INSERT INTO alert_rules (name, condition_sql, threshold_value, comparison_operator, 
                     severity, enabled, notification_channels, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
        const params = [
            ruleData.name,
            ruleData.condition_sql,
            ruleData.threshold_value,
            ruleData.comparison_operator,
            ruleData.severity,
            ruleData.enabled || 1,
            ruleData.notification_channels ? JSON.stringify(ruleData.notification_channels) : null
        ];
        return await this.run(sql, params);
    }

    // System metrics methods  
    async recordMetric(metricName, value, metricType = 'gauge', tags = {}) {
        const sql = `INSERT INTO system_metrics (metric_name, metric_value, metric_type, tags, timestamp) 
                     VALUES (?, ?, ?, ?, datetime('now'))`;
        const params = [metricName, value, metricType, JSON.stringify(tags)];
        return await this.run(sql, params);
    }

    async getMetrics(metricName, startTime = null, endTime = null, limit = 1000) {
        let sql = `SELECT * FROM system_metrics WHERE metric_name = ?`;
        const params = [metricName];
        
        if (startTime) {
            sql += ` AND timestamp >= ?`;
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ` AND timestamp <= ?`;
            params.push(endTime);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);
        
        return await this.all(sql, params);
    }

    // Webhook methods
    async getWebhooks() {
        try {
            const sql = `SELECT * FROM webhooks ORDER BY created_at DESC`;
            return await this.db.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get webhooks:', error.message);
            return [];
        }
    }

    async getActiveWebhooks() {
        try {
            const sql = `SELECT * FROM webhooks WHERE active = 1 ORDER BY created_at DESC`;
            return await this.db.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get webhooks:', error.message);
            return [];
        }
    }

    async getWebhookById(webhookId) {
        try {
            const sql = `SELECT * FROM webhooks WHERE id = ?`;
            return await this.db.get(sql, [webhookId]);
        } catch (error) {
            this.logger.warn('Failed to get webhook by ID:', error.message);
            return null;
        }
    }

    async createWebhook(webhookData) {
        const sql = `INSERT INTO webhooks (name, url, method, headers, active, created_at) 
                     VALUES (?, ?, ?, ?, ?, datetime('now'))`;
        const params = [
            webhookData.name,
            webhookData.url,
            webhookData.method || 'POST',
            webhookData.headers ? JSON.stringify(webhookData.headers) : null,
            webhookData.active !== undefined ? webhookData.active : 1
        ];
        return await this.run(sql, params);
    }

    async updateWebhook(webhookId, updates) {
        try {
            const setClauses = [];
            const params = [];
            
            if (updates.name !== undefined) {
                setClauses.push('name = ?');
                params.push(updates.name);
            }
            if (updates.url !== undefined) {
                setClauses.push('url = ?');
                params.push(updates.url);
            }
            if (updates.method !== undefined) {
                setClauses.push('method = ?');
                params.push(updates.method);
            }
            if (updates.headers !== undefined) {
                setClauses.push('headers = ?');
                params.push(JSON.stringify(updates.headers));
            }
            if (updates.active !== undefined) {
                setClauses.push('active = ?');
                params.push(updates.active);
            }
            
            if (setClauses.length === 0) {
                this.logger.warn('No fields to update for webhook');
                return { changes: 0 };
            }
            
            setClauses.push('updated_at = datetime(\'now\')');
            params.push(webhookId);
            
            const sql = `UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = ?`;
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to update webhook:', error);
            throw error;
        }
    }

    async deleteWebhook(webhookId) {
        try {
            const sql = `DELETE FROM webhooks WHERE id = ?`;
            return await this.run(sql, [webhookId]);
        } catch (error) {
            this.logger.error('Failed to delete webhook:', error);
            throw error;
        }
    }

    async toggleWebhook(webhookId) {
        try {
            // Fetch current active state
            const row = await this.get(`SELECT id, active FROM webhooks WHERE id = ?`, [webhookId]);
            if (!row) {
                return { success: false, error: 'Webhook not found', id: Number(webhookId), enabled: false };
            }
            const newActive = row.active ? 0 : 1;
            await this.run(`UPDATE webhooks SET active = ?, updated_at = datetime('now') WHERE id = ?`, [newActive, webhookId]);
            return { success: true, id: Number(webhookId), enabled: Boolean(newActive) };
        } catch (error) {
            this.logger.error('Failed to toggle webhook:', error);
            return { success: false, error: error.message, id: Number(webhookId), enabled: false };
        }
    }

    // Activity log methods
    async logActivity(activityData) {
        const sql = `INSERT INTO activity_log (user_id, action, resource_type, resource_id, 
                     details, ip_address, user_agent, timestamp) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
        const params = [
            activityData.user_id,
            activityData.action,
            activityData.resource_type,
            activityData.resource_id,
            activityData.details ? JSON.stringify(activityData.details) : null,
            activityData.ip_address,
            activityData.user_agent
        ];
        return await this.run(sql, params);
    }

    // Wrapper for compatibility with older code that uses positional parameters
    async logUserActivity(user_id, action, resource_type, details, ip_address, user_agent) {
        return await this.logActivity({
            user_id,
            action,
            resource_type,
            resource_id: null,
            details,
            ip_address,
            user_agent
        });
    }

    async getActivityLog(userId = null, limit = 100, offset = 0) {
        let sql = `SELECT * FROM activity_log`;
        const params = [];
        
        if (userId) {
            sql += ` WHERE user_id = ?`;
            params.push(userId);
        }
        
        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        return await this.all(sql, params);
    }

    // Dashboard-specific methods for system stats and health
    async getSystemStats() {
        try {
            const sql = `
                SELECT 
                    COUNT(*) as totalLogs,
                    SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errorCount,
                    SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warningCount,
                    SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as infoCount,
                    SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debugCount
                FROM logs 
                WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
            `;
            const result = await this.get(sql);
            return result || { totalLogs: 0, errorCount: 0, warningCount: 0, infoCount: 0, debugCount: 0 };
        } catch (error) {
            this.logger.warn('Failed to get system stats:', error.message);
            return { totalLogs: 0, errorCount: 0, warningCount: 0, infoCount: 0, debugCount: 0 };
        }
    }

    async getRecentLogs(limit = 20) {
        try {
            const sql = `SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?`;
            return await this.all(sql, [limit]);
        } catch (error) {
            this.logger.warn('Failed to get recent logs:', error.message);
            return [];
        }
    }

    async getSystemHealth() {
        try {
            const uptime = process.uptime();
            const memUsage = process.memoryUsage();
            const memUsedMB = Math.round(memUsage.rss / 1024 / 1024);
            
            // Get OS-level CPU and memory stats (requires os module)
            const os = require('os');
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            // CPU usage: prefer load average, but provide process.cpuUsage-based fallback for Windows (loadAvg==0)
            const cpuCount = os.cpus().length;
            const loadAvg = os.loadavg()[0];
            let cpuPercent = 0;

            if (loadAvg && loadAvg > 0) {
                cpuPercent = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);
            } else {
                // Fallback: derive % from process.cpuUsage delta over elapsed wall time
                const now = Date.now();
                const current = process.cpuUsage(); // microseconds
                if (!this._lastCpuSample) {
                    this._lastCpuSample = { usage: current, time: now };
                    cpuPercent = 0; // first sample baseline
                } else {
                    const elapsedMs = now - this._lastCpuSample.time;
                    if (elapsedMs > 0) {
                        const userDiff = current.user - this._lastCpuSample.usage.user;
                        const sysDiff = current.system - this._lastCpuSample.usage.system;
                        const totalDiffMicros = userDiff + sysDiff; // microseconds of CPU time used
                        // Convert to percentage of one core, then divide by core count to approximate overall usage spread
                        const percentOneCore = (totalDiffMicros / 1000) / elapsedMs * 100; // (ms CPU / ms elapsed)*100
                        cpuPercent = Math.min(100, Math.max(0, Math.round(percentOneCore / cpuCount)));
                    }
                    this._lastCpuSample = { usage: current, time: now };
                }
            }
            
            // Get database size
            let dbSize = 0;
            try {
                const sizeResult = await this.get(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`);
                dbSize = sizeResult ? Math.round(sizeResult.size / 1024 / 1024) : 0;
            } catch (error) {
                // Ignore errors getting DB size
            }
            
            // Calculate memory as percentage of actual system memory
            const memPercent = Math.min(Math.round((usedMem / totalMem) * 100), 100);
            
            // Calculate disk as percentage of actual available space
            // Use du command to get /app/data directory size in MB
            let diskUsedMB = dbSize;
            let diskTotalMB = 10240; // Default 10GB
            try {
                const { execSync } = require('child_process');
                // Get disk usage of /app/data mount point
                const dfOutput = execSync('df -BM /app/data 2>/dev/null || echo "error"', { encoding: 'utf8' });
                if (!dfOutput.includes('error')) {
                    const lines = dfOutput.trim().split('\n');
                    if (lines.length > 1) {
                        const parts = lines[1].split(/\s+/);
                        // Format: Filesystem Size Used Available Use% Mounted
                        if (parts.length >= 4) {
                            diskTotalMB = parseInt(parts[1].replace('M', '')) || diskTotalMB;
                            diskUsedMB = parseInt(parts[2].replace('M', '')) || diskUsedMB;
                        }
                    }
                }
            } catch (error) {
                // Fallback to database size only if df fails
                diskUsedMB = dbSize;
            }
            const diskPercent = Math.min(Math.round((diskUsedMB / diskTotalMB) * 100), 100);
            
            return {
                status: 'healthy',
                uptime: Math.round(uptime),
                memory: memPercent,
                cpu: cpuPercent,
                disk: diskPercent,
                memoryMB: memUsedMB,
                diskMB: dbSize,
                totalMemoryMB: Math.round(totalMem / 1024 / 1024),
                freeMemoryMB: Math.round(freeMem / 1024 / 1024),
                database_driver: this.db.dbType || 'unknown'
            };
        } catch (error) {
            this.logger.warn('Failed to get system health:', error.message);
            return { status: 'error', uptime: 0, memory: 0, cpu: 0, disk: 0 };
        }
    }

    async getLogSources() {
        try {
            const sql = `
                SELECT source, COUNT(*) as count, MAX(timestamp) as last_seen 
                FROM logs 
                WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
                GROUP BY source 
                ORDER BY count DESC
            `;
            return await this.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get log sources:', error.message);
            return [];
        }
    }

    // Enhanced log entry methods
    async getRecentLogsByLevel(level, limit = 50) {
        try {
            const sql = `SELECT * FROM logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?`;
            return await this.all(sql, [level, limit]);
        } catch (error) {
            this.logger.warn(`Failed to get recent ${level} logs:`, error.message);
            return [];
        }
    }

    async getLogTrends(hours = 24) {
        try {
            // SECURITY FIX: Sanitize hours parameter to prevent SQL injection
            const safeHours = parseInt(hours) || 24;
            if (safeHours < 1 || safeHours > 168) { // Max 1 week
                throw new Error('Invalid hours parameter: must be between 1 and 168');
            }
            
            const sql = `
                SELECT 
                    strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                    level,
                    COUNT(*) as count
                FROM logs 
                WHERE timestamp >= datetime('now', '-' || ? || ' hours')
                GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp), level
                ORDER BY hour DESC
            `;
            return await this.all(sql, [safeHours]);
        } catch (error) {
            this.logger.warn('Failed to get log trends:', error.message);
            return [];
        }
    }

    async getTopErrorMessages(limit = 10) {
        try {
            const sql = `
                SELECT message, COUNT(*) as count, MAX(timestamp) as last_seen
                FROM logs 
                WHERE level = 'error' AND timestamp >= datetime('now', '-24 hours')
                GROUP BY message 
                ORDER BY count DESC 
                LIMIT ?
            `;
            return await this.all(sql, [limit]);
        } catch (error) {
            this.logger.warn('Failed to get top error messages:', error.message);
            return [];
        }
    }

    // Dashboard widget data methods
    async getDashboardData(dashboardId = null) {
        try {
            let widgets = [];
            
            if (dashboardId) {
                widgets = await this.getDashboardWidgets(dashboardId);
            }
            
            // Get default dashboard data
            const data = {
                stats: await this.getSystemStats(),
                recentLogs: await this.getRecentLogs(20),
                systemHealth: await this.getSystemHealth(),
                logSources: await this.getLogSources(),
                widgets: widgets
            };
            
            return data;
        } catch (error) {
            this.logger.error('Failed to get dashboard data:', error);
            throw error;
        }
    }

    // Activity log additional methods
    async getActivityById(activityId) {
        try {
            const sql = `SELECT * FROM activity_log WHERE id = ?`;
            return await this.db.get(sql, [activityId]);
        } catch (error) {
            this.logger.warn('Failed to get activity by ID:', error.message);
            return null;
        }
    }

    async getActivitiesSince(timestamp) {
        try {
            const sql = `SELECT * FROM activity_log WHERE created_at >= ? ORDER BY created_at DESC`;
            return await this.db.all(sql, [timestamp]);
        } catch (error) {
            this.logger.warn('Failed to get activities since timestamp:', error.message);
            return [];
        }
    }

    async getAllActivity(filters = {}) {
        try {
            let sql = `SELECT * FROM activity_log WHERE 1=1`;
            const params = [];

            if (filters.user_id) {
                sql += ` AND user_id = ?`;
                params.push(filters.user_id);
            }
            if (filters.action) {
                sql += ` AND action = ?`;
                params.push(filters.action);
            }
            if (filters.resource_type) {
                sql += ` AND resource_type = ?`;
                params.push(filters.resource_type);
            }
            if (filters.start_date) {
                sql += ` AND created_at >= ?`;
                params.push(filters.start_date);
            }
            if (filters.end_date) {
                sql += ` AND created_at <= ?`;
                params.push(filters.end_date);
            }

            sql += ` ORDER BY created_at DESC`;
            
            if (filters.limit) {
                sql += ` LIMIT ?`;
                params.push(filters.limit);
            }

            return await this.db.all(sql, params);
        } catch (error) {
            this.logger.warn('Failed to get all activity:', error.message);
            return [];
        }
    }

    // Saved search methods
    async createSavedSearch(searchData) {
        try {
            const sql = `INSERT INTO saved_searches (user_id, name, query, filters, created_at) 
                         VALUES (?, ?, ?, ?, datetime('now'))`;
            const params = [
                searchData.user_id,
                searchData.name,
                searchData.query,
                JSON.stringify(searchData.filters || {})
            ];
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to create saved search:', error);
            throw error;
        }
    }

    async getSavedSearchById(searchId, userId) {
        try {
            const sql = `SELECT * FROM saved_searches WHERE id = ? AND user_id = ?`;
            return await this.db.get(sql, [searchId, userId]);
        } catch (error) {
            this.logger.warn('Failed to get saved search:', error.message);
            return null;
        }
    }

    async deleteSavedSearch(searchId, userId) {
        try {
            const sql = `DELETE FROM saved_searches WHERE id = ? AND user_id = ?`;
            return await this.run(sql, [searchId, userId]);
        } catch (error) {
            this.logger.error('Failed to delete saved search:', error);
            throw error;
        }
    }

    // Integration methods
    async getIntegrations() {
        try {
            const sql = `SELECT * FROM integrations ORDER BY name ASC`;
            return await this.db.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get integrations:', error.message);
            return [];
        }
    }

    async getIntegration(integrationId) {
        try {
            const sql = `SELECT * FROM integrations WHERE id = ?`;
            return await this.db.get(sql, [integrationId]);
        } catch (error) {
            this.logger.warn('Failed to get integration:', error.message);
            return null;
        }
    }

    async createIntegration(integrationData) {
        try {
            // Check if integration with same name already exists
            const existing = await this.get(
                `SELECT id FROM integrations WHERE name = ?`,
                [integrationData.name]
            );
            
            if (existing) {
                // Update existing integration instead of creating duplicate
                const updates = {
                    type: integrationData.type,
                    config: integrationData.config,
                    enabled: integrationData.enabled !== undefined ? integrationData.enabled : 1,
                    // Keep status in sync when enabled provided
                    status: (integrationData.enabled !== undefined ? (integrationData.enabled ? 'enabled' : 'disabled') : undefined)
                };
                await this.updateIntegration(existing.id, updates);
                return { lastID: existing.id };
            }
            
            // Create new integration
            const sql = `INSERT INTO integrations (name, type, config, enabled, status, created_at) 
                         VALUES (?, ?, ?, ?, ?, datetime('now'))`;
            const params = [
                integrationData.name,
                integrationData.type,
                // Config is already stringified by the route handler
                typeof integrationData.config === 'string' 
                    ? integrationData.config 
                    : JSON.stringify(integrationData.config || {}),
                integrationData.enabled !== undefined ? integrationData.enabled : 1,
                integrationData.enabled ? 'enabled' : 'disabled'
            ];
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to create integration:', error);
            throw error;
        }
    }

    async updateIntegration(integrationId, updates) {
        try {
            const setClauses = [];
            const params = [];
            
            if (updates.name !== undefined) {
                setClauses.push('name = ?');
                params.push(updates.name);
            }
            if (updates.type !== undefined) {
                setClauses.push('type = ?');
                params.push(updates.type);
            }
            if (updates.config !== undefined) {
                setClauses.push('config = ?');
                // Config may already be stringified by the route handler
                params.push(typeof updates.config === 'string' 
                    ? updates.config 
                    : JSON.stringify(updates.config));
            }
            if (updates.enabled !== undefined) {
                setClauses.push('enabled = ?');
                params.push(updates.enabled);
                // Keep status in sync with enabled
                setClauses.push('status = ?');
                params.push(updates.enabled ? 'enabled' : 'disabled');
            }
            if (updates.status !== undefined && updates.enabled === undefined) {
                // If status provided independently, infer enabled when not explicitly set
                const normalized = String(updates.status).toLowerCase();
                const inferredEnabled = normalized === 'enabled' || normalized === 'active' ? 1 : 0;
                setClauses.push('status = ?');
                params.push(updates.status);
                setClauses.push('enabled = ?');
                params.push(inferredEnabled);
            }
            
            if (setClauses.length === 0) {
                this.logger.warn('No fields to update for integration');
                return { changes: 0 };
            }
            
            setClauses.push('updated_at = datetime(\'now\')');
            params.push(integrationId);
            
            const sql = `UPDATE integrations SET ${setClauses.join(', ')} WHERE id = ?`;
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to update integration:', error);
            throw error;
        }
    }

    async deleteIntegration(integrationId) {
        try {
            const sql = `DELETE FROM integrations WHERE id = ?`;
            return await this.run(sql, [integrationId]);
        } catch (error) {
            this.logger.error('Failed to delete integration:', error);
            throw error;
        }
    }

    async toggleIntegration(integrationId) {
        try {
            const row = await this.get(`SELECT id, enabled FROM integrations WHERE id = ?`, [integrationId]);
            if (!row) {
                return { success: false, error: 'Integration not found', id: Number(integrationId), enabled: false };
            }
            const newEnabled = row.enabled ? 0 : 1;
            const newStatus = newEnabled ? 'enabled' : 'disabled';
            await this.run(`UPDATE integrations SET enabled = ?, status = ?, updated_at = datetime('now') WHERE id = ?`, [newEnabled, newStatus, integrationId]);
            return { success: true, id: Number(integrationId), enabled: Boolean(newEnabled) };
        } catch (error) {
            this.logger.error('Failed to toggle integration:', error);
            return { success: false, error: error.message, id: Number(integrationId), enabled: false };
        }
    }

    async getIntegrationDocs(integrationType) {
        // Return documentation for specific integration type
        // This would typically come from a docs table or be hardcoded
        try {
            const sql = `SELECT * FROM integration_docs WHERE type = ?`;
            const result = await this.db.get(sql, [integrationType]);
            return result || { type: integrationType, docs: 'Documentation not available' };
        } catch (error) {
            this.logger.warn('Failed to get integration docs:', error.message);
            return { type: integrationType, docs: 'Documentation not available' };
        }
    }

    // Advanced search with complex filters
    async advancedSearch(searchParams) {
        try {
            const {
                query,
                level,
                source,
                startDate,
                endDate,
                regex,
                caseSensitive,
                limit = 100,
                offset = 0
            } = searchParams;

            let sql = `SELECT * FROM logs WHERE 1=1`;
            const params = [];

            // Text search
            if (query) {
                if (regex) {
                    // SQLite doesn't support REGEXP by default, use LIKE with wildcards
                    sql += ` AND message LIKE ?`;
                    params.push(`%${query}%`);
                } else if (caseSensitive) {
                    sql += ` AND message GLOB ?`;
                    params.push(`*${query}*`);
                } else {
                    sql += ` AND message LIKE ?`;
                    params.push(`%${query}%`);
                }
            }

            // Level filter
            if (level) {
                sql += ` AND level = ?`;
                params.push(level);
            }

            // Source filter
            if (source) {
                sql += ` AND source = ?`;
                params.push(source);
            }

            // Date range
            if (startDate) {
                sql += ` AND timestamp >= ?`;
                params.push(startDate);
            }
            if (endDate) {
                sql += ` AND timestamp <= ?`;
                params.push(endDate);
            }

            // Get total count
            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
            const countResult = await this.get(countSql, params);
            const total = countResult?.count || 0;

            // Add ordering and pagination
            sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const results = await this.all(sql, params);

            return {
                results,
                total,
                limit,
                offset
            };
        } catch (error) {
            this.logger.error('Advanced search error:', error);
            throw error;
        }
    }

    // Get database driver information
    getDriverInfo() {
        return this.db ? this.db.getDriverInfo() : null;
    }

    // Cleanup and maintenance
    async cleanup() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = DatabaseAccessLayer;