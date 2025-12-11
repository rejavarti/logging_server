-- Create admin user for PostgreSQL (Password: Admin123!)
INSERT INTO users (username, password_hash, role, is_active, created_at) 
VALUES ('admin', '$2b$10$24jpz/dmboSYuVb4gEX/VuuzEtgxQkqb/ob2pG2dGfEhoxu0E77RO', 'admin', true, NOW())
ON CONFLICT (username) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
