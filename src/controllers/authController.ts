import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserById } from "../models/userModel";
import { generateToken } from "../utils/jwtUtils";

export async function register(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });
  const hashed = await bcrypt.hash(password, 10);
  await createUser(email, hashed);
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
    secure: true,
    sameSite: "strict",
    maxAge: 86400000,
  });
  res.json({ message: "Logged in" });
}

export async function profile(req: Request, res: Response) {
  const userId = (req as any).userId;
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ id: user.id, email: user.email });
}
