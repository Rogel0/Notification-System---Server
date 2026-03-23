-- Migration: convert events.datetime (timestamp without time zone)
-- into a timestamptz column, interpreting existing values as Asia/Manila local time.
-- IMPORTANT: back up your database before running this.

BEGIN;

-- Add a new temporary timestamptz column
ALTER TABLE events ADD COLUMN datetime_tz timestamptz;

-- Populate datetime_tz by treating the existing datetime values as Asia/Manila local time
-- and converting them to proper timestamptz instants.
UPDATE events
SET datetime_tz = (datetime::text || ' Asia/Manila')::timestamptz
WHERE datetime IS NOT NULL;

-- You may want to inspect results now before proceeding. If satisfied, continue.

-- Drop the old column and rename the new one to datetime
ALTER TABLE events DROP COLUMN datetime;
ALTER TABLE events RENAME COLUMN datetime_tz TO datetime;

COMMIT;

-- Notes:
-- - This assumes the current stored `datetime` values in `events` are local Asia/Manila timestamps
--   (no timezone) and converts them into UTC-based timestamptz values representing the same instant.
-- - Test on a copy or backup first. If you prefer a non-destructive approach, skip the DROP/RENAME
--   and inspect `datetime_tz` first.
