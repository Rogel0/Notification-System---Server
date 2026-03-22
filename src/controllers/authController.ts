import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserById } from "../models/userModel";
import { generateToken } from "../utils/jwtUtils";

export async function register(req: Request, res: Response) {
  const { email, password, phone, name } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  // basic phone validation (E.164 style) if present
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) {
    return res.status(400).json({ message: "Phone must be in E.164 format" });
  }

  const hashed = await bcrypt.hash(password, 10);
  await createUser(email, hashed, name || null, phone || null);
  res.status(201).json({ message: "User registered" });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = generateToken(user.id);
  res.cookie("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 86400000,
    path: "/",
  });
  res.json({ message: "Logged in" });
}

export async function profile(req: Request, res: Response) {
  const userId = (req as any).userId;
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({
    id: user.id,
    email: user.email,
    name: user.name || null,
    phone: user.phone || null,
  });
}

export async function logout(req: Request, res: Response) {
  // Clear the auth cookie
  res.clearCookie("token", { path: "/" });
  res.json({ message: "Logged out" });
}
