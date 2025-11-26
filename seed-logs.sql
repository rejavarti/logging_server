-- Create logs table if not exists
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    source TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed 500 log entries with localtime timestamps for TODAY
-- Spread across last 3 hours to ensure all logs are from today
WITH RECURSIVE seq(x) AS (
  SELECT 0 
  UNION ALL 
  SELECT x+1 FROM seq LIMIT 500
)
INSERT INTO logs (timestamp, level, message, source)
SELECT 
  datetime('now', 'localtime', '-' || (x/167) || ' hours'),
  CASE (x%4) 
    WHEN 0 THEN 'info' 
    WHEN 1 THEN 'warning' 
    WHEN 2 THEN 'error' 
    ELSE 'debug' 
  END,
  'Seeded log entry #' || x || ' for dashboard testing with unified-test source',
  CASE (x%5)
    WHEN 0 THEN 'unified-test'
    WHEN 1 THEN 'api-service'
    WHEN 2 THEN 'database'
    WHEN 3 THEN 'auth-system'
    ELSE 'seed-script'
  END
FROM seq;

-- Seed activity_log entries for various actions (Issue #4 fix)
INSERT INTO activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
SELECT 
  1,
  CASE (x%8)
    WHEN 0 THEN 'login'
    WHEN 1 THEN 'view_dashboard'
    WHEN 2 THEN 'export_logs'
    WHEN 3 THEN 'create_integration'
    WHEN 4 THEN 'update_settings'
    WHEN 5 THEN 'delete_log'
    WHEN 6 THEN 'run_query'
    ELSE 'view_activity'
  END,
  CASE (x%4)
    WHEN 0 THEN 'log'
    WHEN 1 THEN 'integration'
    WHEN 2 THEN 'user'
    ELSE 'system'
  END,
  x,
  '{"source":"seed-script","test_data":true}',
  '192.168.1.' || (100 + (x % 50)),
  'Mozilla/5.0 (Seed Script)',
  datetime('now', 'localtime', '-' || ((x*2)/167) || ' hours')
FROM (
  WITH RECURSIVE activity_seq(x) AS (
    SELECT 0
    UNION ALL
    SELECT x+1 FROM activity_seq LIMIT 100
  )
  SELECT x FROM activity_seq
);