-- Migration 016: add email, avatar_path, and last_active_at to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email          VARCHAR(255)             DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path    VARCHAR(500)             DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
