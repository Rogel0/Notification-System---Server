-- Migration: move discord_discriminator values into discord_tag and remove old column
-- BACKUP your database before running this migration.

BEGIN;

-- If the discord_tag column does not exist, create it
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_tag TEXT;

-- Copy values from discord_discriminator into discord_tag when present
UPDATE users
SET discord_tag = discord_discriminator
WHERE discord_discriminator IS NOT NULL AND (discord_tag IS NULL OR discord_tag = '');

-- Optionally, remove the old discord_discriminator column
ALTER TABLE users DROP COLUMN IF EXISTS discord_discriminator;

COMMIT;
