-- Migration: add discord_id and verified flag to users
-- Adds ability to store a user's Discord ID and whether it's verified
-- Run after backing up your database.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_verified BOOLEAN DEFAULT false;

COMMIT;

-- After running, you may want to update the application to allow users
-- to set `discord_id` and implement a verification step before using it.
