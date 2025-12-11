-- Fix all missing PostgreSQL schema elements

-- 1. Add missing columns to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'pattern';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT '{}';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'warning';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS cooldown INTEGER DEFAULT 300;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '[]';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS escalation_rules JSONB;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;

-- 2. Add missing columns to request_metrics
ALTER TABLE request_metrics ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE request_metrics ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE request_metrics ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE request_metrics ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 3. Add missing column to failed_operations_queue
ALTER TABLE failed_operations_queue ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued';

-- 4. Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    data_type TEXT DEFAULT 'string',
    description TEXT,
    category TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- 5. Create anomaly_rules table
CREATE TABLE IF NOT EXISTS anomaly_rules (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL,
    parameters TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    confidence_threshold REAL DEFAULT 0.7,
    severity TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_triggered TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_anomaly_rules_enabled ON anomaly_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_anomaly_rules_type ON anomaly_rules(rule_type);

-- 6. Create anomaly_patterns table
CREATE TABLE IF NOT EXISTS anomaly_patterns (
    id SERIAL PRIMARY KEY,
    pattern_name TEXT UNIQUE NOT NULL,
    pattern_type TEXT NOT NULL,
    baseline_data JSONB,
    threshold_config JSONB,
    detection_window INTEGER DEFAULT 3600,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_anomaly_patterns_enabled ON anomaly_patterns(enabled);
CREATE INDEX IF NOT EXISTS idx_anomaly_patterns_type ON anomaly_patterns(pattern_type);

-- 7. Create streaming_statistics table
CREATE TABLE IF NOT EXISTS streaming_statistics (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    client_id TEXT,
    connection_start TIMESTAMPTZ DEFAULT NOW(),
    connection_end TIMESTAMPTZ,
    total_messages INTEGER DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    average_latency_ms INTEGER,
    peak_messages_per_second INTEGER,
    error_count INTEGER DEFAULT 0,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streaming_stats_session ON streaming_statistics(session_id);
CREATE INDEX IF NOT EXISTS idx_streaming_stats_client ON streaming_statistics(client_id);
CREATE INDEX IF NOT EXISTS idx_streaming_stats_activity ON streaming_statistics(last_activity);

-- 8. Create anomaly_detections table (if not exists from schema)
CREATE TABLE IF NOT EXISTS anomaly_detections (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    log_id INTEGER,
    anomaly_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    confidence_score REAL DEFAULT 0,
    description TEXT,
    pattern_data JSONB,
    context_data JSONB,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by INTEGER,
    false_positive BOOLEAN DEFAULT false,
    feedback_provided BOOLEAN DEFAULT false,
    FOREIGN KEY (log_id) REFERENCES logs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_anomaly_detections_timestamp ON anomaly_detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_type ON anomaly_detections(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_resolved ON anomaly_detections(resolved);

-- 9. Create log_correlations table
CREATE TABLE IF NOT EXISTS log_correlations (
    id SERIAL PRIMARY KEY,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    event_count INTEGER DEFAULT 0,
    time_window INTEGER DEFAULT 300,
    confidence_score REAL DEFAULT 0,
    threshold_value REAL DEFAULT 0,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    first_event_time TIMESTAMPTZ,
    last_event_time TIMESTAMPTZ,
    events_json JSONB,
    alert_triggered BOOLEAN DEFAULT false,
    alert_sent_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_log_correlations_rule ON log_correlations(rule_id);
CREATE INDEX IF NOT EXISTS idx_log_correlations_detected ON log_correlations(detected_at);
CREATE INDEX IF NOT EXISTS idx_log_correlations_resolved ON log_correlations(resolved);

-- 10. Create streaming_sessions table
CREATE TABLE IF NOT EXISTS streaming_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    client_id TEXT,
    user_id INTEGER,
    connection_time TIMESTAMPTZ DEFAULT NOW(),
    disconnect_time TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    filters JSONB,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_streaming_sessions_session ON streaming_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_active ON streaming_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_user ON streaming_sessions(user_id);
