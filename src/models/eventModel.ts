import pool from "../db";
import { Event } from "../types/event";

export async function createEvent(
  userId: number,
  type: string,
  title: string,
  datetime: string,
  details?: string,
): Promise<Event> {
  const result = await pool.query(
    "INSERT INTO events (user_id, type, title, datetime, details, status, notified_stages, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *",
    [userId, type, title, datetime, details || null, "upcoming", []],
  );
  return result.rows[0];
}

export async function getAllPendingEvents(): Promise<Event[]> {
  const result = await pool.query(
    "SELECT * FROM events WHERE status != 'completed' ORDER BY datetime ASC",
  );
  return result.rows;
}

export async function markEventStagesNotified(
  eventId: number,
  stages: string[],
): Promise<void> {
  await pool.query(
    "UPDATE events SET notified_stages = $1, updated_at = NOW() WHERE id = $2",
    [stages, eventId],
  );
}

export async function getEventsByUser(userId: number): Promise<Event[]> {
  const result = await pool.query(
    "SELECT * FROM events WHERE user_id = $1 ORDER BY datetime ASC",
    [userId],
  );
  return result.rows;
}

export async function getEventById(
  id: number,
  userId: number,
): Promise<Event | null> {
  const result = await pool.query(
    "SELECT * FROM events WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  return result.rows[0] || null;
}

export async function getEventByIdAdmin(id: number): Promise<Event | null> {
  const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function updateEventStatus(
  id: number,
  status: string,
): Promise<void> {
  await pool.query(
    "UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2",
    [status, id],
  );
}
