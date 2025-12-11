-- Add missing tables for PostgreSQL

-- Request metrics table
CREATE TABLE IF NOT EXISTS request_metrics (
    id SERIAL PRIMARY KEY,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    response_time INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Failed operations queue table
CREATE TABLE IF NOT EXISTS failed_operations_queue (
    id SERIAL PRIMARY KEY,
    operation_type TEXT,
    payload JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_failed_ops_processed ON failed_operations_queue(processed_at);
CREATE INDEX IF NOT EXISTS idx_request_metrics_timestamp ON request_metrics(timestamp);
