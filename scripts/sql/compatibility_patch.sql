-- Compatibility patch to reduce schema/route mismatches
-- Safe to run multiple times

BEGIN TRANSACTION;

-- Create a sessions view to map to user_sessions for legacy references
CREATE VIEW IF NOT EXISTS sessions AS
SELECT 
    id,
    user_id,
    ip_address,
    user_agent,
    created_at,
    last_activity,
    expires_at,
    is_active AS active
FROM user_sessions;

-- Optional: create a users_admin view exposing status derived from active
CREATE VIEW IF NOT EXISTS users_admin AS
SELECT 
    id,
    username,
    email,
    role,
    CASE WHEN active = 1 THEN 'active' ELSE 'disabled' END AS status,
    created_at,
    last_login
FROM users;

COMMIT;
