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
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = generateToken(user.id);

    const isProduction = process.env.NODE_ENV === "production";
    const cookieSecure = isProduction;
    const cookieSameSite = isProduction ? "none" : "lax";

    res.cookie("token", token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 86400000,
      path: "/",
      // Local: SameSite=Lax, secure=false. 
      // Prod: SameSite=None, secure=true.
    });
    res.json({ message: "Logged in" });
  } catch (err: unknown) {
    // Log full error for deployed logs (Railway/Heroku/Vercel)
    // so you can inspect stack traces from the platform logging UI.
    // Return a simple message to the client to avoid leaking internals.
    // eslint-disable-next-line no-console
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
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
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    path: "/",
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  });
  res.json({ message: "Logged out" });
}
