#!/usr/bin/env node

/**
 * Create Missing Database Tables for Strict Validation
 * Ensures ALL expected tables exist with proper schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class MissingTableCreator {
    constructor() {
        this.dbPath = './data/databases/enterprise_logs.db';
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const emoji = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
        console.log(`${emoji} [${timestamp}] ${message}`);
    }

    async createMissingTables() {
        this.log('🔧 CREATING MISSING DATABASE TABLES FOR STRICT VALIDATION...', 'info');
        
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    this.log(`Failed to connect to database: ${err.message}`, 'error');
                    reject(err);
                    return;
                }
                this.log('Connected to database successfully', 'success');
            });

            const missingTables = [
                {
                    name: 'log_files',
                    sql: `CREATE TABLE IF NOT EXISTS log_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT NOT NULL,
                        filepath TEXT NOT NULL,
                        size INTEGER DEFAULT 0,
                        format TEXT DEFAULT 'unknown',
                        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        processed_at DATETIME,
                        status TEXT DEFAULT 'pending',
                        checksum TEXT,
                        user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`
                },
                {
                    name: 'log_entries',
                    sql: `CREATE TABLE IF NOT EXISTS log_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        log_file_id INTEGER,
                        line_number INTEGER,
                        timestamp DATETIME,
                        level TEXT,
                        message TEXT,
                        source TEXT,
                        parsed_data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (log_file_id) REFERENCES log_files(id)
                    )`
                },
                {
                    name: 'log_analysis_results',
                    sql: `CREATE TABLE IF NOT EXISTS log_analysis_results (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        log_file_id INTEGER,
                        analysis_type TEXT NOT NULL,
                        result_data TEXT,
                        confidence_score REAL DEFAULT 0.0,
                        patterns_found INTEGER DEFAULT 0,
                        anomalies_detected INTEGER DEFAULT 0,
                        processing_time REAL DEFAULT 0.0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (log_file_id) REFERENCES log_files(id)
                    )`
                },
                {
                    name: 'search_history',
                    sql: `CREATE TABLE IF NOT EXISTS search_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        search_query TEXT NOT NULL,
                        search_type TEXT DEFAULT 'basic',
                        filters TEXT,
                        results_count INTEGER DEFAULT 0,
                        execution_time REAL DEFAULT 0.0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )`
                }
            ];

            let completedTables = 0;
            const totalTables = missingTables.length;

            missingTables.forEach(table => {
                db.run(table.sql, (err) => {
                    if (err) {
                        this.log(`Failed to create table ${table.name}: ${err.message}`, 'error');
                    } else {
                        this.log(`Created table: ${table.name}`, 'success');
                        
                        // Create indexes for performance
                        const indexes = this.getIndexesForTable(table.name);
                        indexes.forEach(indexSql => {
                            db.run(indexSql, (indexErr) => {
                                if (indexErr && !indexErr.message.includes('already exists')) {
                                    this.log(`Index creation warning for ${table.name}: ${indexErr.message}`, 'info');
                                }
                            });
                        });
                    }
                    
                    completedTables++;
                    if (completedTables === totalTables) {
                        db.close((closeErr) => {
                            if (closeErr) {
                                this.log(`Error closing database: ${closeErr.message}`, 'error');
                            } else {
                                this.log('Database connection closed', 'success');
                            }
                            resolve();
                        });
                    }
                });
            });
        });
    }

    getIndexesForTable(tableName) {
        const indexes = {
            'log_files': [
                'CREATE INDEX IF NOT EXISTS idx_log_files_filename ON log_files(filename)',
                'CREATE INDEX IF NOT EXISTS idx_log_files_status ON log_files(status)',
                'CREATE INDEX IF NOT EXISTS idx_log_files_created_at ON log_files(created_at)'
            ],
            'log_entries': [
                'CREATE INDEX IF NOT EXISTS idx_log_entries_log_file_id ON log_entries(log_file_id)',
                'CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp)',
                'CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level)'
            ],
            'log_analysis_results': [
                'CREATE INDEX IF NOT EXISTS idx_analysis_log_file_id ON log_analysis_results(log_file_id)',
                'CREATE INDEX IF NOT EXISTS idx_analysis_type ON log_analysis_results(analysis_type)',
                'CREATE INDEX IF NOT EXISTS idx_analysis_created_at ON log_analysis_results(created_at)'
            ],
            'search_history': [
                'CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at)',
                'CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(search_query)'
            ]
        };
        
        return indexes[tableName] || [];
    }

    async run() {
        try {
            await this.createMissingTables();
            this.log('✅ All missing database tables created successfully!', 'success');
        } catch (error) {
            this.log(`❌ Failed to create missing tables: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// Run the table creator
const creator = new MissingTableCreator();
creator.run();