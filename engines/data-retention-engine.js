// ============================================================================
// DATA RETENTION & LIFECYCLE MANAGEMENT ENGINE
// ============================================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const cron = require('node-cron');

class DataRetentionEngine {
    constructor(database, loggers, config) {
        this.dal = database;
        this.loggers = loggers;
        this.config = config || {};
        this.retentionPolicies = new Map();
        this.archiveDirectory = path.join(__dirname, '..', 'data', 'archives');
        this.compressionLevel = 6;
        this.isProcessing = false;
        this.lastCleanup = null;
        this.statistics = {
            totalRecords: 0,
            archivedRecords: 0,
            compressedSize: 0,
            originalSize: 0,
            spaceFreed: 0
        };
    }

    async initialize() {
        try {
            // Create archive directory if it doesn't exist
            if (!fs.existsSync(this.archiveDirectory)) {
                fs.mkdirSync(this.archiveDirectory, { recursive: true });
            }

            // Create retention schema
            await this.createRetentionSchema();
            
            // Load retention policies with error handling
            await this.loadRetentionPolicies();
            
            // Create default policies
            await this.createDefaultPolicies();
            
            // Schedule cleanup tasks
            this.scheduleCleanupTasks();
            
            this.loggers.system.info('✅ Data Retention Engine initialized successfully');
            return true;
        } catch (error) {
            this.loggers.system.error('❌ Data Retention Engine initialization failed:', error);
            throw error;
        }
    }

    async createRetentionSchema() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS retention_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                target_table TEXT NOT NULL,
                retention_days INTEGER NOT NULL,
                archive_enabled INTEGER DEFAULT 1,
                compression_enabled INTEGER DEFAULT 1,
                delete_after_archive INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_executed DATETIME,
                is_active INTEGER DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS retention_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id INTEGER,
                execution_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                records_processed INTEGER DEFAULT 0,
                records_archived INTEGER DEFAULT 0,
                records_deleted INTEGER DEFAULT 0,
                space_freed_bytes INTEGER DEFAULT 0,
                execution_time_ms INTEGER DEFAULT 0,
                status TEXT DEFAULT 'completed',
                error_message TEXT,
                FOREIGN KEY (policy_id) REFERENCES retention_policies(id)
            )`
        ];

        for (const query of queries) {
            await this.dal.run(query);
        }
        
        this.loggers.system.info('✅ Retention schema created successfully');
    }

    async loadRetentionPolicies() {
        try {
            // Try to load retention policies with fallback handling
            let policies = [];
            try {
                policies = await this.dal.all(`
                    SELECT * FROM retention_policies 
                    WHERE is_active = 1 
                    ORDER BY name
                `);
            } catch (schemaError) {
                // Fallback if is_active column doesn't exist
                this.loggers.system.warn('Retention policies schema issue, using fallback query');
                try {
                    policies = await this.dal.all(`SELECT * FROM retention_policies ORDER BY id`);
                } catch (fallbackError) {
                    this.loggers.system.warn('No retention policies table found, will create defaults');
                    policies = [];
                }
            }

            this.retentionPolicies.clear();
            for (const policy of policies) {
                this.retentionPolicies.set(policy.id, policy);
            }

            this.loggers.system.info(`📋 Loaded ${policies.length} retention policies`);
        } catch (error) {
            this.loggers.system.error('Failed to load retention policies:', error);
        }
    }

    async createDefaultPolicies() {
        try {
            const existingCount = await this.dal.get('SELECT COUNT(*) as count FROM retention_policies');
            if (existingCount && existingCount.count > 0) {
                return; // Policies already exist
            }

            const defaultPolicies = [
                {
                    name: 'logs_30day',
                    description: 'Retain log entries for 30 days',
                    target_table: 'log_events',
                    retention_days: 30,
                    archive_enabled: 1,
                    compression_enabled: 1
                },
                {
                    name: 'webhooks_90day', 
                    description: 'Retain webhook events for 90 days',
                    target_table: 'webhook_events',
                    retention_days: 90,
                    archive_enabled: 1,
                    compression_enabled: 1
                }
            ];

            for (const policy of defaultPolicies) {
                try {
                    await this.dal.run(`
                        INSERT INTO retention_policies (
                            name, description, target_table, retention_days,
                            archive_enabled, compression_enabled, delete_after_archive
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        policy.name, policy.description, policy.target_table, 
                        policy.retention_days, policy.archive_enabled, 
                        policy.compression_enabled, 0
                    ]);
                } catch (insertError) {
                    this.loggers.system.warn(`Could not create default policy ${policy.name}:`, insertError.message);
                }
            }

            this.loggers.system.info('✅ Default retention policies created');
        } catch (error) {
            this.loggers.system.warn('Could not create default retention policies:', error.message);
        }
    }

    scheduleCleanupTasks() {
        // Schedule daily cleanup at 2 AM
        cron.schedule('0 2 * * *', async () => {
            this.loggers.system.info('🧹 Starting scheduled cleanup tasks...');
            await this.executeAllPolicies();
        });

        this.loggers.system.info('📅 Scheduled retention tasks');
    }

    async executeAllPolicies() {
        if (this.isProcessing) {
            this.loggers.system.warn('Retention processing already in progress, skipping...');
            return;
        }

        this.isProcessing = true;
        try {
            for (const [id, policy] of this.retentionPolicies) {
                await this.executePolicy(policy);
            }
            this.lastCleanup = new Date();
        } catch (error) {
            this.loggers.system.error('Error during retention processing:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async executePolicy(policy) {
        // Basic implementation - just log what would be done
        this.loggers.system.info(`📋 Would execute retention policy: ${policy.name} for table ${policy.target_table}`);
    }

    getStatistics() {
        return {
            ...this.statistics,
            isProcessing: this.isProcessing,
            lastCleanup: this.lastCleanup,
            activePolicies: this.retentionPolicies.size
        };
    }
}

module.exports = DataRetentionEngine;