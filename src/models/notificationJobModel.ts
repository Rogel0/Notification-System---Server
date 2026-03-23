import pool from "../db";
import { Event } from "../types/event";

const scheduleWindows = [
  { stage: "3_days_before", offsetMillis: 1000 * 60 * 60 * 24 * 3 },
  { stage: "24_hours_before", offsetMillis: 1000 * 60 * 60 * 24 },
  { stage: "3_hours_before", offsetMillis: 1000 * 60 * 60 * 3 },
  { stage: "15_minutes_before", offsetMillis: 1000 * 60 * 15 },
  { stage: "exact", offsetMillis: 0 },
];

function parseStoredDate(datetime: string | Date): Date {
  if (datetime instanceof Date) return datetime;
  const s = String(datetime).trim();
  if (/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = Number(ss || "0");
    const utcMillis = Date.UTC(year, month, day, hour - 8, minute, second);
    return new Date(utcMillis);
  }
  const spaceMatch = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (spaceMatch) {
    const [, y, m, d, hh, mm, ss] = spaceMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = Number(ss || "0");
    const utcMillis = Date.UTC(year, month, day, hour - 8, minute, second);
    return new Date(utcMillis);
  }
  return new Date(s);
}

export async function createOrUpdateJobsForEvent(event: Event): Promise<void> {
  const eventDate = parseStoredDate(event.datetime);
  const eventMillis = eventDate.getTime();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const win of scheduleWindows) {
      const runAt = new Date(eventMillis - win.offsetMillis).toISOString();
      await client.query(
        `INSERT INTO notification_jobs (event_id, stage, run_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id, stage) DO UPDATE
           SET run_at = EXCLUDED.run_at, status = 'pending', attempts = 0, updated_at = NOW()`,
        [event.id, win.stage, runAt],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteJobsForEvent(eventId: number): Promise<void> {
  await pool.query("DELETE FROM notification_jobs WHERE event_id = $1", [eventId]);
}

export async function getDueJobs(limit = 100): Promise<any[]> {
  const result = await pool.query(
    "SELECT * FROM notification_jobs WHERE status = 'pending' AND run_at <= NOW() ORDER BY run_at ASC LIMIT $1",
    [limit],
  );
  return result.rows;
}

export async function markJobAttempt(jobId: number, success: boolean, lastError?: string): Promise<void> {
  if (success) {
    await pool.query(
      "UPDATE notification_jobs SET status = 'done', attempts = attempts + 1, last_error = NULL, updated_at = NOW() WHERE id = $1",
      [jobId],
    );
    return;
  }

  // failure: increment attempts; if attempts >= 3 mark failed else keep pending
  await pool.query(
    `UPDATE notification_jobs
     SET attempts = attempts + 1, last_error = $2, updated_at = NOW(),
         status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END
     WHERE id = $1`,
    [jobId, lastError || null],
  );
}

export async function getJobsForEvent(eventId: number): Promise<any[]> {
  const res = await pool.query("SELECT * FROM notification_jobs WHERE event_id = $1 ORDER BY run_at ASC", [eventId]);
  return res.rows;
}

export async function getUpcomingJobs(limit = 100): Promise<any[]> {
  const res = await pool.query("SELECT * FROM notification_jobs WHERE status = 'pending' AND run_at > NOW() ORDER BY run_at ASC LIMIT $1", [limit]);
  return res.rows;
}
