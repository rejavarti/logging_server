// ============================================================================
// DATA RETENTION & LIFECYCLE MANAGEMENT E        try {
            // Try to load retention policies, with fallback for schema issues
            let policies = [];
            try {
                policies = await this.dal.all(`
                    SELECT * FROM retention_policies 
                    WHERE is_active = 1 
                    ORDER BY name
                `);
            } catch (schemaError) {
                // Try without is_active column if it doesn't exist
                this.loggers.system.warn('Retention policies table schema mismatch, trying fallback query');
                policies = await this.dal.all(`SELECT * FROM retention_policies ORDER BY id`);
            }

            this.retentionPolicies.clear();
            for (const policy of policies) {
                this.retentionPolicies.set(policy.id, policy);
            }

            this.loggers.system.info(`Loaded ${policies.length} retention policies`);
        } catch (error) {
            
            this.loggers.system.error('Failed to load retention policies:', error);=====================================================================

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
        this.compressionLevel = 6; // gzip compression level
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
            this.loggers.system.info('🗄️ Initializing Data Retention Engine...');
            
            // Ensure archive directory exists
            if (!fs.existsSync(this.archiveDirectory)) {
                fs.mkdirSync(this.archiveDirectory, { recursive: true });
            }

            // Create retention policies table
            await this.createRetentionSchema();
            
            // Load retention policies from database
            await this.loadRetentionPolicies();
            
            // Initialize default policies if none exist
            await this.createDefaultPolicies();
            
            // Schedule retention tasks (simplified for now)
            this.scheduleRetentionTasks();
            
            this.loggers.system.info('✅ Data Retention Engine initialized successfully');
            return true;
        } catch (error) {
            this.loggers.system.error('❌ Data Retention Engine initialization failed:', error);
            this.loggers.system.warn('⚠️ Data Retention Engine disabled');
            return false;
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
                original_size_bytes INTEGER DEFAULT 0,
                compressed_size_bytes INTEGER DEFAULT 0,
                execution_time_ms INTEGER DEFAULT 0,
                execution_status TEXT DEFAULT 'pending',
                error_message TEXT,
                FOREIGN KEY (policy_id) REFERENCES retention_policies (id)
            )`,
            `CREATE TABLE IF NOT EXISTS archived_logs_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                archive_filename TEXT UNIQUE NOT NULL,
                original_table TEXT NOT NULL,
                date_from DATE NOT NULL,
                date_to DATE NOT NULL,
                record_count INTEGER NOT NULL,
                original_size_bytes INTEGER NOT NULL,
                compressed_size_bytes INTEGER NOT NULL,
                compression_ratio REAL,
                archive_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT
            )`
        ];

        try {
            for (const query of queries) {
                if (typeof this.dal.run === 'function') {
                    await this.dal.run(query);
                } else {
                    // Fallback to execute if run not available
                    await this.dal.execute(query);
                }
            }
            this.loggers.system.info('✅ Retention schema created successfully');
        } catch (error) {
            this.loggers.system.error('❌ Failed to create retention schema:', error);
            throw error;
        }
    }

    async loadRetentionPolicies() {
        try {
            
            
            const policies = await this.dal.all(`
                SELECT * FROM retention_policies 
                WHERE is_active = 1 
                ORDER BY name
            `);

            this.retentionPolicies.clear();
            for (const policy of policies) {
                this.retentionPolicies.set(policy.id, policy);
            }

            this.loggers.system.info(`Loaded ${policies.length} retention policies`);
        } catch (error) {
            
            this.loggers.system.error('Failed to load retention policies:', error);
        }
    }

    async createDefaultPolicies() {
        try {
            
            
            const existingPolicies = await this.dal.get('SELECT COUNT(*) as count FROM retention_policies');
            if (existingPolicies.count > 0) return;

            const defaultPolicies = [
                {
                    name: 'System Logs Retention',
                    description: 'Archive system logs after 30 days, delete after 365 days',
                    table_name: 'logs',
                    retention_days: 30,
                    archive_enabled: 1,
                    compression_enabled: 1,
                    delete_after_archive: 0
                },
                {
                    name: 'Security Logs Retention',
                    description: 'Archive security logs after 90 days, keep forever',
                    table_name: 'security_logs',
                    retention_days: 90,
                    archive_enabled: 1,
                    compression_enabled: 1,
                    delete_after_archive: 0
                },
                {
                    name: 'Activity Logs Retention',
                    description: 'Archive activity logs after 60 days, delete after 180 days',
                    table_name: 'activity_logs',
                    retention_days: 60,
                    archive_enabled: 1,
                    compression_enabled: 1,
                    delete_after_archive: 0
                },
                {
                    name: 'Metrics Cleanup',
                    description: 'Delete old metrics after 7 days (no archival)',
                    table_name: 'metrics',
                    retention_days: 7,
                    archive_enabled: 0,
                    compression_enabled: 0,
                    delete_after_archive: 1
                }
            ];

            for (const policy of defaultPolicies) {
                await this.dal.run(`
                    INSERT INTO retention_policies (
                        name, description, target_table, retention_days,
                        archive_enabled, compression_enabled, delete_after_archive
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    policy.name, policy.description, policy.table_name,
                    policy.retention_days, policy.archive_enabled,
                    policy.compression_enabled, policy.delete_after_archive
                ]);
            }

            await this.loadRetentionPolicies();
            this.loggers.system.info('Created default retention policies');
        } catch (error) {
            
            this.loggers.system.error('Failed to create default retention policies:', error);
        }
    }

    scheduleRetentionTasks() {
        
        
        
        // Daily retention check at 2 AM
        cron.schedule(this.config.maintenance?.cleanupSchedule || '0 2 * * *', async () => {
            await this.executeRetentionPolicies();
        });

        // Weekly archive optimization at 3 AM Sunday
        cron.schedule('0 3 * * 0', async () => {
            await this.optimizeArchives();
        });

        this.loggers.system.info('Scheduled retention tasks');
    }

    async executeRetentionPolicies(policyId = null) {
        if (this.isProcessing) {
            
            this.loggers.system.warn('Retention process already running');
            return false;
        }

        this.isProcessing = true;
        const startTime = Date.now();

        try {
            
            this.loggers.system.info('Starting retention policy execution');

            const policiesToExecute = policyId 
                ? [this.retentionPolicies.get(policyId)].filter(Boolean)
                : Array.from(this.retentionPolicies.values());

            let totalProcessed = 0;
            let totalArchived = 0;
            let totalDeleted = 0;

            for (const policy of policiesToExecute) {
                const result = await this.executePolicy(policy);
                totalProcessed += result.processed;
                totalArchived += result.archived;
                totalDeleted += result.deleted;
            }

            const executionTime = Date.now() - startTime;
            this.lastCleanup = new Date();

            this.loggers.system.info(`Retention execution completed`, {
                duration: executionTime,
                processed: totalProcessed,
                archived: totalArchived,
                deleted: totalDeleted
            });

            return {
                success: true,
                processed: totalProcessed,
                archived: totalArchived,
                deleted: totalDeleted,
                executionTime
            };

        } catch (error) {
            
            this.loggers.system.error('Retention policy execution failed:', error);
            return { success: false, error: error.message };
        } finally {
            this.isProcessing = false;
        }
    }

    async executePolicy(policy) {
        const historyId = await this.createExecutionHistory(policy.id);
        const startTime = Date.now();
        let processed = 0;
        let archived = 0;
        let deleted = 0;
        let originalSize = 0;
        let compressedSize = 0;

        try {
            
            
            // Calculate cutoff date
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);

            this.loggers.system.info(`Executing policy: ${policy.name} for data older than ${cutoffDate.toISOString()}`);

            // Check if table exists
            const tableExists = await this.tableExists(policy.target_table);
            if (!tableExists) {
                this.loggers.system.warn(`Table ${policy.target_table} does not exist, skipping policy`);
                await this.updateExecutionHistory(historyId, {
                    execution_status: 'skipped',
                    error_message: `Table ${policy.target_table} does not exist`
                });
                return { processed: 0, archived: 0, deleted: 0 };
            }

            // Get records to process
            const oldRecords = await this.getOldRecords(policy.target_table, cutoffDate);
            processed = oldRecords.length;

            if (processed === 0) {
                this.loggers.system.info(`No records to process for policy: ${policy.name}`);
                await this.updateExecutionHistory(historyId, {
                    execution_status: 'completed',
                    records_processed: processed,
                    execution_time_ms: Date.now() - startTime
                });
                return { processed, archived, deleted };
            }

            // Archive records if enabled
            if (policy.archive_enabled) {
                const archiveResult = await this.archiveRecords(
                    policy.target_table,
                    oldRecords,
                    cutoffDate,
                    policy.compression_enabled
                );
                archived = archiveResult.count;
                originalSize = archiveResult.originalSize;
                compressedSize = archiveResult.compressedSize;
            }

            // Delete old records
            deleted = await this.deleteOldRecords(policy.target_table, cutoffDate);

            // Update statistics
            this.updateStatistics(processed, archived, originalSize, compressedSize);

            // Update execution history
            await this.updateExecutionHistory(historyId, {
                execution_status: 'completed',
                records_processed: processed,
                records_archived: archived,
                records_deleted: deleted,
                original_size_bytes: originalSize,
                compressed_size_bytes: compressedSize,
                execution_time_ms: Date.now() - startTime
            });

            // Update policy last executed time
            await this.dal.run(`
                UPDATE retention_policies 
                SET last_executed = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [policy.id]);

            this.loggers.system.info(`Policy execution completed: ${policy.name}`, {
                processed,
                archived,
                deleted,
                compressionRatio: originalSize > 0 ? (compressedSize / originalSize).toFixed(2) : 0
            });

            return { processed, archived, deleted };

        } catch (error) {
            
            this.loggers.system.error(`Policy execution failed: ${policy.name}`, error);
            await this.updateExecutionHistory(historyId, {
                execution_status: 'failed',
                error_message: error.message,
                execution_time_ms: Date.now() - startTime
            });
            throw error;
        }
    }

    async createExecutionHistory(policyId) {
        const result = await this.dal.run(`
            INSERT INTO retention_history (policy_id, execution_status)
            VALUES (?, 'running')
        `, [policyId]);
        return result.lastID;
    }

    async updateExecutionHistory(historyId, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map(field => `${field} = ?`).join(', ');

        await this.dal.run(`
            UPDATE retention_history 
            SET ${setClause}
            WHERE id = ?
        `, [...values, historyId]);
    }

    async tableExists(tableName) {
        try {
            const result = await this.dal.get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `, [tableName]);
            return !!result;
        } catch (error) {
            return false;
        }
    }

    async getOldRecords(tableName, cutoffDate) {
        try {
            
            
            // Try different timestamp column names
            const timestampColumns = ['timestamp', 'created_at', 'date', 'time'];
            
            for (const column of timestampColumns) {
                try {
                    const records = await this.dal.all(`
                        SELECT * FROM ${tableName} 
                        WHERE ${column} < ? 
                        ORDER BY ${column}
                    `, [cutoffDate.toISOString()]);
                    return records;
                } catch (error) {
                    // Column doesn't exist, try next one
                    continue;
                }
            }

            // If no timestamp column found, return empty array
            this.loggers.system.warn(`No timestamp column found in table ${tableName}`);
            return [];
        } catch (error) {
            
            this.loggers.system.error(`Error getting old records from ${tableName}:`, error);
            return [];
        }
    }

    async archiveRecords(tableName, records, cutoffDate, compressionEnabled) {
        if (records.length === 0) {
            return { count: 0, originalSize: 0, compressedSize: 0 };
        }

        const archiveDate = new Date().toISOString().split('T')[0];
        const filename = `${tableName}_${archiveDate}.json`;
        const archivePath = path.join(this.archiveDirectory, filename);

        try {
            
            
            // Prepare archive data
            const archiveData = {
                metadata: {
                    table: tableName,
                    exportDate: new Date().toISOString(),
                    dateFrom: records[0].timestamp || records[0].created_at || records[0].date,
                    dateTo: records[records.length - 1].timestamp || records[records.length - 1].created_at || records[records.length - 1].date,
                    recordCount: records.length
                },
                records: records
            };

            const jsonData = JSON.stringify(archiveData, null, 2);
            const originalSize = Buffer.byteLength(jsonData, 'utf8');

            let finalPath = archivePath;
            let compressedSize = originalSize;

            if (compressionEnabled) {
                // Compress the data
                const compressed = zlib.gzipSync(jsonData, { level: this.compressionLevel });
                finalPath = archivePath + '.gz';
                compressedSize = compressed.length;
                fs.writeFileSync(finalPath, compressed);
            } else {
                fs.writeFileSync(finalPath, jsonData);
            }

            // Calculate checksum
            const checksum = crypto.createHash('sha256').update(jsonData).digest('hex');

            // Store archive metadata
            await this.dal.run(`
                INSERT INTO archived_logs_metadata (
                    archive_filename, original_table, date_from, date_to,
                    record_count, original_size_bytes, compressed_size_bytes,
                    compression_ratio, archive_path, checksum
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                path.basename(finalPath),
                tableName,
                archiveData.metadata.dateFrom,
                archiveData.metadata.dateTo,
                records.length,
                originalSize,
                compressedSize,
                compressedSize / originalSize,
                finalPath,
                checksum
            ]);

            this.loggers.system.info(`Archived ${records.length} records to ${finalPath}`, {
                originalSize,
                compressedSize,
                compressionRatio: (compressedSize / originalSize).toFixed(2)
            });

            return {
                count: records.length,
                originalSize,
                compressedSize
            };

        } catch (error) {
            
            this.loggers.system.error('Failed to archive records:', error);
            throw error;
        }
    }

    async deleteOldRecords(tableName, cutoffDate) {
        try {
            const timestampColumns = ['timestamp', 'created_at', 'date', 'time'];
            
            for (const column of timestampColumns) {
                try {
                    const result = await this.dal.run(`
                        DELETE FROM ${tableName} 
                        WHERE ${column} < ?
                    `, [cutoffDate.toISOString()]);
                    return result.changes || 0;
                } catch (error) {
                    continue;
                }
            }

            return 0;
        } catch (error) {
            
            this.loggers.system.error(`Error deleting old records from ${tableName}:`, error);
            return 0;
        }
    }

    updateStatistics(processed, archived, originalSize, compressedSize) {
        this.statistics.totalRecords += processed;
        this.statistics.archivedRecords += archived;
        this.statistics.originalSize += originalSize;
        this.statistics.compressedSize += compressedSize;
        this.statistics.spaceFreed += (originalSize - compressedSize);
    }

    async optimizeArchives() {
        try {
            
            this.loggers.system.info('Starting archive optimization');

            // Get all archives older than 30 days
            const oldArchives = await this.dal.all(`
                SELECT * FROM archived_logs_metadata 
                WHERE created_at < datetime('now', '-30 days')
                AND archive_filename NOT LIKE '%.optimized.%'
            `);

            for (const archive of oldArchives) {
                await this.optimizeArchive(archive);
            }

            this.loggers.system.info(`Archive optimization completed for ${oldArchives.length} archives`);
        } catch (error) {
            
            this.loggers.system.error('Archive optimization failed:', error);
        }
    }

    async optimizeArchive(archiveInfo) {
        try {
            
            
            const archivePath = archiveInfo.archive_path;
            if (!fs.existsSync(archivePath)) {
                this.loggers.system.warn(`Archive file not found: ${archivePath}`);
                return;
            }

            // Read and recompress with higher compression
            let data;
            if (archivePath.endsWith('.gz')) {
                data = zlib.gunzipSync(fs.readFileSync(archivePath));
            } else {
                data = fs.readFileSync(archivePath);
            }

            // Recompress with maximum compression
            const optimized = zlib.gzipSync(data, { level: 9 });
            const optimizedPath = archivePath.replace(/\.gz$/, '') + '.optimized.gz';

            fs.writeFileSync(optimizedPath, optimized);

            // Update metadata
            await this.dal.run(`
                UPDATE archived_logs_metadata 
                SET archive_filename = ?, 
                    archive_path = ?,
                    compressed_size_bytes = ?
                WHERE id = ?
            `, [
                path.basename(optimizedPath),
                optimizedPath,
                optimized.length,
                archiveInfo.id
            ]);

            // Remove old file
            fs.unlinkSync(archivePath);

            this.loggers.system.info(`Optimized archive: ${archiveInfo.archive_filename}`, {
                originalCompressedSize: archiveInfo.compressed_size_bytes,
                optimizedSize: optimized.length,
                spaceSaved: archiveInfo.compressed_size_bytes - optimized.length
            });

        } catch (error) {
            
            this.loggers.system.error(`Failed to optimize archive ${archiveInfo.archive_filename}:`, error);
        }
    }

    async getRetentionStatistics() {
        try {
            const policies = await this.dal.all(`
                SELECT p.*, 
                       COUNT(h.id) as execution_count,
                       MAX(h.execution_date) as last_execution,
                       SUM(h.records_processed) as total_processed,
                       SUM(h.records_archived) as total_archived,
                       SUM(h.records_deleted) as total_deleted
                FROM retention_policies p
                LEFT JOIN retention_history h ON p.id = h.policy_id
                WHERE p.is_active = 1
                GROUP BY p.id
                ORDER BY p.name
            `);

            const archives = await this.dal.all(`
                SELECT original_table,
                       COUNT(*) as archive_count,
                       SUM(record_count) as total_records,
                       SUM(original_size_bytes) as total_original_size,
                       SUM(compressed_size_bytes) as total_compressed_size,
                       MIN(date_from) as earliest_date,
                       MAX(date_to) as latest_date
                FROM archived_logs_metadata
                GROUP BY original_table
            `);

            const totalStats = await this.dal.get(`
                SELECT COUNT(*) as total_archives,
                       SUM(record_count) as total_archived_records,
                       SUM(original_size_bytes) as total_original_size,
                       SUM(compressed_size_bytes) as total_compressed_size
                FROM archived_logs_metadata
            `);

            return {
                policies,
                archives,
                totalStats: {
                    ...totalStats,
                    compressionRatio: totalStats.total_original_size > 0 
                        ? (totalStats.total_compressed_size / totalStats.total_original_size).toFixed(2)
                        : 0,
                    spaceSaved: totalStats.total_original_size - totalStats.total_compressed_size
                },
                runtimeStats: this.statistics,
                lastCleanup: this.lastCleanup,
                isProcessing: this.isProcessing
            };
        } catch (error) {
            
            this.loggers.system.error('Failed to get retention statistics:', error);
            return null;
        }
    }

    async createRetentionPolicy(policyData) {
        try {
            const result = await this.dal.run(`
                INSERT INTO retention_policies (
                    name, description, target_table, retention_days,
                    archive_enabled, compression_enabled, delete_after_archive
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                policyData.name,
                policyData.description,
                policyData.table_name,
                policyData.retention_days,
                policyData.archive_enabled ? 1 : 0,
                policyData.compression_enabled ? 1 : 0,
                policyData.delete_after_archive ? 1 : 0
            ]);

            await this.loadRetentionPolicies();
            return { success: true, id: result.lastID };
        } catch (error) {
            
            this.loggers.system.error('Failed to create retention policy:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRetentionPolicy(policyId, updates) {
        try {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(field => `${field} = ?`).join(', ');

            await this.dal.run(`
                UPDATE retention_policies 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [...values, policyId]);

            await this.loadRetentionPolicies();
            return { success: true };
        } catch (error) {
            
            this.loggers.system.error('Failed to update retention policy:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteRetentionPolicy(policyId) {
        try {
            await this.dal.run(`
                UPDATE retention_policies 
                SET is_active = 0
                WHERE id = ?
            `, [policyId]);

            await this.loadRetentionPolicies();
            return { success: true };
        } catch (error) {
            
            this.loggers.system.error('Failed to delete retention policy:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreFromArchive(archiveId, targetTable = null) {
        try {
            
            
            const archive = await this.dal.get(`
                SELECT * FROM archived_logs_metadata WHERE id = ?
            `, [archiveId]);

            if (!archive) {
                throw new Error('Archive not found');
            }

            const archivePath = archive.archive_path;
            if (!fs.existsSync(archivePath)) {
                throw new Error('Archive file not found');
            }

            // Read archive data
            let jsonData;
            if (archivePath.endsWith('.gz')) {
                const compressed = fs.readFileSync(archivePath);
                jsonData = zlib.gunzipSync(compressed).toString();
            } else {
                jsonData = fs.readFileSync(archivePath, 'utf8');
            }

            const archiveData = JSON.parse(jsonData);
            const table = targetTable || archive.original_table;

            // Restore records to database
            let restored = 0;
            for (const record of archiveData.records) {
                try {
                    const fields = Object.keys(record);
                    const values = Object.values(record);
                    const placeholders = fields.map(() => '?').join(', ');
                    const fieldsList = fields.join(', ');

                    await this.dal.run(`
                        INSERT INTO ${table} (${fieldsList}) 
                        VALUES (${placeholders})
                    `, values);
                    restored++;
                } catch (error) {
                    // Skip duplicate records
                    continue;
                }
            }

            this.loggers.system.info(`Restored ${restored} records from archive ${archive.archive_filename}`);
            return { success: true, restored };

        } catch (error) {
            
            this.loggers.system.error('Failed to restore from archive:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = DataRetentionEngine;
