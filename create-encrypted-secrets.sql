-- Create encrypted_secrets table for PostgreSQL
CREATE TABLE IF NOT EXISTS encrypted_secrets (
    id SERIAL PRIMARY KEY,
    key_name TEXT UNIQUE NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_key ON encrypted_secrets(key_name);
