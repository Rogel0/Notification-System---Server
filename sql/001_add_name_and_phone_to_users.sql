-- Migration: add name and phone columns to users table
-- Run this against your PostgreSQL database (psql or any DB client)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(24);

-- Optional: add an index to phone for lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

-- If your users table does not exist, use the full create script below instead:
--
-- CREATE TABLE IF NOT EXISTS users (
--   id SERIAL PRIMARY KEY,
--   email VARCHAR(320) NOT NULL UNIQUE,
--   password VARCHAR(255) NOT NULL,
--   name VARCHAR(255),
--   phone VARCHAR(24),
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
-- );
