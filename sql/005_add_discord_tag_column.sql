-- Migration: add discord_tag to users
-- Run after backing up your database.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_tag TEXT;

COMMIT;

-- After running this migration, new registrations can store `discord_tag` for username#1234.
`