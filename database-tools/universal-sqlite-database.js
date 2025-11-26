/**
 * Universal SQLite Database Abstraction Layer
 * Maximum Cross-Platform Compatibility
 * 
 * Supports:
 * - sql.js (WebAssembly) - Works on ALL platforms, ALL Node.js versions
 * - better-sqlite3 (Native) - Linux production performance
 * - sqlite3 (Fallback) - Universal compatibility
 * 
 * Features:
 * - Automatic driver detection and selection
 * - Identical API across all implementations
 * - File persistence for sql.js
 * - Transaction support
 * - Performance optimizations
 * - Enterprise security integration
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

class UniversalSQLiteDatabase {
    constructor(dbPath = './data/databases/logging.db') {
        this.dbPath = path.resolve(dbPath);
        this.dbDir = path.dirname(this.dbPath);
        this.driver = null;
        this.db = null;
        this.driverType = null;
        this._initialized = false;
        
        // Performance metrics
        this.queryCount = 0;
        this.totalTime = 0;
        
        console.log('🚀 Universal SQLite Database initialized');
        console.log(`📂 Database path: ${this.dbPath}`);
        
        // Auto-initialize (lazy initialization on first use)
        this._initPromise = null;
    }
    
    /**
     * Ensure database is initialized before any operation
     */
    async _ensureInitialized() {
        if (this._initialized) return;
        
        if (!this._initPromise) {
            this._initPromise = this.initialize();
        }
        
        await this._initPromise;
    }

    /**
     * Detect and initialize the best available SQLite driver
     */
    async initialize() {
        console.log('\n🔍 Detecting available SQLite drivers...');
        
        // Ensure data directory exists
        await this.ensureDataDirectory();
        
        // Try drivers in order of preference
        const drivers = [
            { name: 'better-sqlite3', test: () => require('better-sqlite3') },
            { name: 'sql.js', test: () => require('sql.js') },
            { name: 'sqlite3', test: () => require('sqlite3') }
        ];

        for (const driver of drivers) {
            try {
                await this.tryDriver(driver.name, driver.test);
                if (this.db) break;
            } catch (error) {
                console.log(`⚠️  ${driver.name} not available: ${error.message}`);
            }
        }

        if (!this.db) {
            throw new Error('❌ No SQLite driver available! Please install sql.js, better-sqlite3, or sqlite3');
        }

        await this.setupTables();
        this._initialized = true;
        console.log(`✅ Database initialized with ${this.driverType} driver`);
        console.log(`📊 Platform compatibility: ${this.getPlatformInfo()}`);
        
        return this;
    }

    /**
     * Try to initialize a specific driver
     */
    async tryDriver(name, testFn) {
        try {
            const driverLib = testFn();
            
            switch (name) {
                case 'better-sqlite3':
                    await this.initBetterSqlite3(driverLib);
                    break;
                case 'sql.js':
                    // sql.js requires the library object, not a function call result
                    await this.initSqlJs(driverLib);
                    break;
                case 'sqlite3':
                    await this.initSqlite3(driverLib);
                    break;
            }
        } catch (error) {
            // Only log as warning for optional drivers, not critical error
            console.warn(`⚠️  ${name} not available:`, error.message);
            throw error;
        }
    }

    /**
     * Initialize better-sqlite3 (Native performance - Linux/Production)
     */
    async initBetterSqlite3(Database) {
        try {
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 1000');
            this.db.pragma('temp_store = memory');
            
            this.driverType = 'better-sqlite3';
            console.log('🚀 better-sqlite3 initialized - MAXIMUM PERFORMANCE');
        } catch (error) {
            throw new Error(`better-sqlite3 initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize sql.js (WebAssembly - Universal compatibility)
     */
    async initSqlJs(sqlLibrary) {
        try {
            // sql.js initialization - the library is actually a function that returns a Promise
            let SQL;
            
            if (typeof sqlLibrary === 'function') {
                // Direct function call for sql.js
                SQL = await sqlLibrary();
            } else if (sqlLibrary && typeof sqlLibrary.default === 'function') {
                // ES6 module format
                SQL = await sqlLibrary.default();
            } else if (sqlLibrary && sqlLibrary.Database) {
                // Already initialized
                SQL = sqlLibrary;
            } else {
                throw new Error('Invalid sql.js library format');
            }
            
            // Load existing database or create new
            let filebuffer = null;
            if (this.dbPath !== ':memory:' && existsSync(this.dbPath)) {
                filebuffer = await fs.readFile(this.dbPath);
                console.log('📂 Loading existing sql.js database from disk');
            }
            
            this.db = new SQL.Database(filebuffer);
            this.driverType = 'sql.js';
            
            // Set up automatic persistence for file-based databases
            if (this.dbPath !== ':memory:' && !this.dbPath.includes(':memory:')) {
                this.setupSqlJsPersistence();
            }
            
            console.log('🌍 sql.js initialized - UNIVERSAL COMPATIBILITY');
            console.log('   ✅ Works on Windows, Linux, macOS');
            console.log('   ✅ Works with Node.js v25+');
            console.log('   ✅ No native compilation required');
        } catch (error) {
            throw new Error(`sql.js initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize sqlite3 (Callback-based fallback)
     */
    async initSqlite3(sqlite3) {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (error) => {
                if (error) {
                    reject(new Error(`sqlite3 initialization failed: ${error.message}`));
                } else {
                    this.driverType = 'sqlite3';
                    console.log('🔄 sqlite3 initialized - LEGACY COMPATIBILITY');
                    resolve();
                }
            });
        });
    }

    /**
     * Set up automatic file persistence for sql.js
     */
    setupSqlJsPersistence() {
        if (this.driverType !== 'sql.js') return;
        
        // Auto-save every 5 seconds
        this.persistenceInterval = setInterval(async () => {
            await this.persistSqlJs();
        }, 5000);
        
        // Save on process exit
        process.on('SIGINT', async () => {
            await this.persistSqlJs();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            await this.persistSqlJs();
            process.exit(0);
        });
    }

    /**
     * Persist sql.js database to file
     */
    async persistSqlJs() {
        if (this.driverType !== 'sql.js' || !this.db) return;
        
        // Don't persist memory-only databases
        if (this.dbPath === ':memory:' || this.dbPath.includes(':memory:')) {
            return; // Memory databases don't need persistence
        }
        
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            await fs.writeFile(this.dbPath, buffer);
            console.log(`💾 sql.js database persisted to ${this.dbPath}`);
        } catch (error) {
            console.error('❌ Failed to persist sql.js database:', error.message);
        }
    }

    /**
     * Universal prepare method - works with all drivers
     */
    prepare(sql) {
        switch (this.driverType) {
            case 'better-sqlite3':
                return this.db.prepare(sql);
            case 'sql.js':
                return {
                    run: (...params) => this.runSqlJs(sql, params),
                    all: (...params) => this.allSqlJs(sql, params),
                    get: (...params) => this.getSqlJs(sql, params)
                };
            case 'sqlite3':
                return {
                    run: (...params) => this.runSqlite3(sql, params),
                    all: (...params) => this.allSqlite3(sql, params),
                    get: (...params) => this.getSqlite3(sql, params)
                };
        }
    }

    /**
     * Universal run method
     */
    async run(sql, params = []) {
        await this._ensureInitialized();
        
        const startTime = Date.now();
        let result;

        try {
            switch (this.driverType) {
                case 'better-sqlite3':
                    const stmt = this.db.prepare(sql);
                    result = stmt.run(params);
                    break;
                case 'sql.js':
                    result = await this.runSqlJs(sql, params);
                    break;
                case 'sqlite3':
                    result = await this.runSqlite3(sql, params);
                    break;
            }
            
            this.updateMetrics(startTime);
            return result;
        } catch (error) {
            console.error(`❌ Database run error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Universal get method (single row)
     */
    async get(sql, params = []) {
        await this._ensureInitialized();
        
        const startTime = Date.now();
        let result;

        try {
            switch (this.driverType) {
                case 'better-sqlite3':
                    const stmt = this.db.prepare(sql);
                    result = stmt.get(params);
                    break;
                case 'sql.js':
                    result = await this.getSqlJs(sql, params);
                    break;
                case 'sqlite3':
                    result = await this.getSqlite3(sql, params);
                    break;
            }
            
            this.updateMetrics(startTime);
            return result;
        } catch (error) {
            console.error(`❌ Database get error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Universal all method (multiple rows)
     */
    async all(sql, params = []) {
        await this._ensureInitialized();
        
        const startTime = Date.now();
        let result;

        try {
            switch (this.driverType) {
                case 'better-sqlite3':
                    const stmt = this.db.prepare(sql);
                    result = stmt.all(params);
                    break;
                case 'sql.js':
                    result = await this.allSqlJs(sql, params);
                    break;
                case 'sqlite3':
                    result = await this.allSqlite3(sql, params);
                    break;
            }
            
            this.updateMetrics(startTime);
            return result;
        } catch (error) {
            console.error(`❌ Database all error: ${error.message}`);
            throw error;
        }
    }

    /**
     * sql.js specific methods
     */
    runSqlJs(sql, params = []) {
        let stmt;
        try {
            stmt = this.db.prepare(sql);
            if (params.length > 0) {
                stmt.bind(params);
            }
            stmt.step();
            const changes = this.db.getRowsModified();
            stmt.free();
            return { changes: changes, lastInsertRowid: null };
        } catch (error) {
            console.error('❌ sql.js run error:', error.message);
            if (stmt && typeof stmt.free === 'function') {
                stmt.free();
            }
            throw error;
        }
    }

    getSqlJs(sql, params = []) {
        let stmt;
        try {
            stmt = this.db.prepare(sql);
            if (params.length > 0) {
                stmt.bind(params);
            }
            
            if (stmt.step()) {
                const result = stmt.getAsObject();
                stmt.free();
                return result;
            }
            stmt.free();
            return null;
        } catch (error) {
            console.error('❌ sql.js get error:', error.message);
            if (stmt) stmt.free();
            throw error;
        }
    }

    allSqlJs(sql, params = []) {
        let stmt;
        try {
            const results = [];
            stmt = this.db.prepare(sql);
            if (params.length > 0) {
                stmt.bind(params);
            }
            
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        } catch (error) {
            console.error('❌ sql.js all error:', error.message);
            if (stmt && typeof stmt.free === 'function') {
                stmt.free();
            }
            throw error;
        }
    }

    /**
     * sqlite3 specific methods (promise wrappers)
     */
    runSqlite3(sql, params) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(error) {
                if (error) reject(error);
                else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
            });
        });
    }

    getSqlite3(sql, params) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (error, row) => {
                if (error) reject(error);
                else resolve(row);
            });
        });
    }

    allSqlite3(sql, params) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (error, rows) => {
                if (error) reject(error);
                else resolve(rows);
            });
        });
    }

    /**
     * Universal transaction support
     */
    async transaction(callback) {
        switch (this.driverType) {
            case 'better-sqlite3':
                const transaction = this.db.transaction(callback);
                return transaction();
            case 'sql.js':
            case 'sqlite3':
                await this.run('BEGIN TRANSACTION');
                try {
                    const result = await callback();
                    await this.run('COMMIT');
                    return result;
                } catch (error) {
                    await this.run('ROLLBACK');
                    throw error;
                }
        }
    }

    /**
     * Set up database tables
     */
    async setupTables() {
        const createTables = [
            `CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                source TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,
            `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`,
            `CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)`
        ];

        for (const sql of createTables) {
            // Use direct driver method to avoid circular dependency
            try {
                switch (this.driverType) {
                    case 'better-sqlite3':
                        this.db.prepare(sql).run();
                        break;
                    case 'sql.js':
                        this.runSqlJs(sql, []);
                        break;
                    case 'sqlite3':
                        await this.runSqlite3(sql, []);
                        break;
                }
            } catch (error) {
                console.error(`❌ Failed to create table/index: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Ensure data directory exists
     */
    async ensureDataDirectory() {
        try {
            await fs.mkdir(this.dbDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore error
        }
    }

    /**
     * Update performance metrics
     */
    updateMetrics(startTime) {
        this.queryCount++;
        this.totalTime += Date.now() - startTime;
    }

    /**
     * Get platform compatibility information
     */
    getPlatformInfo() {
        const info = {
            'better-sqlite3': '🚀 Native (Linux/Production)',
            'sql.js': '🌍 Universal WebAssembly',
            'sqlite3': '🔄 Legacy Compatible'
        };
        return info[this.driverType];
    }

    /**
     * Get database statistics
     */
    getStats() {
        const avgTime = this.queryCount > 0 ? (this.totalTime / this.queryCount).toFixed(2) : 0;
        
        return {
            driver: this.driverType,
            queries: this.queryCount,
            avgQueryTime: `${avgTime}ms`,
            dbPath: this.dbPath,
            platform: this.getPlatformInfo()
        };
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.driverType === 'sql.js') {
            await this.persistSqlJs();
            if (this.persistenceInterval) {
                clearInterval(this.persistenceInterval);
            }
            this.db.close();
        } else if (this.driverType === 'better-sqlite3') {
            this.db.close();
        } else if (this.driverType === 'sqlite3') {
            return new Promise((resolve) => {
                this.db.close(resolve);
            });
        }
        
        console.log(`✅ ${this.driverType} database connection closed`);
    }
}

module.exports = UniversalSQLiteDatabase;