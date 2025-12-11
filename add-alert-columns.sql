-- Add more missing columns to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS trigger_count INTEGER DEFAULT 0;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS last_triggered TIMESTAMPTZ;
