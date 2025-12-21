/**
 * DATABASE ACCESS LAYER
 * 
 * PostgreSQL-only database access layer
 */

const EventEmitter = require('events');
const PostgresAdapter = require('./postgres-adapter');

class DatabaseAccessLayer extends EventEmitter {
    constructor(databasePath, logger, existingDb = null) {
        super();
        
        // Use PostgreSQL adapter
        const config = {
            host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
            database: process.env.DB_NAME || process.env.POSTGRES_DB || 'logging_server',
            user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
            password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD
        };
        this.db = new PostgresAdapter(config, logger);
        
        this.logger = logger;
        this.transactionActive = false;
        this.usingExistingDb = !!existingDb; // Track if we're reusing a connection
        // Cross-platform CPU sampling (for Windows where os.loadavg is zero)
        this._lastCpuSample = null; // { usage: process.cpuUsage(), time: Date.now() }
        
        // Prepared statement cache for frequently used queries
        this.preparedStatements = new Map();
        this.maxCacheSize = 50;

        // Batched log insertion buffers
        this.logBatch = [];
        this.batchMaxSize = parseInt(process.env.LOG_BATCH_SIZE || '50', 10);
        this.batchIntervalMs = parseInt(process.env.LOG_BATCH_INTERVAL_MS || '100', 10);
        this.batchFlushInProgress = false;
        this.batchTimer = null;
        
        // Promise to track async initialization status
        this._initializationPromise = null;
        
        // Initialize with optimizations (skip if reusing existing connection)
        if (!this.usingExistingDb) {
            this._initializationPromise = this.initializeConnection();
        } else {
            // For existing connections, ensure required tables exist then start batch timer
            this._initializationPromise = this.ensureRequiredTablesAndStart();
        }
    }

    // Async initialization for reused connections
    async ensureRequiredTablesAndStart() {
        try {
            await this.ensureRequiredTables();
            this.startBatchTimer();
            this.logger.info('✅ Reusing existing database connection - tables verified');
        } catch (error) {
            this.logger.error('Failed to ensure required tables:', error);
            throw error; // Propagate error so caller knows initialization failed
        }
    }

    // Return promise that resolves when initialization is complete
    async waitForInitialization() {
        if (this._initializationPromise) {
            await this._initializationPromise;
        }
    }

    async initializeConnection() {
        try {
            // Ensure the underlying adapter is initialized (async)
            if (this.db && typeof this.db.init === 'function') {
                await this.db.init();
            }
            
            // Ensure required tables exist (PostgreSQL schema pre-initialized)
            await this.ensureRequiredTables();
            
            const driverInfo = this.db.getDriverInfo();
            this.logger.info(`Database initialized with ${driverInfo.type} (${driverInfo.performance})`);

            // Start batch flush timer after successful init
            this.startBatchTimer();
        } catch (error) {
            this.logger.error('Database initialization error:', error);
        }
    }

    startBatchTimer() {
        if (this.batchTimer) clearInterval(this.batchTimer);
        this.batchTimer = setInterval(() => {
            if (this.logBatch.length > 0) {
                this.flushLogBatch();
            }
        }, this.batchIntervalMs);
    }

    enqueueLogEntry(entry) {
        this.logBatch.push(entry);
        this.logger.debug(`Enqueued log entry. Batch size: ${this.logBatch.length}/${this.batchMaxSize}`);
        if (this.logBatch.length >= this.batchMaxSize) {
            this.logger.info(`Batch size threshold reached (${this.logBatch.length}), flushing...`);
            this.flushLogBatch();
        }
    }

    async flushLogBatch() {
        if (this.batchFlushInProgress) {
            this.logger.debug('Batch flush already in progress, skipping');
            return;
        }
        if (this.logBatch.length === 0) return;
        this.logger.info(`Starting batch flush for ${this.logBatch.length} entries...`);
        this.batchFlushInProgress = true;
        const batch = this.logBatch.splice(0, this.logBatch.length); // drain
        let successCount = 0;
        try {
            // PostgreSQL batch insert using async queries
            for (const e of batch) {
                const meta = this._serializeMetadata(e);
                const tags = this._serializeTags(e);
                try {
                    await this.db.run(
                        `INSERT INTO logs (timestamp, level, source, message, metadata, ip, user_id, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            e.timestamp || new Date().toISOString(),
                            e.level || 'info',
                            e.source || e.category || 'system',
                            e.message || '',
                            meta,
                            e.ip || e.clientIp || null,
                            e.user_id || e.userId || null,
                            tags
                        ]
                    );
                    successCount++;
                } catch (err) {
                    this.logger.error('Batch insert error:', err.message);
                }
            }
            if (this.metricsManager) {
                this.metricsManager.incrementBatchFlush();
                this.metricsManager.incrementBatchedInsert(successCount);
            }
            this.logger.info(`Batch flush completed: ${successCount}/${batch.length} entries written`);
        } catch (err) {
            this.logger.error(`Batch flush failed (${batch.length} entries):`, err.message);
            // Fallback: re-queue remaining entries for individual retry
            for (const e of batch) {
                try { await this.createLogEntry(e); successCount++; } catch { /* swallow */ }
            }
        } finally {
            this.batchFlushInProgress = false;
        }
    }

    _serializeMetadata(entry) {
        if (entry.metadata) return typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata);
        const derived = {};
        ['user_agent','country','region','city','timezone','coordinates','browser','os','device','device_id'].forEach(f => { if (entry[f] !== undefined) derived[f] = entry[f]; });
        return Object.keys(derived).length ? JSON.stringify(derived) : null;
    }

    _serializeTags(entry) {
        if (!entry.tags) return null;
        if (Array.isArray(entry.tags)) return entry.tags.join(',');
        if (typeof entry.tags === 'object') return Object.keys(entry.tags).join(',');
        return String(entry.tags);
    }

    // Ensure required tables exist (especially user_sessions which is critical for session tracking)
    async ensureRequiredTables() {
        // Skip table creation for PostgreSQL - schema already managed via postgres-schema.sql
        if (process.env.USE_POSTGRES === 'true' || process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
            this.logger.info('PostgreSQL detected - skipping table creation (schema pre-initialized)');
            return;
        }
        
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
            
            // Create encrypted_secrets table for secure credential storage
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS encrypted_secrets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key_name TEXT UNIQUE NOT NULL,
                    encrypted_value TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_accessed DATETIME,
                    metadata TEXT
                )
            `);
            
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_key 
                ON encrypted_secrets(key_name)
            `);

            // Resilience tables (Phase 1)
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS transaction_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_id TEXT UNIQUE NOT NULL,
                    operation_type TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    record_ids TEXT,
                    sql_statement TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    status TEXT DEFAULT 'pending',
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    user_id INTEGER,
                    ip_address TEXT
                )
            `);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_status ON transaction_log(status, started_at)`);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_table ON transaction_log(table_name, completed_at)`);

            await this.db.run(`
                CREATE TABLE IF NOT EXISTS failed_operations_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    operation_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    error_message TEXT,
                    error_code TEXT,
                    failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3,
                    next_retry_at DATETIME,
                    status TEXT DEFAULT 'queued',
                    resolved_at DATETIME,
                    priority INTEGER DEFAULT 5
                )
            `);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_failed_ops_retry ON failed_operations_queue(status, next_retry_at)`);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_failed_ops_priority ON failed_operations_queue(priority DESC, failed_at)`);

            await this.db.run(`
                CREATE TABLE IF NOT EXISTS system_error_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    error_category TEXT NOT NULL,
                    error_code TEXT,
                    error_message TEXT NOT NULL,
                    stack_trace TEXT,
                    affected_component TEXT,
                    affected_function TEXT,
                    severity TEXT DEFAULT 'error',
                    user_id INTEGER,
                    ip_address TEXT,
                    request_id TEXT,
                    recovery_attempted INTEGER DEFAULT 0,
                    recovery_successful INTEGER DEFAULT 0,
                    recovery_method TEXT,
                    resolved INTEGER DEFAULT 0,
                    resolved_at DATETIME,
                    resolved_by INTEGER,
                    occurrence_count INTEGER DEFAULT 1,
                    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_severity ON system_error_log(severity, resolved)`);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_category ON system_error_log(error_category, error_timestamp)`);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_occurrence ON system_error_log(error_code, occurrence_count)`);

            await this.db.run(`
                CREATE TABLE IF NOT EXISTS database_health_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    check_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    database_size_mb REAL,
                    table_count INTEGER,
                    total_records INTEGER,
                    logs_table_records INTEGER,
                    corruption_detected INTEGER DEFAULT 0,
                    integrity_check_passed INTEGER DEFAULT 1,
                    vacuum_last_run DATETIME,
                    backup_last_run DATETIME,
                    avg_query_time_ms REAL,
                    slow_queries_count INTEGER DEFAULT 0,
                    disk_space_available_mb REAL,
                    wal_size_mb REAL,
                    checks_performed TEXT
                )
            `);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_db_health_timestamp ON database_health_log(check_timestamp)`);
            
            // Alert rules table for managing alert definitions
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS alert_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    type TEXT NOT NULL DEFAULT 'pattern',
                    condition TEXT NOT NULL,
                    severity TEXT DEFAULT 'warning',
                    cooldown INTEGER DEFAULT 300,
                    enabled INTEGER DEFAULT 1,
                    channels TEXT DEFAULT '[]',
                    escalation_rules TEXT,
                    trigger_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled)`);
            await this.db.run(`CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON alert_rules(type)`);
            
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
        // PostgreSQL: Use ON CONFLICT DO NOTHING instead of INSERT OR IGNORE
        const sql = `INSERT INTO users (username, password_hash, email, role, created_at, is_active) 
                     VALUES ($1, $2, $3, $4, NOW(), $5)
                     ON CONFLICT (username) DO NOTHING`;
        const params = [userData.username, userData.password_hash, userData.email || null, userData.role || 'user', userData.is_active !== undefined ? userData.is_active : true];
        const result = await this.run(sql, params);
        // If no rows were affected (user already exists), return the existing user
        if (result && result.changes === 0) {
            return await this.getUserByUsername(userData.username);
        }
        return result;
    }

    async getUserById(userId) {
        const sql = `SELECT * FROM users WHERE id = $1`;
        return await this.get(sql, [userId]);
    }

    async getUserByUsername(username) {
        const sql = `SELECT * FROM users WHERE username = $1`;
        return await this.get(sql, [username]);
    }

    async getAllUsers() {
        const sql = `SELECT id, username, email, created_at, last_login, is_active FROM users ORDER BY created_at DESC`;
        return await this.all(sql);
    }

    async updateUser(userId, updates) {
        // Whitelist allowed fields to prevent SQL injection
        const allowedFields = ['username', 'email', 'password_hash', 'is_active', 'last_login', 'preferences', 'role'];
        const fields = Object.keys(updates).filter(field => allowedFields.includes(field));
        
        if (fields.length === 0) {
            throw new Error('No valid fields provided for update');
        }
        
        const values = fields.map(field => updates[field]);
        // PostgreSQL uses unquoted identifiers (or double quotes if needed)
        const setClause = fields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
        const sql = `UPDATE users SET ${setClause} WHERE id = $${fields.length + 1}`;
        return await this.run(sql, [...values, userId]);
    }

    async deleteUser(userId) {
        const sql = `DELETE FROM users WHERE id = $1`;
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
        const sql = `INSERT INTO roles (name, description, permissions, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())`;
        const perms = Array.isArray(roleData.permissions) ? JSON.stringify(roleData.permissions) : JSON.stringify([]);
        return await this.run(sql, [roleData.name, roleData.description || null, perms]);
    }

    async updateRole(roleId, updates) {
        const fields = [];
        const values = [];
        if (updates.name) { fields.push(`name = $${values.length + 1}`); values.push(updates.name); }
        if (updates.description !== undefined) { fields.push(`description = $${values.length + 1}`); values.push(updates.description); }
        if (updates.permissions) { fields.push(`permissions = $${values.length + 1}`); values.push(JSON.stringify(updates.permissions)); }
        if (!fields.length) throw new Error('No valid role fields to update');
        const sql = `UPDATE roles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length + 1}`;
        values.push(roleId);
        return await this.run(sql, values);
    }

    async deleteRole(roleId) {
        const sql = `DELETE FROM roles WHERE id = $1`;
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
            // Build metadata object
            let meta = null;
            if (entry.metadata) {
                meta = typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata);
            } else {
                const derived = {};
                ['user_agent','country','region','city','timezone','coordinates','browser','os','device','device_id'].forEach(f => {
                    if (entry[f] !== undefined) derived[f] = entry[f];
                });
                if (Object.keys(derived).length) meta = JSON.stringify(derived);
            }

            // Normalize tags
            let tags = null;
            if (entry.tags) {
                if (Array.isArray(entry.tags)) tags = entry.tags.join(',');
                else if (typeof entry.tags === 'object') tags = Object.keys(entry.tags).join(',');
                else tags = String(entry.tags);
            }

            // PostgreSQL async insert
            const result = await this.db.run(
                `INSERT INTO logs (timestamp, level, source, message, metadata, ip, user_id, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    entry.timestamp || new Date().toISOString(),
                    entry.level || 'info',
                    entry.source || entry.category || 'system',
                    entry.message || '',
                    meta,
                    entry.ip || entry.clientIp || null,
                    entry.user_id || entry.userId || null,
                    tags
                ]
            );
            
            return { changes: result.changes, lastID: result.lastID };
        } catch (error) {
            this.logger.error('Failed to create log entry:', error);
            // Queue for retry only if database is locked/busy
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('busy') || msg.includes('locked') || msg.includes('database is locked')) {
                if (this.metricsManager) this.metricsManager.incrementLockedInsert();
                // Retry with exponential backoff up to 3 attempts
                const delays = [10, 25, 50];
                for (let i = 0; i < delays.length; i++) {
                    await new Promise(r => setTimeout(r, delays[i]));
                    try {
                        return await this.createLogEntry({...entry, retryAttempt: (entry.retryAttempt||0)+1});
                    } catch (e2) {
                        if (i === delays.length - 1) {
                            if (this.metricsManager) this.metricsManager.incrementFailedInsert();
                            await this.logSystemError({
                                error_category: 'database',
                                error_code: 'LOG_INSERT_LOCK_FINAL',
                                error_message: e2.message,
                                stack_trace: e2.stack,
                                affected_component: 'DAL',
                                affected_function: 'createLogEntry'
                            });
                            throw e2;
                        } else {
                            if (this.metricsManager) this.metricsManager.incrementRetriedInsert();
                        }
                    }
                }
            } else {
                if (this.metricsManager) this.metricsManager.incrementFailedInsert();
                await this.logSystemError({
                    error_category: 'database',
                    error_code: 'LOG_INSERT_FAIL',
                    error_message: error.message,
                    stack_trace: error.stack,
                    affected_component: 'DAL',
                    affected_function: 'createLogEntry'
                });
                throw error;
            }
        }
    }

    // Integration docs methods
    async getIntegrationDoc(type) {
        try {
            const sql = `SELECT type, doc, updated_at FROM integration_docs WHERE type = $1`;
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
        const sql = `INSERT INTO integration_docs (type, doc, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT(type) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`;
        return await this.run(sql, [type, doc]);
    }

    // File ingestion offset persistence
    async getFileOffset(filePath) {
        try {
            const sql = `SELECT file_path, last_offset FROM file_ingestion_offsets WHERE file_path = $1`;
            return await this.get(sql, [filePath]);
        } catch (error) {
            this.logger.warn('Failed to get file offset:', error.message);
            return null;
        }
    }

    async setFileOffset(filePath, offset) {
        const sql = `INSERT INTO file_ingestion_offsets (file_path, last_offset, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT(file_path) DO UPDATE SET last_offset = excluded.last_offset, updated_at = excluded.updated_at`;
        return await this.run(sql, [filePath, offset]);
    }

    // Parse error recording (non-blocking notifications)
    async recordParseError(err) {
        try {
            const sql = `INSERT INTO parse_errors (source, file_path, line_number, line_snippet, reason, created_at, acknowledged) VALUES ($1, $2, $3, $4, $5, NOW(), false)`;
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
            // Only return unacknowledged notifications - acknowledged ones are "cleared"
            // Order by created_at DESC, then id DESC for deterministic ordering when timestamps are equal
            const sql = `SELECT id, source, file_path, line_number, line_snippet, reason, created_at, acknowledged FROM parse_errors WHERE acknowledged = FALSE ORDER BY created_at DESC, id DESC LIMIT $1`;
            return await this.all(sql, [limit]);
        } catch (error) {
            this.logger.warn('Failed to get recent parse errors:', error.message);
            return [];
        }
    }

    async getUnreadParseErrorCount() {
        try {
            const row = await this.get(`SELECT COUNT(*) as cnt FROM parse_errors WHERE acknowledged = FALSE`, []);
            return row?.cnt || 0;
        } catch (error) {
            this.logger.warn('Failed to count unread parse errors:', error.message);
            return 0;
        }
    }

    async acknowledgeParseError(id) {
        try {
            const sql = `UPDATE parse_errors SET acknowledged = TRUE WHERE id = $1 AND acknowledged = FALSE`;
            return await this.run(sql, [id]);
        } catch (error) {
            this.logger.warn('Failed to acknowledge parse error:', error.message);
            return { changes: 0 };
        }
    }

    async getLogEntries(filters = {}, limit = 100, offset = 0) {
        // Use specific columns instead of SELECT * for better performance
        let sql = `SELECT id, timestamp, level, source, message, device_id, severity FROM logs WHERE 1=1`;
        const params = [];
        
        if (filters.level) {
            sql += ` AND level = $${params.length + 1}`;
            params.push(filters.level);
        }
        
        if (filters.source) {
            sql += ` AND source = $${params.length + 1}`;
            params.push(filters.source);
        }
        
        if (filters.device_id) {
            sql += ` AND device_id = $${params.length + 1}`;
            params.push(filters.device_id);
        }
        
        if (filters.start_date) {
            sql += ` AND timestamp >= $${params.length + 1}`;
            params.push(filters.start_date);
        }
        
        if (filters.end_date) {
            sql += ` AND timestamp <= $${params.length + 1}`;
            params.push(filters.end_date);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }

    async getLogCount(filters = {}) {
        let sql = `SELECT COUNT(*) as count FROM logs WHERE 1=1`;
        const params = [];
        
        if (filters.level) {
            sql += ` AND level = $${params.length + 1}`;
            params.push(filters.level);
        }
        
        if (filters.source) {
            sql += ` AND source = $${params.length + 1}`;
            params.push(filters.source);
        }
        
        if (filters.device_id) {
            sql += ` AND device_id = $${params.length + 1}`;
            params.push(filters.device_id);
        }
        
        // Support date range filtering for analytics
        if (filters.start_date) {
            sql += ` AND date(timestamp) >= date($${params.length + 1})`;
            params.push(filters.start_date);
        }
        
        if (filters.end_date) {
            sql += ` AND date(timestamp) <= date($${params.length + 1})`;
            params.push(filters.end_date);
        }
        
        // Support time-based relative filters
        if (filters.since_hours) {
            sql += ` AND timestamp >= NOW() - INTERVAL '1 hour' * $${params.length + 1}`;
            params.push(filters.since_hours);
        }
        
        if (filters.since_days) {
            sql += ` AND timestamp >= NOW() - INTERVAL '1 day' * $${params.length + 1}`;
            params.push(filters.since_days);
        }
        
        const result = await this.get(sql, params);
        return result ? result.count : 0;
    }
    
    // Analytics: Get daily log trends for the past N days
    async getDailyLogTrends(days = 7) {
        const sql = `
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
            GROUP BY DATE(timestamp)
            ORDER BY date ASC
        `;
        return await this.all(sql, [days]);
    }
    
    // Analytics: Get hourly log distribution for the past N hours
    async getHourlyLogTrends(hours = 24) {
        const sql = `
            SELECT 
                TO_CHAR(DATE_TRUNC('hour', timestamp), 'YYYY-MM-DD HH24:00') as hour,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= NOW() - INTERVAL '1 hour' * $1
            GROUP BY DATE_TRUNC('hour', timestamp)
            ORDER BY hour ASC
        `;
        return await this.all(sql, [hours]);
    }
    
    // Analytics: Get weekly aggregation
    async getWeeklyLogTrends(weeks = 4) {
        const sql = `
            SELECT 
                TO_CHAR(DATE_TRUNC('week', timestamp), 'IYYY-IW') as week,
                COUNT(*) as count,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warnings
            FROM logs
            WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
            GROUP BY DATE_TRUNC('week', timestamp)
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
            WHERE timestamp >= NOW() - ($1 || ' days')::INTERVAL
            GROUP BY level
            ORDER BY count DESC
        `;
        return await this.all(sql, [days]);
    }

    // Dashboard widget methods
    async createDashboardWidget(widgetData) {
        const sql = `INSERT INTO dashboard_widgets (dashboard_id, type, title, config, position_x, position_y, width, height, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`;
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
        const sql = `SELECT * FROM dashboard_widgets WHERE dashboard_id = $1 ORDER BY position_y, position_x`;
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
        const setClause = validFields.map((field, idx) => `\`${field}\` = $${idx + 1}`).join(', ');
        const sql = `UPDATE dashboard_widgets SET ${setClause} WHERE id = $${validFields.length + 1}`;
        return await this.run(sql, [...validValues, widgetId]);
    }

    async deleteDashboardWidget(widgetId) {
        const sql = `DELETE FROM dashboard_widgets WHERE id = $1`;
        return await this.run(sql, [widgetId]);
    }

    // Device management methods
    async registerDevice(deviceData) {
        const sql = `INSERT INTO devices (id, name, type, status, last_seen, metadata) 
                     VALUES ($1, $2, $3, $4, NOW(), $5)
                     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status, last_seen = NOW(), metadata = EXCLUDED.metadata`;
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
        const sql = `SELECT * FROM devices WHERE id = $1`;
        return await this.get(sql, [deviceId]);
    }

    async getAllDevices() {
        const sql = `SELECT * FROM devices ORDER BY last_seen DESC`;
        return await this.all(sql);
    }

    async updateDeviceStatus(deviceId, status) {
        const sql = `UPDATE devices SET status = $1, last_seen = NOW() WHERE id = $2`;
        return await this.run(sql, [status, deviceId]);
    }

    // Cleanup and maintenance (deprecated - use the cleanup() at end of class)
    // This version is kept for backward compatibility but delegates to the main cleanup
    // Note: The main cleanup() method properly clears timers and flushes batches

    // System settings methods
    async getSetting(key, defaultValue = null) {
        try {
            const sql = `SELECT setting_value FROM system_settings WHERE setting_key = $1`;
            const result = await this.get(sql, [key]);
            return result ? result.setting_value : defaultValue;
        } catch (error) {
            this.logger.warn(`Failed to get setting ${key}:`, error.message);
            return defaultValue;
        }
    }

    async setSetting(key, value, description = null) {
        try {
            const sql = `INSERT INTO system_settings (setting_key, setting_value, description, updated_at) 
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (setting_key) 
                         DO UPDATE SET setting_value = EXCLUDED.setting_value, 
                                      description = EXCLUDED.description, 
                                      updated_at = NOW()`;
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
            const sql = `DELETE FROM system_settings WHERE setting_key = $1`;
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
                         VALUES ($1, $2, $3, $4, $5)`;
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
        const sql = `SELECT * FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()`;
        return await this.get(sql, [sessionToken]);
    }

    async deleteSession(sessionToken) {
        const sql = `DELETE FROM user_sessions WHERE session_token = $1`;
        return await this.run(sql, [sessionToken]);
    }

    async deactivateSession(sessionToken) {
        const sql = `UPDATE user_sessions SET is_active = 0, last_activity = NOW() WHERE session_token = $1`;
        return await this.run(sql, [sessionToken]);
    }

        async deleteSessionById(sessionId) {
            const sql = `DELETE FROM user_sessions WHERE id = $1`;
            return await this.run(sql, [sessionId]);
        }

    async cleanExpiredSessions() {
        const sql = `DELETE FROM user_sessions WHERE expires_at <= NOW()`;
        return await this.run(sql);
    }

    // Alert and notification methods
    async getAlertRules() {
        try {
            const sql = `SELECT * FROM alert_rules WHERE enabled = true ORDER BY priority DESC`;
            return await this.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get alert rules:', error.message);
            return [];
        }
    }

    async createAlertRule(ruleData) {
        // Handle both frontend format (conditions object) and direct conditions string
        const conditionsValue = typeof ruleData.conditions === 'object' 
            ? JSON.stringify(ruleData.conditions) 
            : (ruleData.conditions || '{}');
        
        const sql = `INSERT INTO alert_rules (name, description, type, conditions, severity, cooldown, 
                     enabled, channels, escalation_rules, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`;
        const params = [
            ruleData.name,
            ruleData.description || null,
            ruleData.type || 'pattern',
            conditionsValue,
            ruleData.severity || 'warning',
            ruleData.cooldown || 300,
            ruleData.enabled !== undefined ? (ruleData.enabled ? true : false) : true,
            ruleData.channels ? JSON.stringify(ruleData.channels) : '[]',
            ruleData.escalation_rules ? JSON.stringify(ruleData.escalation_rules) : null
        ];
        return await this.run(sql, params);
    }

    // System metrics methods  
    async recordMetric(metricName, value, metricType = 'gauge', tags = {}) {
        const sql = `INSERT INTO system_metrics (metric_name, metric_value, metric_type, tags, timestamp) 
                     VALUES ($1, $2, $3, $4, NOW())`;
        const params = [metricName, value, metricType, JSON.stringify(tags)];
        return await this.run(sql, params);
    }

    async getMetrics(metricName, startTime = null, endTime = null, limit = 1000) {
        let sql = `SELECT * FROM system_metrics WHERE metric_name = $1`;
        const params = [metricName];
        
        if (startTime) {
            sql += ` AND timestamp >= $2`;
            params.push(startTime);
        }
        
        if (endTime) {
            sql += ` AND timestamp <= $${params.length + 1}`;
            params.push(endTime);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
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
            const sql = `SELECT * FROM webhooks WHERE active = true ORDER BY created_at DESC`;
            return await this.db.all(sql);
        } catch (error) {
            this.logger.warn('Failed to get webhooks:', error.message);
            return [];
        }
    }

    async getWebhookById(webhookId) {
        try {
            const sql = `SELECT * FROM webhooks WHERE id = $1`;
            return await this.db.get(sql, [webhookId]);
        } catch (error) {
            this.logger.warn('Failed to get webhook by ID:', error.message);
            return null;
        }
    }

    async createWebhook(webhookData) {
        const sql = `INSERT INTO webhooks (name, url, method, headers, active, created_at) 
                     VALUES ($1, $2, $3, $4, $5, NOW())`;
        const params = [
            webhookData.name,
            webhookData.url,
            webhookData.method || 'POST',
            webhookData.headers ? JSON.stringify(webhookData.headers) : null,
            webhookData.active !== undefined ? webhookData.active : 1
        ];
        const result = await this.run(sql, params);
        // Return the created webhook object
        return {
            id: result.lastID,
            name: webhookData.name,
            url: webhookData.url,
            method: webhookData.method || 'POST',
            headers: webhookData.headers || null,
            active: webhookData.active !== undefined ? webhookData.active : 1
        };
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
            
            const sql = `UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = $${params.length}`;
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to update webhook:', error);
            throw error;
        }
    }

    async deleteWebhook(webhookId) {
        try {
            const sql = `DELETE FROM webhooks WHERE id = $1`;
            return await this.run(sql, [webhookId]);
        } catch (error) {
            this.logger.error('Failed to delete webhook:', error);
            throw error;
        }
    }

    async toggleWebhook(webhookId) {
        try {
            // Fetch current active state
            const row = await this.get(`SELECT id, active FROM webhooks WHERE id = $1`, [webhookId]);
            if (!row) {
                return { success: false, error: 'Webhook not found', id: Number(webhookId), enabled: false };
            }
            const newActive = row.active ? 0 : 1;
            await this.run(`UPDATE webhooks SET active = $1, updated_at = NOW() WHERE id = $2`, [newActive, webhookId]);
            return { success: true, id: Number(webhookId), enabled: Boolean(newActive) };
        } catch (error) {
            this.logger.error('Failed to toggle webhook:', error);
            return { success: false, error: error.message, id: Number(webhookId), enabled: false };
        }
    }

    async testWebhook(webhookId) {
        try {
            const webhook = await this.getWebhookById(webhookId);
            if (!webhook) {
                return { success: false, error: 'Webhook not found', id: Number(webhookId) };
            }

            const startTime = Date.now();
            const url = webhook.url;

            if (!url) {
                return { success: false, error: 'No URL configured', id: Number(webhookId) };
            }

            try {
                // Try HEAD request first (lighter)
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                
                let response = await fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal
                }).catch(() => null);
                clearTimeout(timeout);

                // If HEAD fails, try POST with test payload
                if (!response || !response.ok) {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            test: true,
                            source: 'logging-server',
                            timestamp: new Date().toISOString(),
                            message: 'Webhook connectivity test'
                        }),
                        signal: AbortSignal.timeout(5000)
                    }).catch(() => null);
                }

                const responseTime = Date.now() - startTime;

                // Update last_tested
                await this.run(
                    `UPDATE webhooks SET last_tested = NOW(), updated_at = NOW() WHERE id = $1`,
                    [webhookId]
                );

                if (response && (response.ok || response.status < 500)) {
                    return {
                        success: true,
                        id: Number(webhookId),
                        name: webhook.name,
                        message: 'Webhook is reachable',
                        status: response.status,
                        responseTime: `${responseTime}ms`,
                        testedAt: new Date().toISOString()
                    };
                }

                return {
                    success: false,
                    id: Number(webhookId),
                    name: webhook.name,
                    error: `Webhook returned status ${response?.status || 'unknown'}`,
                    responseTime: `${responseTime}ms`,
                    testedAt: new Date().toISOString()
                };
            } catch (fetchError) {
                return {
                    success: false,
                    id: Number(webhookId),
                    name: webhook.name,
                    error: `Connection failed: ${fetchError.message}`,
                    testedAt: new Date().toISOString()
                };
            }
        } catch (error) {
            this.logger.error('Failed to test webhook:', error);
            return { success: false, error: error.message, id: Number(webhookId) };
        }
    }

    async testWebhookData(webhookData) {
        try {
            const url = webhookData.url;
            if (!url) {
                return { success: false, error: 'No URL provided' };
            }

            const startTime = Date.now();

            try {
                const response = await fetch(url, {
                    method: webhookData.method || 'POST',
                    headers: {
                        'Content-Type': webhookData.content_type || 'application/json',
                        ...(webhookData.headers || {})
                    },
                    body: JSON.stringify({
                        test: true,
                        source: 'logging-server',
                        timestamp: new Date().toISOString(),
                        message: 'Webhook configuration test'
                    }),
                    signal: AbortSignal.timeout(5000)
                });

                const responseTime = Date.now() - startTime;

                if (response.ok || response.status < 500) {
                    return {
                        success: true,
                        message: 'Webhook URL is reachable',
                        status: response.status,
                        responseTime: `${responseTime}ms`,
                        testedAt: new Date().toISOString()
                    };
                }

                return {
                    success: false,
                    error: `Webhook returned status ${response.status}`,
                    status: response.status,
                    responseTime: `${responseTime}ms`,
                    testedAt: new Date().toISOString()
                };
            } catch (fetchError) {
                return {
                    success: false,
                    error: `Connection failed: ${fetchError.message}`,
                    testedAt: new Date().toISOString()
                };
            }
        } catch (error) {
            this.logger.error('Failed to test webhook data:', error);
            return { success: false, error: error.message };
        }
    }

    // Activity log methods
    async logActivity(activityData) {
        const sql = `INSERT INTO activity_log (user_id, action, resource_type, resource_id, 
                     details, ip_address, user_agent, timestamp) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`;
        
        // Handle details field - avoid double-stringifying
        let detailsValue = null;
        if (activityData.details) {
            if (typeof activityData.details === 'string') {
                // Already a string, use as-is
                detailsValue = activityData.details;
            } else {
                // Object, stringify it
                detailsValue = JSON.stringify(activityData.details);
            }
        }
        
        const params = [
            activityData.user_id,
            activityData.action,
            activityData.resource_type,
            activityData.resource_id,
            detailsValue,
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
        // JOIN with users table to get username, and map fields for display
        let sql = `
            SELECT 
                a.id,
                a.user_id,
                COALESCE(u.username, 'System') as username,
                a.action,
                a.resource_type as type,
                a.resource_id as target,
                a.details as metadata,
                a.ip_address,
                a.user_agent,
                a.created_at as timestamp
            FROM activity_log a
            LEFT JOIN users u ON a.user_id = u.id
        `;
        const params = [];
        
        if (userId) {
            sql += ` WHERE a.user_id = $1`;
            params.push(userId);
        }
        
        sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
            `;
            const result = await this.get(sql);
            
            // Get today's logs
            const todaySQL = `
                SELECT COUNT(*) as count
                FROM logs
                WHERE DATE(timestamp) = CURRENT_DATE
            `;
            const todayResult = await this.get(todaySQL);
            
            return {
                totalLogs: result?.totalLogs || 0,
                errorCount: result?.errorCount || 0,
                warningCount: result?.warningCount || 0,
                infoCount: result?.infoCount || 0,
                debugCount: result?.debugCount || 0,
                logsToday: todayResult?.count || 0
            };
        } catch (error) {
            this.logger.warn('Failed to get system stats:', error.message);
            return { totalLogs: 0, errorCount: 0, warningCount: 0, infoCount: 0, debugCount: 0, logsToday: 0 };
        }
    }

    async getRecentLogs(limit = 20) {
        try {
            const sql = `SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1`;
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
                // PostgreSQL: Get database size using pg_database_size()
                const sizeResult = await this.get(`SELECT pg_database_size(current_database()) as size`);
                dbSize = sizeResult ? Math.round(sizeResult.size / 1024 / 1024) : 0;
            } catch (error) {
                // Ignore errors getting DB size
            }
            
            // Calculate memory as percentage of actual system memory
            const memPercent = Math.min(Math.round((usedMem / totalMem) * 100), 100);
            
            // Calculate disk usage based on actual /app/data directory size
            // NOT the entire mounted filesystem (which can be misleading in Docker)
            let diskUsedMB = dbSize;
            let diskTotalMB = parseInt(process.env.DISK_QUOTA_MB) || 10240; // Default quota: 10GB, override with DISK_QUOTA_MB env var
            let diskPath = '/app/data';
            
            try {
                const { execSync } = require('child_process');
                // Get actual size of /app/data directory (not the entire mounted filesystem)
                const duOutput = execSync('du -sm /app/data 2>/dev/null || echo "0"', { encoding: 'utf8' }).trim();
                const actualUsedMB = parseInt(duOutput.split(/\s+/)[0]) || diskUsedMB;
                diskUsedMB = actualUsedMB;
                
                // Get available space on the mount point to provide accurate capacity
                const dfOutput = execSync('df -BM /app/data 2>/dev/null || echo "error"', { encoding: 'utf8' });
                if (!dfOutput.includes('error')) {
                    const lines = dfOutput.trim().split('\n');
                    if (lines.length > 1) {
                        const parts = lines[1].split(/\s+/);
                        // Format: Filesystem Size Used Available Use% Mounted
                        if (parts.length >= 6) {
                            const filesystemTotalMB = parseInt(parts[1].replace('M', '')) || 0;
                            const filesystemUsedMB = parseInt(parts[2].replace('M', '')) || 0;
                            const availableMB = parseInt(parts[3].replace('M', '')) || 0;
                            diskPath = parts[5] || '/app/data';
                            
                            // Use environment variable to decide behavior:
                            // - If DISK_QUOTA_MB is set: use that as the limit
                            // - Otherwise: show percentage of the logging directory relative to available space
                            if (!process.env.DISK_QUOTA_MB && availableMB > 0) {
                                // Dynamic: show how much space we're using out of what's available to grow into
                                diskTotalMB = diskUsedMB + availableMB;
                            }
                            // If DISK_QUOTA_MB is set, it takes precedence (keeps diskTotalMB from line 1094)
                        }
                    }
                }
            } catch (error) {
                // Fallback to database size only if commands fail
                diskUsedMB = dbSize;
            }
            const diskPercent = Math.min(Math.round((diskUsedMB / diskTotalMB) * 100), 100);
            
            return {
                status: 'healthy',
                uptime: Math.round(uptime),
                memory: memPercent,
                cpu: cpuPercent,
                disk: diskPercent,
                // Detailed disk metrics (logging data directory focus)
                diskUsedMB,
                diskTotalMB,
                diskPath: '/app/data',
                diskMethod: 'du+df',
                memoryMB: memUsedMB,
                databaseSizeMB: dbSize,
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
                WHERE timestamp >= (NOW() - INTERVAL '24 hours')
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
            const sql = `SELECT * FROM logs WHERE level = $1 ORDER BY timestamp DESC LIMIT $2`;
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
                    TO_CHAR(timestamp, 'YYYY-MM-DD HH24:00:00') as hour,
                    level,
                    COUNT(*) as count
                FROM logs 
                WHERE timestamp >= NOW() - ($1 || ' hours')::INTERVAL
                GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD HH24:00:00'), level
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
                WHERE level = 'error' AND timestamp >= (NOW() - INTERVAL '24 hours')
                GROUP BY message 
                ORDER BY count DESC 
                LIMIT $1
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
            const sql = `SELECT a.*, u.username, a.created_at as timestamp
                         FROM activity_log a 
                         LEFT JOIN users u ON a.user_id = u.id
                         WHERE a.id = $1`;
            return await this.db.get(sql, [activityId]);
        } catch (error) {
            this.logger.warn('Failed to get activity by ID:', error.message);
            return null;
        }
    }

    async getActivitiesSince(timestamp) {
        try {
            const sql = `SELECT a.*, u.username, a.created_at as timestamp
                         FROM activity_log a 
                         LEFT JOIN users u ON a.user_id = u.id
                         WHERE a.created_at >= $1 
                         ORDER BY a.created_at DESC`;
            return await this.db.all(sql, [timestamp]);
        } catch (error) {
            this.logger.warn('Failed to get activities since timestamp:', error.message);
            return [];
        }
    }

    async getAllActivity(filters = {}) {
        try {
            let sql = `SELECT a.*, u.username, a.created_at as timestamp
                       FROM activity_log a 
                       LEFT JOIN users u ON a.user_id = u.id
                       WHERE 1=1`;
            const params = [];

            if (filters.user_id) {
                sql += ` AND a.user_id = $${params.length + 1}`;
                params.push(filters.user_id);
            }
            if (filters.action) {
                sql += ` AND a.action = $${params.length + 1}`;
                params.push(filters.action);
            }
            if (filters.resource_type) {
                sql += ` AND a.resource_type = $${params.length + 1}`;
                params.push(filters.resource_type);
            }
            if (filters.start_date) {
                sql += ` AND a.created_at >= $${params.length + 1}`;
                params.push(filters.start_date);
            }
            if (filters.end_date) {
                sql += ` AND a.created_at <= $${params.length + 1}`;
                params.push(filters.end_date);
            }

            sql += ` ORDER BY a.created_at DESC`;
            
            if (filters.limit) {
                sql += ` LIMIT $${params.length + 1}`;
                params.push(filters.limit);
            }

            return await this.db.all(sql, params);
        } catch (error) {
            this.logger.warn('Failed to get all activity:', error.message);
            return [];
        }
    }

    async exportActivities(filters = {}) {
        try {
            let sql = `SELECT a.*, u.username, a.resource_type as resource, a.created_at as timestamp
                       FROM activity_log a 
                       LEFT JOIN users u ON a.user_id = u.id
                       WHERE 1=1`;
            const params = [];

            if (filters.user_id) {
                sql += ` AND a.user_id = $${params.length + 1}`;
                params.push(filters.user_id);
            }
            if (filters.action) {
                sql += ` AND a.action = $${params.length + 1}`;
                params.push(filters.action);
            }
            if (filters.resource_type) {
                sql += ` AND a.resource_type = $${params.length + 1}`;
                params.push(filters.resource_type);
            }
            if (filters.start_date) {
                sql += ` AND a.created_at >= $${params.length + 1}`;
                params.push(filters.start_date);
            }
            if (filters.end_date) {
                sql += ` AND a.created_at <= $${params.length + 1}`;
                params.push(filters.end_date);
            }

            sql += ` ORDER BY a.created_at DESC`;
            
            if (filters.limit) {
                sql += ` LIMIT $${params.length + 1}`;
                params.push(parseInt(filters.limit));
            }

            return await this.db.all(sql, params);
        } catch (error) {
            this.logger.warn('Failed to export activities:', error.message);
            return [];
        }
    }

    // Saved search methods
    async createSavedSearch(searchData) {
        try {
            const sql = `INSERT INTO saved_searches (user_id, name, query, filters, created_at) 
                         VALUES ($1, $2, $3, $4, NOW())`;
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
            const sql = `SELECT * FROM saved_searches WHERE id = $1 AND user_id = $2`;
            return await this.db.get(sql, [searchId, userId]);
        } catch (error) {
            this.logger.warn('Failed to get saved search:', error.message);
            return null;
        }
    }

    async getSavedSearches(userId) {
        try {
            const sql = userId 
                ? `SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`
                : `SELECT * FROM saved_searches ORDER BY created_at DESC`;
            const params = userId ? [userId] : [];
            return await this.db.all(sql, params);
        } catch (error) {
            this.logger.warn('Failed to get saved searches:', error.message);
            return [];
        }
    }

    async deleteSavedSearch(searchId, userId) {
        try {
            const sql = `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`;
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
            const sql = `SELECT * FROM integrations WHERE id = $1`;
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
                `SELECT id FROM integrations WHERE name = $1`,
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
                         VALUES ($1, $2, $3, $4, $5, NOW())`;
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
                setClauses.push(`name = $${params.length + 1}`);
                params.push(updates.name);
            }
            if (updates.type !== undefined) {
                setClauses.push(`type = $${params.length + 1}`);
                params.push(updates.type);
            }
            if (updates.config !== undefined) {
                setClauses.push(`config = $${params.length + 1}`);
                // Config may already be stringified by the route handler
                params.push(typeof updates.config === 'string' 
                    ? updates.config 
                    : JSON.stringify(updates.config));
            }
            if (updates.enabled !== undefined) {
                setClauses.push(`enabled = $${params.length + 1}`);
                params.push(updates.enabled);
                // Keep status in sync with enabled
                setClauses.push(`status = $${params.length + 1}`);
                params.push(updates.enabled ? 'enabled' : 'disabled');
            }
            if (updates.status !== undefined && updates.enabled === undefined) {
                // If status provided independently, infer enabled when not explicitly set
                const normalized = String(updates.status).toLowerCase();
                const inferredEnabled = normalized === 'enabled' || normalized === 'active' ? 1 : 0;
                setClauses.push(`status = $${params.length + 1}`);
                params.push(updates.status);
                setClauses.push(`enabled = $${params.length + 1}`);
                params.push(inferredEnabled);
            }
            
            if (setClauses.length === 0) {
                this.logger.warn('No fields to update for integration');
                return { changes: 0 };
            }
            
            setClauses.push('updated_at = datetime(\'now\')');
            params.push(integrationId);
            
            const sql = `UPDATE integrations SET ${setClauses.join(', ')} WHERE id = $${params.length}`;
            return await this.run(sql, params);
        } catch (error) {
            this.logger.error('Failed to update integration:', error);
            throw error;
        }
    }

    async deleteIntegration(integrationId) {
        try {
            const sql = `DELETE FROM integrations WHERE id = $1`;
            return await this.run(sql, [integrationId]);
        } catch (error) {
            this.logger.error('Failed to delete integration:', error);
            throw error;
        }
    }

    async toggleIntegration(integrationId) {
        try {
            const row = await this.get(`SELECT id, enabled FROM integrations WHERE id = $1`, [integrationId]);
            if (!row) {
                return { success: false, error: 'Integration not found', id: Number(integrationId), enabled: false };
            }
            const newEnabled = row.enabled ? 0 : 1;
            const newStatus = newEnabled ? 'enabled' : 'disabled';
            await this.run(`UPDATE integrations SET enabled = $1, status = $2, updated_at = NOW() WHERE id = $3`, [newEnabled, newStatus, integrationId]);
            return { success: true, id: Number(integrationId), enabled: Boolean(newEnabled) };
        } catch (error) {
            this.logger.error('Failed to toggle integration:', error);
            return { success: false, error: error.message, id: Number(integrationId), enabled: false };
        }
    }

    async testIntegration(integrationId) {
        try {
            // Fetch integration details
            const integration = await this.getIntegration(integrationId);
            if (!integration) {
                return { success: false, error: 'Integration not found', id: Number(integrationId) };
            }

            // Parse config if stored as string
            let config = integration.config;
            if (typeof config === 'string') {
                try {
                    config = JSON.parse(config);
                } catch (e) {
                    config = {};
                }
            }

            const type = (integration.type || '').toLowerCase();
            const startTime = Date.now();
            let testResult = { success: false, message: '', details: {} };

            // Test based on integration type
            switch (type) {
                case 'webhook':
                    testResult = await this._testWebhookIntegration(config);
                    break;
                case 'homeassistant':
                case 'home_assistant':
                    testResult = await this._testHomeAssistantIntegration(config);
                    break;
                case 'mqtt':
                    testResult = await this._testMqttIntegration(config);
                    break;
                case 'slack':
                case 'discord':
                case 'teams':
                case 'telegram':
                case 'pushover':
                    testResult = await this._testWebhookBasedIntegration(type, config);
                    break;
                case 'elasticsearch':
                case 'influxdb':
                case 'grafana':
                case 'prometheus':
                case 'splunk':
                    testResult = await this._testDatabaseIntegration(type, config);
                    break;
                default:
                    // Generic test - just verify config exists
                    testResult = {
                        success: true,
                        message: `Integration '${integration.name}' configuration valid`,
                        details: { type, hasConfig: Object.keys(config).length > 0 }
                    };
            }

            const responseTime = Date.now() - startTime;

            // Update status and last_tested timestamp based on test result
            const newStatus = testResult.success ? 'enabled' : 'error';
            
            // Log the test result for debugging
            console.log(`[TEST] Integration ${integrationId}: ${testResult.success ? 'SUCCESS' : 'FAILED'} - ${testResult.message}`);
            console.log(`[TEST] Updating status to: ${newStatus}`);
            
            await this.run(
                `UPDATE integrations 
                 SET status = $1,
                     last_sync = CASE WHEN $2 = 1 THEN NOW() ELSE last_sync END,
                     error_count = CASE WHEN $3 = 0 THEN error_count + 1 ELSE 0 END,
                     last_error = CASE WHEN $4 = 0 THEN $5 ELSE NULL END,
                     updated_at = NOW() 
                 WHERE id = $6`,
                [newStatus, testResult.success ? 1 : 0, testResult.success ? 1 : 0, testResult.success ? 1 : 0, testResult.message || '', integrationId]
            );

            return {
                success: testResult.success,
                id: Number(integrationId),
                name: integration.name,
                type: integration.type,
                message: testResult.message,
                details: testResult.details,
                responseTime: `${responseTime}ms`,
                testedAt: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to test integration:', error);
            return { 
                success: false, 
                error: error.message, 
                id: Number(integrationId) 
            };
        }
    }

    // Helper: Test webhook integration
    async _testWebhookIntegration(config) {
        const url = config.url || config.webhook_url;
        if (!url) {
            return { success: false, message: 'No webhook URL configured', details: {} };
        }
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            }).catch(() => null);
            clearTimeout(timeout);
            
            if (response && response.ok) {
                return { success: true, message: 'Webhook URL reachable', details: { status: response.status } };
            }
            // Try with GET if HEAD fails
            const getResponse = await fetch(url, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            }).catch(() => null);
            
            if (getResponse) {
                return { 
                    success: getResponse.ok || getResponse.status < 500, 
                    message: getResponse.ok ? 'Webhook URL reachable' : `Webhook returned status ${getResponse.status}`,
                    details: { status: getResponse.status } 
                };
            }
            return { success: false, message: 'Webhook URL unreachable', details: {} };
        } catch (error) {
            return { success: false, message: `Connection failed: ${error.message}`, details: {} };
        }
    }

    // Helper: Test Home Assistant integration
    async _testHomeAssistantIntegration(config) {
        const url = config.url || config.ha_url;
        const token = config.token || config.access_token;
        if (!url) {
            return { success: false, message: 'No Home Assistant URL configured', details: {} };
        }
        try {
            const apiUrl = url.replace(/\/$/, '') + '/api/';
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                return { 
                    success: true, 
                    message: 'Connected to Home Assistant', 
                    details: { version: data.version || 'unknown' } 
                };
            }
            return { 
                success: false, 
                message: `Home Assistant returned ${response.status}`, 
                details: { status: response.status } 
            };
        } catch (error) {
            return { success: false, message: `Connection failed: ${error.message}`, details: {} };
        }
    }

    // Helper: Test MQTT integration
    async _testMqttIntegration(config) {
        const host = config.host || config.broker || config.url;
        if (!host) {
            return { success: false, message: 'No MQTT broker configured', details: {} };
        }
        // Basic validation - actual MQTT connection would require mqtt library
        return { 
            success: true, 
            message: 'MQTT configuration valid (broker connectivity requires runtime test)',
            details: { host, port: config.port || 1883 }
        };
    }

    // Helper: Test webhook-based notification services
    async _testWebhookBasedIntegration(type, config) {
        const url = config.url || config.webhook_url || config.webhook;
        if (!url) {
            return { success: false, message: `No ${type} webhook URL configured`, details: {} };
        }
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Test message from Logging Server' }),
                signal: AbortSignal.timeout(5000)
            }).catch(() => null);
            
            if (response && (response.ok || response.status < 500)) {
                return { success: true, message: `${type} webhook reachable`, details: { status: response.status } };
            }
            return { success: false, message: `${type} webhook test failed`, details: { status: response?.status } };
        } catch (error) {
            return { success: false, message: `Connection failed: ${error.message}`, details: {} };
        }
    }

    // Helper: Test database/metrics integrations
    async _testDatabaseIntegration(type, config) {
        const url = config.url || config.host || config.endpoint;
        if (!url) {
            return { success: false, message: `No ${type} URL configured`, details: {} };
        }
        try {
            const testUrl = url.replace(/\/$/, '');
            const response = await fetch(testUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            }).catch(() => null);
            
            if (response && (response.ok || response.status < 500)) {
                return { success: true, message: `${type} endpoint reachable`, details: { status: response.status } };
            }
            return { success: false, message: `${type} endpoint unreachable`, details: { status: response?.status } };
        } catch (error) {
            return { success: false, message: `Connection failed: ${error.message}`, details: {} };
        }
    }

    async getIntegrationDocs(integrationType) {
        // Return documentation for specific integration type
        // This would typically come from a docs table or be hardcoded
        try {
            const sql = `SELECT * FROM integration_docs WHERE type = $1`;
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

            // Text search - check message OR source for match
            if (query) {
                if (regex) {
                    // PostgreSQL regex support with ~ operator
                    const regexOp = caseSensitive ? '~' : '~*';
                    sql += ` AND (message ${regexOp} $${params.length + 1} OR source ${regexOp} $${params.length + 2})`;
                    params.push(query, query);
                } else {
                    // Use ILIKE for case-insensitive, LIKE for case-sensitive
                    const likeOp = caseSensitive ? 'LIKE' : 'ILIKE';
                    sql += ` AND (message ${likeOp} $${params.length + 1} OR source ${likeOp} $${params.length + 2})`;
                    params.push(`%${query}%`, `%${query}%`);
                }
            }

            // Level filter
            if (level) {
                sql += ` AND level = $${params.length + 1}`;
                params.push(level);
            }

            // Source filter
            if (source) {
                sql += ` AND source = $${params.length + 1}`;
                params.push(source);
            }

            // Date range
            if (startDate) {
                sql += ` AND timestamp >= $${params.length + 1}`;
                params.push(startDate);
            }
            if (endDate) {
                sql += ` AND timestamp <= $${params.length + 1}`;
                params.push(endDate);
            }

            // Get total count
            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
            const countResult = await this.get(countSql, params);
            const total = countResult?.count || 0;

            // Add ordering and pagination
            sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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

    // Encrypted secrets management
    async storeEncryptedSecret(keyName, encryptedValue, metadata = null) {
        try {
            const existing = await this.get(
                `SELECT id FROM encrypted_secrets WHERE key_name = $1`,
                [keyName]
            );
            
            if (existing) {
                // Update existing
                await this.run(
                    `UPDATE encrypted_secrets SET encrypted_value = $1, updated_at = NOW(), metadata = $2 WHERE key_name = $3`,
                    [encryptedValue, metadata ? JSON.stringify(metadata) : null, keyName]
                );
            } else {
                // Insert new
                await this.run(
                    `INSERT INTO encrypted_secrets (key_name, encrypted_value, metadata) VALUES ($1, $2, $3)`,
                    [keyName, encryptedValue, metadata ? JSON.stringify(metadata) : null]
                );
            }
            return { success: true };
        } catch (error) {
            this.logger.error('Failed to store encrypted secret:', error);
            throw error;
        }
    }

    async getEncryptedSecret(keyName) {
        try {
            const result = await this.get(
                `SELECT encrypted_value, metadata, created_at, updated_at FROM encrypted_secrets WHERE key_name = $1`,
                [keyName]
            );
            
            if (result) {
                // Update last_accessed timestamp
                await this.run(
                    `UPDATE encrypted_secrets SET last_accessed = NOW() WHERE key_name = $1`,
                    [keyName]
                );
                
                return {
                    encryptedValue: result.encrypted_value,
                    metadata: result.metadata ? JSON.parse(result.metadata) : null,
                    createdAt: result.created_at,
                    updatedAt: result.updated_at
                };
            }
            return null;
        } catch (error) {
            this.logger.error('Failed to retrieve encrypted secret:', error);
            throw error;
        }
    }

    async deleteEncryptedSecret(keyName) {
        try {
            await this.run(`DELETE FROM encrypted_secrets WHERE key_name = $1`, [keyName]);
            return { success: true };
        } catch (error) {
            this.logger.error('Failed to delete encrypted secret:', error);
            throw error;
        }
    }

    async listEncryptedSecretKeys() {
        try {
            const results = await this.all(
                `SELECT key_name, created_at, updated_at, last_accessed FROM encrypted_secrets ORDER BY key_name`
            );
            return results || [];
        } catch (error) {
            this.logger.error('Failed to list encrypted secret keys:', error);
            return [];
        }
    }

    // Cleanup and maintenance
    async cleanup() {
        // Clear batch timer to prevent memory leaks
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        // Flush any pending log entries before closing
        if (this.logBatch && this.logBatch.length > 0) {
            try {
                await this.flushLogBatch();
            } catch (e) {
                this.logger.warn('Failed to flush log batch during cleanup:', e.message);
            }
        }
        if (this.db) {
            this.db.close();
        }
    }

    // ===== Resilience Helper Methods =====
    async logTransaction(entry) {
        try {
            const {
                transaction_id,
                operation_type,
                table_name,
                record_ids,
                sql_statement,
                status = 'pending',
                error_message = null,
                retry_count = 0,
                user_id = null,
                ip_address = null
            } = entry;
            return await this.run(`
                INSERT INTO transaction_log (
                    transaction_id, operation_type, table_name, record_ids, sql_statement,
                    status, error_message, retry_count, user_id, ip_address
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [transaction_id, operation_type, table_name, record_ids ? JSON.stringify(record_ids) : null, sql_statement, status, error_message, retry_count, user_id, ip_address]);
        } catch (error) {
            this.logger.error('Failed to log transaction:', error);
            throw error;
        }
    }

    async updateTransactionStatus(transaction_id, status, error_message = null) {
        try {
            await this.run(`UPDATE transaction_log SET status = $1, error_message = $2, completed_at = NOW() WHERE transaction_id = $3`, [status, error_message, transaction_id]);
        } catch (error) {
            this.logger.error('Failed to update transaction status:', error);
        }
    }

    async queueFailedOperation(op) {
        try {
            const {
                operation_type,
                payload,
                error_message = null,
                error_code = null,
                retry_count = 0,
                max_retries = 3,
                next_retry_at = new Date(Date.now() + 60_000).toISOString(),
                status = 'queued',
                priority = 5
            } = op;
            return await this.run(`
                INSERT INTO failed_operations_queue (
                    operation_type, payload, error_message, error_code, retry_count, max_retries,
                    next_retry_at, status, priority
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [operation_type, JSON.stringify(payload), error_message, error_code, retry_count, max_retries, next_retry_at, status, priority]);
        } catch (error) {
            this.logger.error('Failed to queue failed operation:', error);
        }
    }

    async fetchRetryableFailedOperations(limit = 20) {
        try {
            const nowIso = new Date().toISOString();
            return await this.all(`
                SELECT * FROM failed_operations_queue 
                WHERE status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= $1) 
                ORDER BY priority ASC, failed_at ASC LIMIT $2
            `, [nowIso, limit]);
        } catch (error) {
            this.logger.error('Failed to fetch retryable failed operations:', error);
            return [];
        }
    }

    async markFailedOperation(id, fields) {
        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
            sets.push(`${k} = $${params.length + 1}`);
            params.push(v);
        }
        params.push(id);
        await this.run(`UPDATE failed_operations_queue SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }

    async logSystemError(entry) {
        try {
            const {
                error_category,
                error_code,
                error_message,
                stack_trace = null,
                affected_component = null,
                affected_function = null,
                severity = 'error',
                user_id = null,
                ip_address = null,
                request_id = null
            } = entry;
            return await this.run(`
                INSERT INTO system_error_log (
                    error_category, error_code, error_message, stack_trace, affected_component,
                    affected_function, severity, user_id, ip_address, request_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [error_category, error_code, error_message, stack_trace, affected_component, affected_function, severity, user_id, ip_address, request_id]);
        } catch (error) {
            this.logger.error('Failed to log system error:', error);
        }
    }

    async logDatabaseHealthSnapshot(snapshot) {
        try {
            const {
                database_size_mb = null,
                table_count = null,
                total_records = null,
                logs_table_records = null,
                corruption_detected = 0,
                integrity_check_passed = 1,
                vacuum_last_run = null,
                backup_last_run = null,
                avg_query_time_ms = null,
                slow_queries_count = 0,
                disk_space_available_mb = null,
                wal_size_mb = null,
                checks_performed = null
            } = snapshot;
            return await this.run(`
                INSERT INTO database_health_log (
                    database_size_mb, table_count, total_records, logs_table_records,
                    corruption_detected, integrity_check_passed, vacuum_last_run, backup_last_run,
                    avg_query_time_ms, slow_queries_count, disk_space_available_mb, wal_size_mb, checks_performed
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [database_size_mb, table_count, total_records, logs_table_records, corruption_detected, integrity_check_passed, vacuum_last_run, backup_last_run, avg_query_time_ms, slow_queries_count, disk_space_available_mb, wal_size_mb, checks_performed ? JSON.stringify(checks_performed) : null]);
        } catch (error) {
            this.logger.error('Failed to log database health snapshot:', error);
        }
    }
}

module.exports = DatabaseAccessLayer;