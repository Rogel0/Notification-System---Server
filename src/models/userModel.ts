import pool from "../db";
import { User } from "../types/user";

export async function createUser(
  email: string,
  password: string,
): Promise<void> {
  await pool.query("INSERT INTO users (email, password) VALUES ($1, $2)", [
    email,
    password,
  ]);
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
