-- Migration: Add Missing Tables for Complete Feature Support
-- Date: November 11, 2025
-- Purpose: Add themes, settings, saved_searches, webhook_deliveries, request_metrics tables

-- 1. THEMES TABLE
-- Stores custom themes and built-in theme definitions
CREATE TABLE IF NOT EXISTS themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    data TEXT NOT NULL,  -- JSON: {colors, fonts, spacing, borderRadius, shadows}
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_builtin INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed built-in themes
INSERT OR IGNORE INTO themes (id, name, data, is_builtin) VALUES 
(1, 'Default Light', '{"colors":{"primary":"#3b82f6","secondary":"#f8fafc","accent":"#0ea5e9","background":"#ffffff","surface":"#f1f5f9","text":"#1e293b","textSecondary":"#64748b","textMuted":"#94a3b8","border":"#e2e8f0","success":"#10b981","warning":"#f59e0b","error":"#ef4444","info":"#3b82f6"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.1)","medium":"0 4px 6px rgba(0,0,0,0.1)","large":"0 10px 15px rgba(0,0,0,0.1)"}}', 1),
(2, 'Dark Professional', '{"colors":{"primary":"#60a5fa","secondary":"#0f172a","accent":"#38bdf8","background":"#1e293b","surface":"#334155","text":"#f8fafc","textSecondary":"#cbd5e1","textMuted":"#94a3b8","border":"#475569","success":"#34d399","warning":"#fbbf24","error":"#f87171","info":"#60a5fa"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.3)","medium":"0 4px 6px rgba(0,0,0,0.3)","large":"0 10px 15px rgba(0,0,0,0.3)"}}', 1),
(3, 'Ocean Blue', '{"colors":{"primary":"#0ea5e9","secondary":"#0c4a6e","accent":"#06b6d4","background":"#0c4a6e","surface":"#075985","text":"#e0f2fe","textSecondary":"#bae6fd","textMuted":"#7dd3fc","border":"#0369a1","success":"#22d3ee","warning":"#fcd34d","error":"#fb7185","info":"#38bdf8"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.4)","medium":"0 4px 6px rgba(0,0,0,0.4)","large":"0 10px 15px rgba(0,0,0,0.4)"}}', 1);

-- 2. SETTINGS TABLE
-- Stores system-wide configurable settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    data_type TEXT DEFAULT 'string',  -- 'string', 'number', 'boolean', 'json'
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value, description, category, data_type) VALUES
('system.name', 'Enhanced Universal Logging Platform', 'System display name', 'general', 'string'),
('system.timezone', 'America/Edmonton', 'Server timezone', 'general', 'string'),
('system.environment', 'production', 'Deployment environment', 'general', 'string'),
('logs.retention_days', '90', 'Log retention period in days', 'logs', 'number'),
('logs.max_size_mb', '1000', 'Maximum log storage size', 'logs', 'number'),
('backup.auto_enabled', 'true', 'Enable automatic backups', 'backup', 'boolean'),
('backup.auto_schedule', '0 2 * * *', 'Backup cron schedule (2 AM daily)', 'backup', 'string'),
('backup.retention_count', '7', 'Number of backups to retain', 'backup', 'number'),
('server.port', '10180', 'HTTP server port', 'server', 'number'),
('server.ssl_enabled', 'false', 'Enable HTTPS', 'server', 'boolean'),
('features.distributed_tracing', 'false', 'Enable distributed tracing', 'features', 'boolean'),
('features.api_keys', 'true', 'Enable API key authentication', 'features', 'boolean'),
('features.audit_logging', 'true', 'Enable audit trail', 'features', 'boolean');

-- 3. SAVED SEARCHES TABLE
-- Stores user-created saved searches
CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    query_data TEXT NOT NULL,  -- JSON: {query, filters, dateRange, severity, source}
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used TEXT,
    use_count INTEGER DEFAULT 0,
    is_shared INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(created_by);
CREATE INDEX IF NOT EXISTS idx_saved_searches_shared ON saved_searches(is_shared);

-- 4. WEBHOOK DELIVERIES TABLE
-- Tracks webhook delivery attempts and outcomes
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL,
    status TEXT NOT NULL,  -- 'success', 'failed', 'pending', 'retrying'
    status_code INTEGER,
    request_body TEXT,
    response_body TEXT,
    response_headers TEXT,
    error TEXT,
    attempt_number INTEGER DEFAULT 1,
    delivered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_time ON webhook_deliveries(delivered_at);

-- 5. REQUEST METRICS TABLE
-- Tracks API request statistics for real metrics
CREATE TABLE IF NOT EXISTS request_metrics (
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
);

CREATE INDEX IF NOT EXISTS idx_request_metrics_endpoint ON request_metrics(endpoint);
CREATE INDEX IF NOT EXISTS idx_request_metrics_timestamp ON request_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_metrics_user ON request_metrics(user_id);

-- 6. BACKUP MANIFEST TABLE
-- Tracks created backups with metadata
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    filepath TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    backup_type TEXT DEFAULT 'manual',  -- 'manual', 'automatic', 'scheduled'
    include_logs INTEGER DEFAULT 1,
    compression TEXT DEFAULT 'gzip',
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed',  -- 'in_progress', 'completed', 'failed'
    error TEXT,
    tables_included TEXT,  -- JSON array
    record_count INTEGER,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(backup_type);

-- Migration complete
-- 7. ROLES TABLE (added for RBAC and dynamic role listing)
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT NOT NULL, -- JSON array of permission strings
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed default roles if not present
INSERT OR IGNORE INTO roles (id, name, description, permissions) VALUES 
(1, 'admin', 'Full administrative access', '["admin:*","logs:*","dashboards:*","users:*","settings:*"]'),
(2, 'analyst', 'Advanced log analysis access', '["logs:*","dashboards:*","search:*"]'),
(3, 'user', 'Standard user with read access', '["logs:read","dashboards:read"]'),
(4, 'viewer', 'Read-only minimal role', '["logs:read","dashboards:read"]');

-- 8. INTEGRATION DOCS TABLE (stores per-integration type documentation)
CREATE TABLE IF NOT EXISTS integration_docs (
    type TEXT PRIMARY KEY,
    doc TEXT NOT NULL, -- Markdown or plain text
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed basic integration docs (only if not present)
INSERT OR IGNORE INTO integration_docs (type, doc) VALUES
("syslog", "Syslog Integration\n\nSend RFC5424 or RFC3164 formatted messages to the configured UDP/TCP ports. No placeholder data used."),
("gelf", "GELF Integration\n\nAccepts Graylog Extended Log Format (GELF) messages over UDP. Supports compressed JSON payloads."),
("beats", "Beats Integration\n\nAccepts events from Filebeat/Metricbeat via compatible input. Ensure proper host/port configuration."),
("fluent", "FluentD/FluentBit Integration\n\nReceives structured events over TCP in Fluent forward protocol. Configure tag for source differentiation."),
("file", "File Ingestion Integration\n\nDirectory watcher ingests .log/.jsonl files without mock data. Configure via FILE_INGESTION_* environment variables."),
("webhook", "Webhook Integration\n\nExternal services can POST JSON payloads to /api/ingest/webhook secured by API keys or auth tokens."),
("mqtt", "MQTT Integration\n\nSubscribe to topic(s) and transform inbound messages into log entries. Requires broker configuration."),
("tracing", "Distributed Tracing\n\nEnabled when TRACING_ENABLED=true and OpenTelemetry packages are available; spans exported to configured backend.");

-- 9. FILE INGESTION OFFSETS TABLE (persistent tracking of last read position per file)
CREATE TABLE IF NOT EXISTS file_ingestion_offsets (
    file_path TEXT PRIMARY KEY,
    last_offset INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 10. PARSE ERRORS TABLE (records unparsable ingestion lines for UI notifications)
CREATE TABLE IF NOT EXISTS parse_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    file_path TEXT,
    line_number INTEGER,
    line_snippet TEXT,
    reason TEXT,
    acknowledged INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parse_errors_created ON parse_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_parse_errors_ack ON parse_errors(acknowledged);

