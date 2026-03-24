import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserById } from "../models/userModel";
import { generateToken } from "../utils/jwtUtils";
import { normalizeDiscordInput } from "../utils/discordInput";

export async function register(req: Request, res: Response) {
  const {
    email,
    password,
    phone,
    name,
    discord_id_or_tag,
    discord_username,
    discord_tag,
    discord_input,
  } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  // basic phone validation (E.164 style) if present
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) {
    return res.status(400).json({ message: "Phone must be in E.164 format" });
  }

  // handle discord ID or username/discriminator input (single field preferred)
  let discordId: string | null = null;
  let discordTagForDB: string | null = null;
  let discordInputCandidate = "";

  const providedDiscord = (discord_input || discord_id_or_tag || "")
    .toString()
    .trim();
  if (providedDiscord) {
    discordInputCandidate = providedDiscord;
  } else if (discord_username) {
    const rawName = String(discord_username).trim().replace(/\s+/g, "");
    const rawTag = String(discord_tag || "")
      .replace(/\D/g, "")
      .padStart(4, "0")
      .slice(-4);

    if (!rawName) {
      return res
        .status(400)
        .json({ message: "Discord username must not be empty" });
    }

    discordInputCandidate = rawTag ? `${rawName}${rawTag}` : rawName;
  }

  if (discordInputCandidate) {
    const normalized = normalizeDiscordInput(discordInputCandidate);
    discordId = normalized.discordId;
    if (normalized.discordId) {
      // keep only the ID upfront; also set tag text from username+tag if available
      if (normalized.discordUsername && normalized.discordTag) {
        discordTagForDB = `${normalized.discordUsername}${normalized.discordTag}`;
      }
    } else if (normalized.discordUsername && normalized.discordTag) {
      // store combined no-hash value for backward compatibility
      discordTagForDB = `${normalized.discordUsername}${normalized.discordTag}`;
    } else if (normalized.discordUsername) {
      discordTagForDB = normalized.discordUsername;
    } else if (normalized.discordTag) {
      discordTagForDB = normalized.discordTag;
    }

    if (!discordId && !discordTagForDB) {
      return res.status(400).json({
        message:
          "Discord input must be a numeric Discord ID (17-20 digits), username1234 (preferred), or username#1234",
      });
    }
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    await createUser(
      email,
      hashed,
      name || null,
      phone || null,
      discordId,
      discordTagForDB,
      null,
    );
    return res.status(201).json({ message: "User registered" });
  } catch (err: any) {
    // Handle common DB errors (e.g., unique constraint on email)
    // eslint-disable-next-line no-console
    console.error("Register error:", err);
    if (err?.code === "23505") {
      // Postgres unique_violation
      return res
        .status(409)
        .json({ message: "An account with this email already exists" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
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
    discord_id: (user as any).discord_id || null,
    discord_username: (user as any).discord_username || null,
    discord_tag: (user as any).discord_tag || null,
    discord_verified: (user as any).discord_verified || false,
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
