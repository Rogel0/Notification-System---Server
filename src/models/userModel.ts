import pool from "../db";
import { User } from "../types/user";

export async function createUser(
  email: string,
  password: string,
  name?: string | null,
  phone?: string | null,
  discordId?: string | null,
  discordTag?: string | null,
  discordUsername?: string | null,
): Promise<void> {
  await pool.query(
    "INSERT INTO users (email, password, name, phone, discord_id, discord_tag, discord_username) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      email,
      password,
      name || null,
      phone || null,
      discordId || null,
      discordTag || null,
      discordUsername || null,
    ],
  );
}
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  return result.rows[0] || null;
}

export async function findUserById(id: number): Promise<User | null> {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function updateDiscordInfo(
  id: number,
  discordId?: string | null,
  discordVerified?: boolean,
  discordTag?: string | null,
  discordUsername?: string | null,
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof discordId !== "undefined") {
    fields.push(`discord_id = $${fields.length + 1}`);
    values.push(discordId);
  }
  if (typeof discordVerified !== "undefined") {
    fields.push(`discord_verified = $${fields.length + 1}`);
    values.push(discordVerified);
  }
  if (typeof discordTag !== "undefined") {
    fields.push(`discord_tag = $${fields.length + 1}`);
    values.push(discordTag);
  }
  if (typeof discordUsername !== "undefined") {
    fields.push(`discord_username = $${fields.length + 1}`);
    values.push(discordUsername);
  }

  if (fields.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length}`,
    values,
  );
}

export async function updateUserProfile(
  id: number,
  email?: string | null,
  phone?: string | null,
  name?: string | null,
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof email !== "undefined") {
    fields.push(`email = $${fields.length + 1}`);
    values.push(email);
  }
  if (typeof phone !== "undefined") {
    fields.push(`phone = $${fields.length + 1}`);
    values.push(phone);
  }
  if (typeof name !== "undefined") {
    fields.push(`name = $${fields.length + 1}`);
    values.push(name);
  }

  if (fields.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length}`,
    values,
  );
}
