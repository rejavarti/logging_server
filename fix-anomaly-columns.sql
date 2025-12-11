-- Add missing columns to anomaly_rules and anomaly_patterns
ALTER TABLE anomaly_rules ADD COLUMN IF NOT EXISTS rule_config JSONB;
ALTER TABLE anomaly_rules ADD COLUMN IF NOT EXISTS alert_on_detection BOOLEAN DEFAULT true;

ALTER TABLE anomaly_patterns ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false;
ALTER TABLE anomaly_patterns ADD COLUMN IF NOT EXISTS confidence_required REAL DEFAULT 0.7;
