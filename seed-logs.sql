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
  'Seeded log entry #' || x || ' for dashboard testing',
  'seed-script'
FROM seq;

