-- Migration 014: add bio column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(500) DEFAULT NULL;
