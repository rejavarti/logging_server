// Using UniversalSQLiteAdapter for cross-platform compatibility (sql.js on Windows)
const UniversalSQLiteAdapter = require('../universal-sqlite-adapter');
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
        this.adapter = new UniversalSQLiteAdapter(databasePath, logger);
    }

    async all(sql, params = []) {
        try {
            const rows = await this.adapter.all(sql, params);
            return rows || [];
        } catch (err) {
            throw err;
        }
    }

    async connect() {
        try {
            await this.adapter.init();
            this.db = this.adapter;
            this.logger.info('Connected to database for migration (using UniversalSQLiteAdapter)');
        } catch (err) {
            this.logger.error('Error connecting to database:', err);
            throw err;
        }
    }

    async run(sql, params = []) {
        try {
            const result = await this.adapter.run(sql, params);
            return result;
        } catch (err) {
            throw err;
        }
    }

    async get(sql, params = []) {
        try {
            const row = await this.adapter.get(sql, params);
            return row;
        } catch (err) {
            throw err;
        }
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
                    ip TEXT,
                    user_id INTEGER,
                    tags TEXT,
                    hostname TEXT,
                    raw_data TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created logs table');
        } else {
            // Add missing columns to existing logs table with pre-checks to avoid noisy warnings
            const logColumns = await this.all("PRAGMA table_info(logs)");
            const colNames = new Set(logColumns.map(c => c.name));
            if (!colNames.has('ip')) {
                try {
                    await this.run(`ALTER TABLE logs ADD COLUMN ip TEXT`);
                    this.logger.info('✅ Added ip column to logs table');
                } catch (error) {
                    this.logger.warn('⚠️ Could not add ip column to logs table (might already exist)');
                }
            }
            if (!colNames.has('user_id')) {
                try {
                    await this.run(`ALTER TABLE logs ADD COLUMN user_id INTEGER`);
                    this.logger.info('✅ Added user_id column to logs table');
                } catch (error) {
                    this.logger.warn('⚠️ Could not add user_id column to logs table (might already exist)');
                }
            }
            if (!colNames.has('tags')) {
                try {
                    await this.run(`ALTER TABLE logs ADD COLUMN tags TEXT`);
                    this.logger.info('✅ Added tags column to logs table');
                } catch (error) {
                    this.logger.warn('⚠️ Could not add tags column to logs table (might already exist)');
                }
            }
            // Add hostname column if missing (used by ingestion stats)
            if (!colNames.has('hostname')) {
                try {
                    await this.run(`ALTER TABLE logs ADD COLUMN hostname TEXT`);
                    this.logger.info('✅ Added hostname column to logs table');
                } catch (error) {
                    this.logger.warn('⚠️ Could not add hostname column to logs table (might already exist)');
                }
            }
            // Add raw_data column if missing (used by log ingestion)
            if (!colNames.has('raw_data')) {
                try {
                    await this.run(`ALTER TABLE logs ADD COLUMN raw_data TEXT`);
                    this.logger.info('✅ Added raw_data column to logs table');
                } catch (error) {
                    this.logger.warn('⚠️ Could not add raw_data column to logs table (might already exist)');
                }
            }
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

        // REQUEST METRICS TABLE - Track API request statistics
        if (!await this.tableExists('request_metrics')) {
            await this.run(`
                CREATE TABLE request_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT NOT NULL,
                    method TEXT NOT NULL,
                    status_code INTEGER,
                    response_time_ms INTEGER,
                    user_id INTEGER,
                    ip_address TEXT,
                    user_agent TEXT,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created request_metrics table');
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
        // Add 'active' column to users table if missing
        try {
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

        // Themes table (for UI theme management)
        if (!await this.tableExists('themes')) {
            await this.run(`
                CREATE TABLE themes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    data TEXT NOT NULL,
                    is_builtin INTEGER DEFAULT 0,
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created themes table');

            // Seed a couple of built-in themes for immediate availability
            try {
                const existing = await this.get('SELECT COUNT(1) as cnt FROM themes');
                if (!existing || existing.cnt === 0) {
                    const defaultLight = JSON.stringify({
                        colors: {
                            primary: '#3b82f6', secondary: '#8b5cf6', success: '#10b981', warning: '#f59e0b',
                            error: '#ef4444', info: '#06b6d4', background: '#ffffff', surface: '#f9fafb',
                            text: '#1f2937', textSecondary: '#6b7280', border: '#e5e7eb'
                        },
                        fonts: {
                            primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            mono: '"Fira Code", "Courier New", monospace'
                        },
                        spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
                        borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' }
                    });
                    const defaultDark = JSON.stringify({
                        colors: {
                            primary: '#1e40af', secondary: '#3730a3', success: '#059669', warning: '#d97706',
                            error: '#dc2626', info: '#0284c7', background: '#0f172a', surface: '#1e293b',
                            text: '#f1f5f9', textSecondary: '#cbd5e1', border: '#475569'
                        },
                        fonts: {
                            primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            mono: '"Fira Code", "Courier New", monospace'
                        },
                        spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
                        borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' }
                    });
                    await this.run('INSERT INTO themes (name, data, is_builtin) VALUES (?, ?, 1)', ['Default Light', defaultLight]);
                    await this.run('INSERT INTO themes (name, data, is_builtin) VALUES (?, ?, 1)', ['Default Dark', defaultDark]);
                    this.logger.info('🌈 Seeded built-in themes (Default Light, Default Dark)');
                }
            } catch (seedErr) {
                this.logger.warn('⚠️ Failed to seed themes (non-fatal):', seedErr.message);
            }
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
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            this.logger.info('✅ Created activity_log table');
        } else {
            // Ensure existing activity_log table has timestamp column
            const activityCols = await this.all("PRAGMA table_info(activity_log)");
            const colNames = new Set(activityCols.map(c => c.name));
            this.logger.info(`📋 activity_log existing columns: ${Array.from(colNames).join(', ')}`);
            if (!colNames.has('timestamp')) {
                try {
                    await this.run(`ALTER TABLE activity_log ADD COLUMN timestamp TEXT DEFAULT CURRENT_TIMESTAMP`);
                    this.logger.info('✅ Added timestamp column to activity_log table');
                } catch (error) {
                    this.logger.error('❌ Failed to add timestamp column to activity_log:', error.message);
                }
            } else {
                this.logger.info('✅ activity_log already has timestamp column');
            }
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

        // Roles table
        if (!await this.tableExists('roles')) {
            await this.run(`
                CREATE TABLE roles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    permissions TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created roles table');
            try {
                await this.run(`INSERT INTO roles (name, description, permissions) VALUES (?,?,?)`, ['admin', 'Full administrative access', '["admin:*","logs:*","dashboards:*","users:*","settings:*"]']);
                await this.run(`INSERT INTO roles (name, description, permissions) VALUES (?,?,?)`, ['analyst', 'Advanced log analysis access', '["logs:*","dashboards:*","search:*"]']);
                await this.run(`INSERT INTO roles (name, description, permissions) VALUES (?,?,?)`, ['user', 'Standard user read access', '["logs:read","dashboards:read"]']);
                await this.run(`INSERT INTO roles (name, description, permissions) VALUES (?,?,?)`, ['viewer', 'Minimal read-only access', '["logs:read","dashboards:read"]']);
                this.logger.info('🌱 Seeded default roles');
            } catch (seedErr) {
                this.logger.warn('⚠️ Failed seeding roles:', seedErr.message);
            }
        }

        // Integration docs table
        if (!await this.tableExists('integration_docs')) {
            await this.run(`
                CREATE TABLE integration_docs (
                    type TEXT PRIMARY KEY,
                    doc TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created integration_docs table');
            const seedDocs = [
                ['syslog', 'Syslog Integration\nSend RFC5424/RFC3164 messages to configured ports.'],
                ['gelf', 'GELF Integration\nAccepts Graylog Extended Log Format messages (UDP JSON).'],
                ['beats', 'Beats Integration\nAccepts Filebeat/Metricbeat events.'],
                ['fluent', 'FluentD/FluentBit Integration\nReceives structured forward protocol events.'],
                ['file', 'File Ingestion\nDirectory watcher ingests .log/.jsonl without mock data.'],
                ['webhook', 'Webhook Ingestion\nExternal services POST JSON payloads to ingestion endpoint.'],
                ['mqtt', 'MQTT Integration\nSubscribes to broker topics and converts messages to logs.'],
                ['tracing', 'Distributed Tracing\nEnabled with TRACING_ENABLED=true; exports spans to configured backend.']
            ];
            for (const [type, doc] of seedDocs) {
                try { await this.run(`INSERT INTO integration_docs (type, doc) VALUES (?, ?)`, [type, doc]); } catch (e) {}
            }
            this.logger.info('🌱 Seeded integration docs');
        }

        // File ingestion offsets table
        if (!await this.tableExists('file_ingestion_offsets')) {
            await this.run(`
                CREATE TABLE file_ingestion_offsets (
                    file_path TEXT PRIMARY KEY,
                    last_offset INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created file_ingestion_offsets table');
        }

        // Parse errors table (for non-blocking parse error notifications)
        if (!await this.tableExists('parse_errors')) {
            await this.run(`
                CREATE TABLE parse_errors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT,
                    file_path TEXT,
                    line_number INTEGER,
                    line_snippet TEXT,
                    reason TEXT,
                    acknowledged INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.logger.info('✅ Created parse_errors table');
            try {
                await this.run(`CREATE INDEX IF NOT EXISTS idx_parse_errors_created ON parse_errors(created_at)`);
                await this.run(`CREATE INDEX IF NOT EXISTS idx_parse_errors_ack ON parse_errors(acknowledged)`);
            } catch (e) {
                this.logger.warn('⚠️ Failed to create parse_errors indexes:', e.message);
            }
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

        // Ensure 'enabled' column exists on integrations table for boolean toggling API
        try {
            const integCols = await this.all("PRAGMA table_info(integrations)");
            const colNames = new Set(integCols.map(c => c.name));
            if (!colNames.has('enabled')) {
                await this.run(`ALTER TABLE integrations ADD COLUMN enabled INTEGER DEFAULT 1`);
                this.logger.info('✅ Added enabled column to integrations table');
                // Backfill enabled based on status values if present
                try {
                    await this.run(`UPDATE integrations SET enabled = CASE WHEN LOWER(COALESCE(status,'')) IN ('enabled','active') THEN 1 ELSE 0 END`);
                    this.logger.info('🔄 Backfilled integrations.enabled from integrations.status');
                } catch (bfErr) {
                    this.logger.warn('⚠️ Failed to backfill integrations.enabled (non-fatal):', bfErr.message);
                }
            }
        } catch (error) {
            this.logger.warn('⚠️ Could not verify/alter integrations table for enabled column:', error.message);
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
            
            // Seed default built-in integrations for health monitoring
            try {
                const existingIntegrations = await this.all('SELECT integration_name FROM integration_health');
                const existingNames = new Set(existingIntegrations.map(i => i.integration_name));
                
                const defaultIntegrations = [
                    {
                        name: 'websocket',
                        metadata: JSON.stringify({
                            enabled: true,
                            port: 3001,
                            description: 'WebSocket server for real-time log streaming'
                        })
                    },
                    {
                        name: 'mqtt',
                        metadata: JSON.stringify({
                            enabled: false,
                            broker: '',
                            description: 'MQTT broker integration for message-based logging'
                        })
                    },
                    {
                        name: 'homeassistant',
                        metadata: JSON.stringify({
                            enabled: false,
                            url: '',
                            description: 'Home Assistant integration for home automation logging'
                        })
                    },
                    {
                        name: 'unifi',
                        metadata: JSON.stringify({
                            enabled: false,
                            controller: '',
                            description: 'UniFi Network controller integration'
                        })
                    }
                ];
                
                for (const integration of defaultIntegrations) {
                    if (!existingNames.has(integration.name)) {
                        await this.run(
                            `INSERT INTO integration_health (integration_name, status, last_check, error_count, metadata) 
                             VALUES (?, 'unknown', CURRENT_TIMESTAMP, 0, ?)`,
                            [integration.name, integration.metadata]
                        );
                        this.logger.info(`✅ Seeded integration health: ${integration.name}`);
                    }
                }
            } catch (seedError) {
                this.logger.warn('⚠️ Failed to seed integration health (non-fatal):', seedError.message);
            }
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

        // Runtime alerts table (distinct from alert_rules/history)
        if (!await this.tableExists('alerts')) {
            await this.run(`
                CREATE TABLE alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    condition TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'open',
                    created TEXT DEFAULT CURRENT_TIMESTAMP,
                    data TEXT,
                    acknowledged INTEGER DEFAULT 0,
                    resolved INTEGER DEFAULT 0
                )
            `);
            this.logger.info('✅ Created alerts table');
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
            'CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created)',
            "CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)",
            'CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)',
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
            // Phase 1 Resilience Tables
            this.logger.info('🛡️ Creating resilience tables...');
            // transaction_log
            if (!await this.tableExists('transaction_log')) {
                await this.run(`
                    CREATE TABLE transaction_log (
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
                await this.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_status ON transaction_log(status, started_at)`);
                await this.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_table ON transaction_log(table_name, completed_at)`);
                this.logger.info('✅ Created transaction_log');
            }
            // failed_operations_queue
            if (!await this.tableExists('failed_operations_queue')) {
                await this.run(`
                    CREATE TABLE failed_operations_queue (
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
                await this.run(`CREATE INDEX IF NOT EXISTS idx_failed_ops_retry ON failed_operations_queue(status, next_retry_at)`);
                await this.run(`CREATE INDEX IF NOT EXISTS idx_failed_ops_priority ON failed_operations_queue(priority DESC, failed_at)`);
                this.logger.info('✅ Created failed_operations_queue');
            }
            // system_error_log
            if (!await this.tableExists('system_error_log')) {
                await this.run(`
                    CREATE TABLE system_error_log (
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
                await this.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_severity ON system_error_log(severity, resolved)`);
                await this.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_category ON system_error_log(error_category, error_timestamp)`);
                await this.run(`CREATE INDEX IF NOT EXISTS idx_sys_error_occurrence ON system_error_log(error_code, occurrence_count)`);
                this.logger.info('✅ Created system_error_log');
            }
            // database_health_log
            if (!await this.tableExists('database_health_log')) {
                await this.run(`
                    CREATE TABLE database_health_log (
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
                await this.run(`CREATE INDEX IF NOT EXISTS idx_db_health_timestamp ON database_health_log(check_timestamp)`);
                this.logger.info('✅ Created database_health_log');
            }
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
