-- PostgreSQL Schema Fixes
-- Fixes for missing columns and constraints discovered during runtime

-- Add missing columns to streaming_statistics
ALTER TABLE streaming_statistics ADD COLUMN IF NOT EXISTS connected_clients INTEGER DEFAULT 0;
ALTER TABLE streaming_statistics ADD COLUMN IF NOT EXISTS messages_per_second REAL DEFAULT 0;
ALTER TABLE streaming_statistics ADD COLUMN IF NOT EXISTS bytes_per_second REAL DEFAULT 0;
ALTER TABLE streaming_statistics ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE streaming_statistics ALTER COLUMN session_id DROP NOT NULL;

-- Add missing columns to failed_operations_queue
ALTER TABLE failed_operations_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Add missing columns to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS created_by INTEGER;

-- Add missing columns to anomaly_patterns
ALTER TABLE anomaly_patterns ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false;

-- Create notification_channels table if missing
CREATE TABLE IF NOT EXISTS notification_channels (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create failed_operations_queue table if missing
CREATE TABLE IF NOT EXISTS failed_operations_queue (
    id SERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL,
    operation_data JSONB NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    priority INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    next_retry_at TIMESTAMPTZ
);
