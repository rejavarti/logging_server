CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    password TEXT,
    role TEXT,
    created_at TEXT,
    last_login TEXT
);

INSERT OR REPLACE INTO users (id, username, email, password, role, created_at) 
VALUES (1, 'admin', 'admin@enterprise.local', '$2b$10$ntFfSYj3Od1jlF4k9sj94.CtZGhZ6r37lom2oPF8TLZcQdjJb.U3O', 'admin', datetime('now'));
