import pool from "../db";
import { User } from "../types/user";

export async function createUser(
  email: string,
  password: string,
  name?: string | null,
  phone?: string | null,
): Promise<void> {
  await pool.query(
    "INSERT INTO users (email, password, name, phone) VALUES ($1, $2, $3, $4)",
    [email, password, name || null, phone || null],
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
