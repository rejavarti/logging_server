-- Add missing email column and fix active column reference
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB;

-- Create index on email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
