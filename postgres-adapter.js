/**
 * PostgreSQL Database Adapter
 * Provides async database operations for PostgreSQL backend
 * Compatible with database access layer interface
 */

const { Pool } = require('pg');

class PostgresAdapter {
    constructor(connectionConfig, optionsOrLogger = {}) {
        // Support both options object and legacy logger parameter
        if (optionsOrLogger && typeof optionsOrLogger.info === 'function') {
            this.logger = optionsOrLogger;
            this.options = {};
        } else {
            this.options = optionsOrLogger || {};
            this.logger = this.options.logger || console;
        }

        // PostgreSQL connection pool
        this.pool = new Pool({
            host: connectionConfig.host || process.env.POSTGRES_HOST || 'localhost',
            port: connectionConfig.port || process.env.POSTGRES_PORT || 5432,
            database: connectionConfig.database || process.env.POSTGRES_DB || 'logging_server',
            user: connectionConfig.user || process.env.POSTGRES_USER || 'postgres',
            password: connectionConfig.password || process.env.POSTGRES_PASSWORD,
            max: 20, // Max connections in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.db = null;
        this.dbType = 'postgres';
        this.initialized = false;
    }

    async init() {
        try {
            // Test connection
            const client = await this.pool.connect();
            this.logger.info('✅ PostgreSQL connection established');
            client.release();
            this.initialized = true;
            this.db = this; // Self-reference for compatibility
        } catch (error) {
            this.logger.error('❌ PostgreSQL connection failed:', error.message);
            throw error;
        }
    }

    // PostgreSQL async methods for DAL compatibility

    async run(sql, params = []) {
        const client = await this.pool.connect();
        try {
            // Convert ? placeholders to PostgreSQL $1, $2, etc
            const pgSql = this.convertPlaceholders(sql);
            const result = await client.query(pgSql, params);
            
            // VACUUM and other utility commands may not return result.rows
            return {
                changes: result.rowCount || 0,
                lastID: (result.rows && result.rows.length > 0 && result.rows[0]) ? result.rows[0].id : null
            };
        } catch (error) {
            this.logger.error(`PostgreSQL run() error: ${error.message}`, {
                sql: sql,
                pgSql: this.convertPlaceholders(sql),
                params: params,
                error: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    async get(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const pgSql = this.convertPlaceholders(sql);
            const result = await client.query(pgSql, params);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`PostgreSQL get() error: ${error.message}`, {
                sql: sql,
                pgSql: this.convertPlaceholders(sql),
                params: params,
                error: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    async all(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const pgSql = this.convertPlaceholders(sql);
            const result = await client.query(pgSql, params);
            return result.rows;
        } catch (error) {
            this.logger.error(`PostgreSQL all() error: ${error.message}`, {
                sql: sql,
                pgSql: this.convertPlaceholders(sql),
                params: params,
                error: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    prepare(sql) {
        // Return a prepared statement object compatible with DAL interface
        const pgSql = this.convertPlaceholders(sql);
        return {
            run: async (...params) => {
                const client = await this.pool.connect();
                try {
                    const result = await client.query(pgSql, params);
                    return {
                        changes: result.rowCount,
                        lastID: result.rows[0]?.id || null
                    };
                } finally {
                    client.release();
                }
            },
            get: async (...params) => {
                const client = await this.pool.connect();
                try {
                    const result = await client.query(pgSql, params);
                    return result.rows[0] || null;
                } finally {
                    client.release();
                }
            },
            all: async (...params) => {
                const client = await this.pool.connect();
                try {
                    const result = await client.query(pgSql, params);
                    return result.rows;
                } finally {
                    client.release();
                }
            }
        };
    }

    pragma(statement) {
        // PostgreSQL doesn't use PRAGMA, ignore or log
        this.logger.info(`ℹ️ PRAGMA ignored in PostgreSQL: ${statement}`);
        return this;
    }

    close() {
        return this.pool.end();
    }

    // Helper: Convert ? placeholders to PostgreSQL $1, $2, etc
    convertPlaceholders(sql) {
        let index = 1;
        return sql.replace(/\?/g, () => `$${index++}`);
    }

    // Transaction support
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Driver info for compatibility
    getDriverInfo() {
        return {
            type: 'PostgreSQL',
            performance: 'high'
        };
    }
}

module.exports = PostgresAdapter;
