/**
 * Dual Database Access Layer
 * Enhanced Universal Logging Platform - Better-SQLite3 Integration
 * 
 * This module provides seamless switching between sqlite3 and better-sqlite3
 * with automatic performance optimization for Docker environments
 */

const fs = require('fs');
const path = require('path');

class DualDatabaseManager {
    constructor(options = {}) {
        this.config = {
            // Database configuration
            useBetterSQLite3: options.useBetterSQLite3 ?? true,
            fallbackToSQLite3: options.fallbackToSQLite3 ?? true,
            dbPath: options.dbPath ?? path.join(__dirname, 'data', 'databases', 'logging.db'),
            betterDbPath: options.betterDbPath ?? path.join(__dirname, 'data', 'databases', 'logging-better.db'),
            
            // Performance settings
            enableWAL: options.enableWAL ?? true,
            cacheSize: options.cacheSize ?? 64000, // 64MB
            maxConnections: options.maxConnections ?? 10,
            
            // Migration settings
            autoMigrate: options.autoMigrate ?? true,
            migrationTimeout: options.migrationTimeout ?? 300000, // 5 minutes
        };
        
        this.db = null;
        this.dbType = null;
        this.isReady = false;
        this.stats = {
            queries: 0,
            inserts: 0,
            selects: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        this.preparedStatements = new Map();
    }

    /**
     * Initialize database connection with automatic fallback
     */
    async initialize() {
        console.log('🔌 Initializing dual database manager...');
        
        try {
            if (this.config.useBetterSQLite3) {
                await this.initializeBetterSQLite3();
            } else {
                await this.initializeSQLite3();
            }
            
            await this.prepareCommonStatements();
            this.isReady = true;
            
            console.log(`✅ Database initialized: ${this.dbType}`);
            return this.db;
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            
            if (this.config.fallbackToSQLite3 && this.dbType !== 'sqlite3') {
                console.log('🔄 Falling back to sqlite3...');
                await this.initializeSQLite3();
                await this.prepareCommonStatements();
                this.isReady = true;
                return this.db;
            }
            
            throw error;
        }
    }

    /**
     * Initialize better-sqlite3 with optimized settings
     */
    async initializeBetterSQLite3() {
        try {
            const Database = require('better-sqlite3');
            
            // Ensure database directory exists
            const dbDir = path.dirname(this.config.betterDbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            
            this.db = new Database(this.config.betterDbPath, {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null,
                fileMustExist: false
            });
            
            // Apply performance optimizations
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma(`cache_size = -${this.config.cacheSize}`);
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma('mmap_size = 134217728'); // 128MB
            
            this.dbType = 'better-sqlite3';
            
            console.log('⚡ Better-sqlite3 initialized with performance optimizations');
            
        } catch (error) {
            console.error('❌ Better-sqlite3 initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize traditional sqlite3 as fallback
     */
    async initializeSQLite3() {
        return new Promise((resolve, reject) => {
            try {
                const sqlite3 = require('sqlite3').verbose();
                
                // Ensure database directory exists
                const dbDir = path.dirname(this.config.dbPath);
                if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                }
                
                this.db = new sqlite3.Database(this.config.dbPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.dbType = 'sqlite3';
                        
                        // Apply basic optimizations
                        if (this.config.enableWAL) {
                            this.db.run('PRAGMA journal_mode = WAL');
                        }
                        this.db.run('PRAGMA synchronous = NORMAL');
                        // Sanitize cache size to prevent SQL injection
                        const safeCacheSize = parseInt(this.config.cacheSize) || 64000;
                        this.db.run(`PRAGMA cache_size = -${safeCacheSize}`);
                        
                        console.log('📊 SQLite3 initialized with basic optimizations');
                        resolve();
                    }
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Prepare common SQL statements for better performance
     */
    async prepareCommonStatements() {
        console.log('⚡ Preparing optimized SQL statements...');
        
        const statements = {
            // Log operations
            insertLog: `INSERT INTO logs (timestamp, level, message, source, node_id, flow_id, context, metadata)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            
            selectRecentLogs: `SELECT * FROM logs 
                              WHERE created_at > datetime('now', '-1 hour')
                              ORDER BY created_at DESC LIMIT ?`,
            
            selectLogsByLevel: `SELECT * FROM logs 
                               WHERE level = ? AND created_at > datetime('now', '-24 hours')
                               ORDER BY created_at DESC`,
            
            selectLogsByDateRange: `SELECT * FROM logs 
                                   WHERE created_at BETWEEN ? AND ?
                                   ORDER BY created_at DESC`,
            
            selectLogsBySource: `SELECT * FROM logs 
                                WHERE source = ? AND created_at > datetime('now', '-24 hours')
                                ORDER BY created_at DESC`,
            
            // Analytics queries
            getLogCounts: `SELECT 
                          COUNT(*) as total,
                          SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                          SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warnings,
                          SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info,
                          SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debug
                          FROM logs 
                          WHERE created_at > datetime('now', '-1 hour')`,
            
            getSourceStats: `SELECT source, COUNT(*) as count, MAX(created_at) as last_seen
                            FROM logs 
                            WHERE created_at > datetime('now', '-24 hours')
                            GROUP BY source 
                            ORDER BY count DESC`,
            
            // Maintenance queries
            deleteOldLogs: `DELETE FROM logs WHERE created_at < datetime('now', '-30 days')`,
            
            getDatabaseInfo: `SELECT 
                             COUNT(*) as total_logs,
                             MIN(created_at) as oldest_log,
                             MAX(created_at) as newest_log
                             FROM logs`
        };
        
        if (this.dbType === 'better-sqlite3') {
            // Prepare statements for better-sqlite3
            for (const [name, sql] of Object.entries(statements)) {
                this.preparedStatements.set(name, this.db.prepare(sql));
            }
        }
        // For sqlite3, we'll prepare statements on-demand due to different API
        
        console.log(`✅ Prepared ${Object.keys(statements).length} optimized statements`);
    }

    /**
     * Execute query with automatic statement preparation and caching
     */
    async query(sql, params = [], options = {}) {
        if (!this.isReady) {
            throw new Error('Database not initialized');
        }
        
        this.stats.queries++;
        
        try {
            if (this.dbType === 'better-sqlite3') {
                // better-sqlite3 is synchronous - no await needed
                return this.executeBetterSQLite3Query(sql, params, options);
            } else {
                // sqlite3 is asynchronous - await needed
                return await this.executeSQLite3Query(sql, params, options);
            }
        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Query failed (${this.dbType}):`, error);
            throw error;
        }
    }

    /**
     * Execute query using better-sqlite3
     */
    async executeBetterSQLite3Query(sql, params, options) {
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
        
        if (isSelect) {
            this.stats.selects++;
            
            if (options.single) {
                return this.db.prepare(sql).get(...params);
            } else {
                return this.db.prepare(sql).all(...params);
            }
        } else {
            this.stats.inserts++;
            return this.db.prepare(sql).run(...params);
        }
    }

    /**
     * Execute query using sqlite3
     */
    async executeSQLite3Query(sql, params, options) {
        return new Promise((resolve, reject) => {
            const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
            
            if (isSelect) {
                this.stats.selects++;
                
                if (options.single) {
                    this.db.get(sql, params, (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                } else {
                    this.db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                }
            } else {
                this.stats.inserts++;
                
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ 
                        lastID: this.lastID, 
                        changes: this.changes 
                    });
                });
            }
        });
    }

    /**
     * High-performance batch insert
     */
    async batchInsert(tableName, records, options = {}) {
        if (!this.isReady || !records.length) return;
        
        console.log(`📊 Batch inserting ${records.length} records to ${tableName}...`);
        
        if (this.dbType === 'better-sqlite3') {
            // better-sqlite3 batch insert is synchronous
            return this.betterSQLite3BatchInsert(tableName, records, options);
        } else {
            // sqlite3 batch insert is asynchronous
            return await this.sqlite3BatchInsert(tableName, records, options);
        }
    }

    /**
     * Better-sqlite3 batch insert with transactions
     */
    async betterSQLite3BatchInsert(tableName, records, options) {
        // Sanitize table name and columns to prevent SQL injection
        const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const columns = Object.keys(records[0]).map(col => col.replace(/[^a-zA-Z0-9_]/g, ''));
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO \`${sanitizedTableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
        
        const insert = this.db.prepare(sql);
        
        const insertMany = this.db.transaction((records) => {
            for (const record of records) {
                const values = columns.map(col => record[col]);
                insert.run(...values);
            }
        });
        
        const start = performance.now();
        insertMany(records);
        const duration = performance.now() - start;
        
        console.log(`⚡ Batch insert completed: ${records.length} records in ${duration.toFixed(2)}ms`);
        return { inserted: records.length, duration };
    }

    /**
     * SQLite3 batch insert with transaction
     */
    async sqlite3BatchInsert(tableName, records, options) {
        return new Promise((resolve, reject) => {
            // Sanitize table name and columns to prevent SQL injection
            const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
            const columns = Object.keys(records[0]).map(col => col.replace(/[^a-zA-Z0-9_]/g, ''));
            const placeholders = columns.map(() => '?').join(', ');
            const sql = `INSERT INTO \`${sanitizedTableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
            
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                const stmt = this.db.prepare(sql);
                let completed = 0;
                
                const start = performance.now();
                
                for (const record of records) {
                    const values = columns.map(col => record[col]);
                    stmt.run(values, (err) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            return reject(err);
                        }
                        
                        completed++;
                        if (completed === records.length) {
                            stmt.finalize();
                            this.db.run('COMMIT', (err) => {
                                if (err) reject(err);
                                else {
                                    const duration = performance.now() - start;
                                    console.log(`📊 Batch insert completed: ${records.length} records in ${duration.toFixed(2)}ms`);
                                    resolve({ inserted: records.length, duration });
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    /**
     * Get performance statistics
     */
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const uptimeHours = uptime / (1000 * 60 * 60);
        
        return {
            database_type: this.dbType,
            uptime_ms: uptime,
            uptime_hours: uptimeHours.toFixed(2),
            total_queries: this.stats.queries,
            total_inserts: this.stats.inserts,
            total_selects: this.stats.selects,
            total_errors: this.stats.errors,
            queries_per_hour: Math.round(this.stats.queries / uptimeHours),
            error_rate: this.stats.queries > 0 ? (this.stats.errors / this.stats.queries * 100).toFixed(2) + '%' : '0%',
            is_ready: this.isReady
        };
    }

    /**
     * Health check for Docker monitoring
     */
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health_check', [], { single: true });
            
            return {
                status: 'healthy',
                database: this.dbType,
                timestamp: new Date().toISOString(),
                health_check_result: result.health_check === 1
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                database: this.dbType,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Graceful shutdown
     */
    async close() {
        console.log(`🛑 Closing ${this.dbType} database connection...`);
        
        try {
            if (this.dbType === 'better-sqlite3') {
                // Run optimization before closing
                this.db.pragma('optimize');
                this.db.close();
            } else {
                this.db.close();
            }
            
            this.isReady = false;
            console.log('✅ Database connection closed');
            
        } catch (error) {
            console.error('❌ Error closing database:', error);
        }
    }
}

module.exports = DualDatabaseManager;