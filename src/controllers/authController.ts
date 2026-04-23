import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateDiscordInfo,
  updateUserProfile,
} from "../models/userModel";
import { generateToken } from "../utils/jwtUtils";
import { normalizeDiscordInput } from "../utils/discordInput";
import {
  sendEmail,
  sendSms,
  resolveDiscordIdByTag,
  sendDiscordDm,
} from "../utils/notification";

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

export async function updateProfile(req: Request, res: Response) {
  const userId = (req as any).userId;
  const { email, phone, discord_input, name } = req.body || {};

  if (email && !/^\S+@\S+\.\S+$/.test(String(email))) {
    return res.status(400).json({ message: "Invalid email" });
  }

  if (phone && !/^\+?[0-9]{10,15}$/.test(String(phone))) {
    return res.status(400).json({ message: "Phone must be in E.164 format" });
  }

  try {
    const existing = await findUserById(userId);
    if (!existing) return res.status(404).json({ message: "User not found" });

    const emailProvided = typeof email !== "undefined";
    const phoneProvided = typeof phone !== "undefined";
    const nameProvided = typeof name !== "undefined";
    const discordProvided = typeof discord_input !== "undefined";

    const normalizedEmail = emailProvided
      ? email === null
        ? null
        : String(email).trim()
      : undefined;
    const normalizedPhone = phoneProvided
      ? phone === null
        ? null
        : String(phone).trim()
      : undefined;
    const normalizedName = nameProvided
      ? name === null
        ? null
        : String(name).trim()
      : undefined;

    const emailChanged =
      emailProvided && (existing.email ?? null) !== (normalizedEmail ?? null);
    const phoneChanged =
      phoneProvided && (existing.phone ?? null) !== (normalizedPhone ?? null);
    const nameChanged =
      nameProvided && (existing.name ?? null) !== (normalizedName ?? null);

    // Update only the basic fields that actually changed.
    await updateUserProfile(
      userId,
      emailChanged ? (normalizedEmail ?? null) : undefined,
      phoneChanged ? (normalizedPhone ?? null) : undefined,
      nameChanged ? (normalizedName ?? null) : undefined,
    );

    let discordChanged = false;

    // Handle discord input only when it is included in the request body.
    if (discordProvided) {
      const raw = String(discord_input || "").trim();

      if (!raw) {
        const wouldClearDiscord =
          (existing.discord_id ?? null) !== null ||
          (existing.discord_tag ?? null) !== null ||
          (existing.discord_username ?? null) !== null ||
          Boolean(existing.discord_verified) !== false;

        discordChanged = wouldClearDiscord;
        if (discordChanged) {
          await updateDiscordInfo(userId, null, false, null, null);
        }
      } else {
        const normalized = normalizeDiscordInput(raw);
        let discordId: string | null = null;
        let discordTagForDB: string | null = null;
        let discordUsernameForDB: string | null = null;

        if (normalized.discordId) {
          discordId = normalized.discordId;
          if (normalized.discordUsername && normalized.discordTag) {
            discordTagForDB = `${normalized.discordUsername}${normalized.discordTag}`;
            discordUsernameForDB = normalized.discordUsername;
          }
        } else if (normalized.discordUsername && normalized.discordTag) {
          discordTagForDB = `${normalized.discordUsername}${normalized.discordTag}`;
          discordUsernameForDB = normalized.discordUsername;
        } else if (normalized.discordUsername) {
          discordUsernameForDB = normalized.discordUsername;
        } else if (normalized.discordTag) {
          discordTagForDB = normalized.discordTag;
        }

        if (!discordId && !discordTagForDB && !discordUsernameForDB) {
          return res.status(400).json({
            message:
              "Discord input must be a numeric Discord ID (17-20 digits), username1234 (preferred), or username#1234",
          });
        }

        const nextVerified = true;
        discordChanged =
          (existing.discord_id ?? null) !== (discordId ?? null) ||
          (existing.discord_tag ?? null) !== (discordTagForDB ?? null) ||
          (existing.discord_username ?? null) !== (discordUsernameForDB ?? null) ||
          Boolean(existing.discord_verified) !== nextVerified;

        if (discordChanged) {
          // Apply immediately without extra verification.
          await updateDiscordInfo(
            userId,
            discordId,
            nextVerified,
            discordTagForDB,
            discordUsernameForDB,
          );
        }
      }
    }

    const updated = await findUserById(userId);
    if (!updated) return res.status(404).json({ message: "User not found after update" });

    const changedFields: string[] = [];
    if (emailChanged) changedFields.push("email");
    if (phoneChanged) changedFields.push("phone");
    if (discordChanged) changedFields.push("discord");
    if (nameChanged) changedFields.push("name");

    const changedSummary =
      changedFields.length > 0 ? changedFields.join(", ") : "none";

    // Send profile-update notifications only for channels that actually changed.
    const notificationResults: Record<string, any> = {};

    // Email
    try {
      if (!emailChanged) {
        notificationResults.email = { success: false, skipped: "unchanged" };
      } else if (updated.email) {
        const subject = "Omega Notification - Profile Updated";
        const text = [
          `Hi ${updated.name || updated.email},`,
          "",
          "Your profile was updated successfully.",
          `Changed fields: ${changedSummary}.`,
          "",
          "Plan reminders are sent separately based on your event schedules.",
          "If this was not you, please secure your account immediately.",
        ].join("\n");
        const emailRes = await sendEmail(updated.email, subject, text);
        notificationResults.email = emailRes;
      } else {
        notificationResults.email = { success: false, skipped: "no_email" };
      }
    } catch (err: any) {
      notificationResults.email = { success: false, error: err?.message || String(err) };
    }

    // SMS
    try {
      if (!phoneChanged) {
        notificationResults.sms = { success: false, skipped: "unchanged" };
      } else if ((updated as any).phone) {
        const smsRes = await sendSms(
          (updated as any).phone,
          `Omega: Profile updated (${changedSummary}). Plan reminders are sent separately by event schedule.`,
        );
        notificationResults.sms = smsRes;
      } else {
        notificationResults.sms = { success: false, skipped: "no_phone" };
      }
    } catch (err: any) {
      notificationResults.sms = { success: false, error: err?.message || String(err) };
    }

    // Discord: prefer stored discord_id, otherwise try to resolve from tag
    try {
      if (!discordChanged) {
        notificationResults.discord = { success: false, skipped: "unchanged" };
      } else {
        const discordIdOrTag =
          (updated as any).discord_id ||
          (updated as any).discord_tag ||
          (updated as any).discord_username ||
          null;
        let resolvedDiscordId: string | null = null;

        if (!discordIdOrTag) {
          notificationResults.discord = { success: false, skipped: "no_discord" };
        } else {
          // If value looks like an ID (digits), use it directly.
          if (/^\d{17,20}$/.test(String(discordIdOrTag))) {
            resolvedDiscordId = String(discordIdOrTag);
          } else {
            resolvedDiscordId = await resolveDiscordIdByTag(String(discordIdOrTag));
          }

          if (!resolvedDiscordId) {
            notificationResults.discord = {
              success: false,
              error: "could_not_resolve_discord_id",
            };
          } else {
            const dmRes = await sendDiscordDm(
              resolvedDiscordId,
              `Omega Notification: Your profile was updated (${changedSummary}). Plan reminders are sent separately by event schedule.`,
            );
            notificationResults.discord = dmRes;
          }
        }
      }
    } catch (err: any) {
      notificationResults.discord = { success: false, error: err?.message || String(err) };
    }

    return res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name || null,
      phone: updated.phone || null,
      discord_id: (updated as any).discord_id || null,
      discord_username: (updated as any).discord_username || null,
      discord_tag: (updated as any).discord_tag || null,
      discord_verified: (updated as any).discord_verified || false,
      changed_fields: changedFields,
      notificationTest: notificationResults,
    });
  } catch (err: any) {
    // Handle unique constraint on email
    if (err?.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    // eslint-disable-next-line no-console
    console.error("Update profile error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
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
