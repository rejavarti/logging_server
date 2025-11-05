const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

/**
 * DATABASE MIGRATION SCRIPT
 * Ensures all required tables exist for the enterprise logging platform
 * Run this script to create missing tables and update schema
 */

class DatabaseMigration {
    constructor(databasePath, logger) {
        this.databasePath = databasePath;
        this.logger = logger || console;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.databasePath, (err) => {
                if (err) {
                    this.logger.error('Error connecting to database:', err);
                    reject(err);
                } else {
                    this.logger.info('Connected to database for migration');
                    resolve();
                }
            });
        });
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async tableExists(tableName) {
        const result = await this.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", 
            [tableName]
        );
        return !!result;
    }

    async createCoreSystemTables() {
        this.logger.info('Creating core system tables...');

        // Core logs table
        if (!await this.tableExists('logs')) {
            await this.run(`
                CREATE TABLE logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    source TEXT,
                    message TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created logs table');
        }

        // Log events table for advanced analytics
        if (!await this.tableExists('log_events')) {
            await this.run(`
                CREATE TABLE log_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    source TEXT,
                    message TEXT NOT NULL,
                    raw_message TEXT,
                    metadata TEXT,
                    processed_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created log_events table');
        }

        // Users table
        if (!await this.tableExists('users')) {
            await this.run(`
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    email TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME,
                    active BOOLEAN DEFAULT 1,
                    mfa_enabled BOOLEAN DEFAULT 0,
                    mfa_secret TEXT,
                    preferences TEXT DEFAULT '{}',
                    session_token TEXT,
                    reset_token TEXT,
                    reset_expires DATETIME
                )
            `);
            this.logger.info('✅ Created users table');
        }

        // 🔧 ALTER TABLE: Add missing columns to existing tables if they don't exist
        try {
            // Add 'active' column to users table if missing
            const userColumns = await this.all("PRAGMA table_info(users)");
            const hasActiveColumn = userColumns.some(col => col.name === 'active');
            if (!hasActiveColumn) {
                await this.run(`ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT 1`);
                this.logger.info('✅ Added active column to users table');
            }
        } catch (error) {
            this.logger.warn('⚠️ Could not add active column to users table (might already exist)');
        }

        // User sessions table
        if (!await this.tableExists('user_sessions')) {
            await this.run(`
                CREATE TABLE user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token TEXT UNIQUE NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created user_sessions table');
        }

        // User theme preferences table - EXACT MATCH to monolithic
        if (!await this.tableExists('user_theme_preferences')) {
            await this.run(`
                CREATE TABLE user_theme_preferences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    theme TEXT DEFAULT 'auto',
                    sidebar_collapsed BOOLEAN DEFAULT 0,
                    dashboard_layout TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created user_theme_preferences table');
        }

        // System settings table
        if (!await this.tableExists('system_settings')) {
            await this.run(`
                CREATE TABLE system_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    setting_key TEXT UNIQUE NOT NULL,
                    setting_value TEXT,
                    description TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created system_settings table');
        }

        // Activity log table
        if (!await this.tableExists('activity_log')) {
            await this.run(`
                CREATE TABLE activity_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id INTEGER,
                    details TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created activity_log table');
        }

        // System metrics table
        if (!await this.tableExists('system_metrics')) {
            await this.run(`
                CREATE TABLE system_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    metric_type TEXT DEFAULT 'gauge',
                    tags TEXT,
                    timestamp TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created system_metrics table');
        }
    }

    async createWebhooksAndIntegrations() {
        this.logger.info('Creating webhooks and integrations tables...');

        // Webhooks table - EXACT MATCH to monolithic
        if (!await this.tableExists('webhooks')) {
            await this.run(`
                CREATE TABLE webhooks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    method TEXT DEFAULT 'POST',
                    headers TEXT DEFAULT '{}',
                    active BOOLEAN DEFAULT 1,
                    secret TEXT,
                    events TEXT DEFAULT '["all"]',
                    filter_conditions TEXT,
                    retry_count INTEGER DEFAULT 3,
                    timeout INTEGER DEFAULT 30000,
                    last_triggered DATETIME,
                    total_calls INTEGER DEFAULT 0,
                    success_calls INTEGER DEFAULT 0,
                    failed_calls INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `);
            this.logger.info('✅ Created webhooks table');
        }

        // Webhook deliveries table - EXACT MATCH to monolithic
        if (!await this.tableExists('webhook_deliveries')) {
            await this.run(`
                CREATE TABLE webhook_deliveries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    webhook_id INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    response_code INTEGER,
                    response_body TEXT,
                    delivery_status TEXT DEFAULT 'pending',
                    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    delivered_at DATETIME,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    FOREIGN KEY (webhook_id) REFERENCES webhooks (id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created webhook_deliveries table');
        }

        // Integrations table - EXACT MATCH to monolithic
        if (!await this.tableExists('integrations')) {
            await this.run(`
                CREATE TABLE integrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT DEFAULT 'disabled',
                    config TEXT DEFAULT '{}',
                    last_sync DATETIME,
                    error_count INTEGER DEFAULT 0,
                    last_error TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created integrations table');
        }

        // Integration health table - EXACT MATCH to monolithic
        if (!await this.tableExists('integration_health')) {
            await this.run(`
                CREATE TABLE integration_health (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    integration_name TEXT NOT NULL,
                    status TEXT DEFAULT 'unknown',
                    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
                    response_time INTEGER DEFAULT 0,
                    error_count INTEGER DEFAULT 0,
                    last_error TEXT,
                    uptime_percentage REAL DEFAULT 100.0,
                    last_success DATETIME,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created integration_health table');
        }

        // Integration metrics table - EXACT MATCH to monolithic
        if (!await this.tableExists('integration_metrics')) {
            await this.run(`
                CREATE TABLE integration_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    integration_name TEXT NOT NULL,
                    metric_type TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    details TEXT DEFAULT '{}'
                )
            `);
            this.logger.info('✅ Created integration_metrics table');
        }

        // Custom integrations table - EXACT MATCH to monolithic
        if (!await this.tableExists('custom_integrations')) {
            await this.run(`
                CREATE TABLE custom_integrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    type TEXT NOT NULL,
                    config TEXT DEFAULT '{}',
                    script_content TEXT,
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `);
            this.logger.info('✅ Created custom_integrations table');
        }

        // Integration configs table - EXACT MATCH to monolithic
        if (!await this.tableExists('integration_configs')) {
            await this.run(`
                CREATE TABLE integration_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    integration_name TEXT NOT NULL UNIQUE,
                    config TEXT NOT NULL DEFAULT '{}',
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created integration_configs table');
        }
    }

    async createSearchAndAlertingTables() {
        this.logger.info('Creating search and alerting tables...');

        // Saved searches table
        if (!await this.tableExists('saved_searches')) {
            await this.run(`
                CREATE TABLE saved_searches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    query TEXT NOT NULL,
                    level TEXT,
                    source TEXT,
                    start_date TEXT,
                    end_date TEXT,
                    regex_enabled INTEGER DEFAULT 0,
                    case_sensitive INTEGER DEFAULT 0,
                    user_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created saved_searches table');
        }

        // API keys table
        if (!await this.tableExists('api_keys')) {
            await this.run(`
                CREATE TABLE api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    key_hash TEXT UNIQUE NOT NULL,
                    permissions TEXT,
                    enabled INTEGER DEFAULT 1,
                    expires_at TEXT,
                    user_id INTEGER,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created api_keys table');
        }

        // Alert rules table - EXACT MATCH to monolithic schema
        if (!await this.tableExists('alert_rules')) {
            await this.run(`
                CREATE TABLE alert_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    type TEXT NOT NULL DEFAULT 'pattern',
                    condition TEXT NOT NULL,
                    severity TEXT DEFAULT 'warning',
                    cooldown INTEGER DEFAULT 300,
                    enabled BOOLEAN DEFAULT 1,
                    channels TEXT DEFAULT '[]',
                    escalation_rules TEXT,
                    trigger_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created alert_rules table');
        }

        // Alert history table
        if (!await this.tableExists('alert_history')) {
            await this.run(`
                CREATE TABLE alert_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule_id INTEGER NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT,
                    triggered_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created alert_history table');
        }

        // Notification channels table
        if (!await this.tableExists('notification_channels')) {
            await this.run(`
                CREATE TABLE notification_channels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    configuration TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created notification_channels table');
        }

        // Alert escalations table (for enhanced escalation management)
        if (!await this.tableExists('alert_escalations')) {
            await this.run(`
                CREATE TABLE alert_escalations (
                    id TEXT PRIMARY KEY,
                    alert_id INTEGER NOT NULL,
                    level INTEGER NOT NULL,
                    channels TEXT NOT NULL,
                    next_escalation_at TEXT NOT NULL,
                    notification_sent INTEGER DEFAULT 0,
                    triggered_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (alert_id) REFERENCES alert_history(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created alert_escalations table');
        }

        // System alerts table
        if (!await this.tableExists('system_alerts')) {
            await this.run(`
                CREATE TABLE system_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT,
                    acknowledged INTEGER DEFAULT 0,
                    acknowledged_by INTEGER,
                    acknowledged_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created system_alerts table');
        }
    }

    async createEnterpriseEngineTables() {
        this.logger.info('Creating enterprise engine tables...');

        // Data retention tables
        if (!await this.tableExists('retention_policies')) {
            await this.run(`
                CREATE TABLE retention_policies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    target_table TEXT NOT NULL,
                    retention_days INTEGER NOT NULL,
                    archive_enabled INTEGER DEFAULT 1,
                    compression_enabled INTEGER DEFAULT 1,
                    delete_after_archive INTEGER DEFAULT 0,
                    rules TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created retention_policies table');
        }

        if (!await this.tableExists('retention_history')) {
            await this.run(`
                CREATE TABLE retention_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    records_affected INTEGER,
                    details TEXT,
                    executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (policy_id) REFERENCES retention_policies(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created retention_history table');
        }

        if (!await this.tableExists('archived_logs_metadata')) {
            await this.run(`
                CREATE TABLE archived_logs_metadata (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    archive_file TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    record_count INTEGER,
                    compressed_size INTEGER,
                    original_size INTEGER,
                    checksum TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created archived_logs_metadata table');
        }

        // Dashboard tables
        if (!await this.tableExists('dashboards')) {
            await this.run(`
                CREATE TABLE dashboards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    configuration TEXT,
                    widgets TEXT,
                    user_id INTEGER,
                    is_public INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created dashboards table');
        }

        if (!await this.tableExists('dashboard_widgets')) {
            await this.run(`
                CREATE TABLE dashboard_widgets (
                    id TEXT PRIMARY KEY,
                    dashboard_id TEXT,
                    widget_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    position_x INTEGER DEFAULT 0,
                    position_y INTEGER DEFAULT 0,
                    width INTEGER DEFAULT 4,
                    height INTEGER DEFAULT 3,
                    config TEXT,
                    data_source TEXT,
                    refresh_interval INTEGER DEFAULT 30,
                    is_enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
                )
            `);
            this.logger.info('✅ Created dashboard_widgets table');
        }

        // 🔧 ALTER TABLE: Add missing columns to dashboard_widgets if they don't exist
        try {
            // Add 'dashboard_id' column to dashboard_widgets table if missing
            const widgetColumns = await this.all("PRAGMA table_info(dashboard_widgets)");
            const hasDashboardIdColumn = widgetColumns.some(col => col.name === 'dashboard_id');
            if (!hasDashboardIdColumn) {
                await this.run(`ALTER TABLE dashboard_widgets ADD COLUMN dashboard_id TEXT`);
                this.logger.info('✅ Added dashboard_id column to dashboard_widgets table');
            }
        } catch (error) {
            this.logger.warn('⚠️ Could not add dashboard_id column to dashboard_widgets table (might already exist)');
        }

        if (!await this.tableExists('widget_templates')) {
            await this.run(`
                CREATE TABLE widget_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    widget_type TEXT NOT NULL,
                    default_config TEXT,
                    category TEXT,
                    is_system BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created widget_templates table');
        }

        // Real-time streaming tables
        if (!await this.tableExists('streaming_sessions')) {
            await this.run(`
                CREATE TABLE streaming_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE NOT NULL,
                    user_id INTEGER,
                    filters TEXT,
                    connection_info TEXT,
                    active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created streaming_sessions table');
        }

        if (!await this.tableExists('streaming_filters')) {
            await this.run(`
                CREATE TABLE streaming_filters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    filter_type TEXT NOT NULL,
                    filter_value TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES streaming_sessions(session_id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created streaming_filters table');
        }

        if (!await this.tableExists('streaming_statistics')) {
            await this.run(`
                CREATE TABLE streaming_statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    connected_clients INTEGER,
                    messages_per_second REAL,
                    bytes_per_second REAL,
                    average_latency_ms REAL,
                    error_count INTEGER DEFAULT 0
                )
            `);
            this.logger.info('✅ Created streaming_statistics table');
        }

        // Anomaly detection tables
        if (!await this.tableExists('anomaly_detections')) {
            await this.run(`
                CREATE TABLE anomaly_detections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule_id INTEGER,
                    log_id INTEGER,
                    anomaly_type TEXT NOT NULL,
                    score REAL NOT NULL,
                    details TEXT,
                    detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created anomaly_detections table');
        }

        if (!await this.tableExists('anomaly_rules')) {
            await this.run(`
                CREATE TABLE anomaly_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    rule_type TEXT NOT NULL DEFAULT 'threshold',
                    rule_config TEXT NOT NULL,
                    threshold REAL DEFAULT 0.8,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created anomaly_rules table');
        }

        // Log correlation tables
        if (!await this.tableExists('log_correlations')) {
            await this.run(`
                CREATE TABLE log_correlations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    correlation_id TEXT NOT NULL,
                    rule_id INTEGER,
                    log_ids TEXT NOT NULL,
                    pattern TEXT NOT NULL,
                    confidence_score REAL NOT NULL,
                    details TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created log_correlations table');
        }

        if (!await this.tableExists('correlation_rules')) {
            await this.run(`
                CREATE TABLE correlation_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    rule_config TEXT NOT NULL,
                    time_window INTEGER DEFAULT 300,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created correlation_rules table');
        }

        // 🆕 LOG FILE ANALYZER TABLES
        this.logger.info('🔄 Creating Log File Analyzer tables...');
        
        if (!await this.tableExists('uploaded_files')) {
            await this.run(`
                CREATE TABLE uploaded_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_filename TEXT NOT NULL,
                    stored_filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    mime_type TEXT,
                    upload_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    parsing_status TEXT DEFAULT 'pending',
                    format_detected TEXT,
                    detection_confidence REAL,
                    parsing_started TEXT,
                    parsing_completed TEXT,
                    analysis_id INTEGER,
                    error_message TEXT,
                    FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created uploaded_files table');
        }

        if (!await this.tableExists('file_analysis')) {
            await this.run(`
                CREATE TABLE file_analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_id INTEGER NOT NULL,
                    format_used TEXT NOT NULL,
                    total_lines INTEGER NOT NULL,
                    parsed_lines INTEGER NOT NULL,
                    error_lines INTEGER NOT NULL,
                    success_rate INTEGER NOT NULL,
                    analysis_data TEXT NOT NULL,
                    analysis_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created file_analysis table');
        }

        if (!await this.tableExists('log_sources')) {
            await this.run(`
                CREATE TABLE log_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name TEXT NOT NULL UNIQUE,
                    source_type TEXT NOT NULL,
                    description TEXT,
                    category TEXT,
                    parsing_rules TEXT,
                    color_scheme TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_by INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created log_sources table');
        }

        if (!await this.tableExists('log_patterns')) {
            await this.run(`
                CREATE TABLE log_patterns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    analysis_id INTEGER NOT NULL,
                    pattern_text TEXT NOT NULL,
                    frequency INTEGER DEFAULT 1,
                    severity TEXT DEFAULT 'info',
                    first_seen TEXT,
                    last_seen TEXT,
                    examples TEXT,
                    pattern_hash TEXT,
                    FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created log_patterns table');
        }

        if (!await this.tableExists('parsed_log_entries')) {
            await this.run(`
                CREATE TABLE parsed_log_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    analysis_id INTEGER NOT NULL,
                    line_number INTEGER NOT NULL,
                    raw_line TEXT,
                    timestamp TEXT,
                    level TEXT,
                    message TEXT,
                    source TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    status_code INTEGER,
                    response_size INTEGER,
                    processing_time REAL,
                    parsed_fields TEXT,
                    error_message TEXT,
                    FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE CASCADE
                )
            `);
            this.logger.info('✅ Created parsed_log_entries table');
        }
    }

    async createIndexes() {
        this.logger.info('Creating database indexes for performance...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)',
            'CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)',
            'CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)',
            'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled)',
            'CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled)',
            'CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON alert_history(triggered_at)',
            'CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_anomaly_detections_detected_at ON anomaly_detections(detected_at)',
            'CREATE INDEX IF NOT EXISTS idx_log_correlations_created_at ON log_correlations(created_at)',
            // Log File Analyzer Indexes
            'CREATE INDEX IF NOT EXISTS idx_uploaded_files_upload_timestamp ON uploaded_files(upload_timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_uploaded_files_parsing_status ON uploaded_files(parsing_status)',
            'CREATE INDEX IF NOT EXISTS idx_uploaded_files_format_detected ON uploaded_files(format_detected)',
            'CREATE INDEX IF NOT EXISTS idx_file_analysis_file_id ON file_analysis(file_id)',
            'CREATE INDEX IF NOT EXISTS idx_file_analysis_format_used ON file_analysis(format_used)',
            'CREATE INDEX IF NOT EXISTS idx_file_analysis_timestamp ON file_analysis(analysis_timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_log_sources_source_type ON log_sources(source_type)',
            'CREATE INDEX IF NOT EXISTS idx_log_patterns_analysis_id ON log_patterns(analysis_id)',
            'CREATE INDEX IF NOT EXISTS idx_log_patterns_severity ON log_patterns(severity)',
            'CREATE INDEX IF NOT EXISTS idx_log_patterns_frequency ON log_patterns(frequency)',
            'CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_analysis_id ON parsed_log_entries(analysis_id)',
            'CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_timestamp ON parsed_log_entries(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_level ON parsed_log_entries(level)',
            'CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_ip_address ON parsed_log_entries(ip_address)'
        ];

        for (const index of indexes) {
            try {
                await this.run(index);
            } catch (error) {
                // Index might already exist, continue
                this.logger.debug(`Index creation skipped: ${error.message}`);
            }
        }

        this.logger.info('✅ Database indexes created');
    }

    async runMigration() {
        try {
            await this.connect();
            
            this.logger.info('🚀 Starting database migration...');
            
            // Create all required tables
            await this.createCoreSystemTables();
            await this.createWebhooksAndIntegrations();
            await this.createSearchAndAlertingTables();
            await this.createEnterpriseEngineTables();
            
            // Create performance indexes
            await this.createIndexes();
            
            // Optimize database
            await this.run('PRAGMA optimize');
            await this.run('ANALYZE');
            
            this.logger.info('✅ Database migration completed successfully!');
            
        } catch (error) {
            this.logger.error('❌ Database migration failed:', error);
            throw error;
        } finally {
            if (this.db) {
                this.db.close();
                this.logger.info('Database connection closed');
            }
        }
    }
}

// CLI execution
if (require.main === module) {
    const databasePath = process.argv[2] || './logging.db';
    const migration = new DatabaseMigration(databasePath);
    
    migration.runMigration()
        .then(() => {
            console.log('✅ Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseMigration;