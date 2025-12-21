-- Missing DAL tables for PostgreSQL

CREATE TABLE IF NOT EXISTS transaction_log (
    id BIGSERIAL PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL,
    operation_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_ids TEXT,
    sql_statement TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    user_id INTEGER,
    ip_address INET
);
CREATE INDEX IF NOT EXISTS idx_transaction_log_status ON transaction_log(status, started_at);
CREATE INDEX IF NOT EXISTS idx_transaction_log_table ON transaction_log(table_name, completed_at);

CREATE TABLE IF NOT EXISTS system_error_log (
    id BIGSERIAL PRIMARY KEY,
    error_timestamp TIMESTAMPTZ DEFAULT NOW(),
    error_category TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    affected_component TEXT,
    affected_function TEXT,
    severity TEXT DEFAULT 'error',
    user_id INTEGER,
    ip_address INET,
    request_id TEXT,
    recovery_attempted BOOLEAN DEFAULT FALSE,
    recovery_successful BOOLEAN DEFAULT FALSE,
    recovery_method TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by INTEGER,
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sys_error_severity ON system_error_log(severity, resolved);
CREATE INDEX IF NOT EXISTS idx_sys_error_category ON system_error_log(error_category, error_timestamp);
CREATE INDEX IF NOT EXISTS idx_sys_error_occurrence ON system_error_log(error_code, occurrence_count);

CREATE TABLE IF NOT EXISTS database_health_log (
    id BIGSERIAL PRIMARY KEY,
    check_timestamp TIMESTAMPTZ DEFAULT NOW(),
    database_size_mb REAL,
    table_count INTEGER,
    total_records BIGINT,
    logs_table_records BIGINT,
    corruption_detected BOOLEAN DEFAULT FALSE,
    integrity_check_passed BOOLEAN DEFAULT TRUE,
    vacuum_last_run TIMESTAMPTZ,
    backup_last_run TIMESTAMPTZ,
    avg_query_time_ms REAL,
    slow_queries_count INTEGER DEFAULT 0,
    disk_space_available_mb REAL,
    wal_size_mb REAL,
    checks_performed TEXT
);
CREATE INDEX IF NOT EXISTS idx_db_health_timestamp ON database_health_log(check_timestamp);
