import { Request, Response } from "express";
import notification, {
  buildEventEmailHtml,
  resolveDiscordIdByTag,
  sendDiscordDm,
} from "../utils/notification";
import { normalizeDiscordInput } from "../utils/discordInput";
import { findUserById } from "../models/userModel";
import { getEventByIdAdmin } from "../models/eventModel";
import {
  processEvent,
  runScheduler,
  getReminderMessage,
} from "../utils/scheduler";

// Test notification endpoint removed to avoid accidental/mock sends.

export function getNotificationConfig(req: Request, res: Response) {
  const cfg = notification.checkNotificationConfig();
  res.json({ config: cfg });
}

export async function resendEvent(req: Request, res: Response) {
  const id = Number(req.params.id || req.body.id);
  if (!id) return res.status(400).json({ message: "Missing event id" });

  const event = await getEventByIdAdmin(id);
  if (!event) return res.status(404).json({ message: "Event not found" });

  try {
    const stages = await processEvent(event, new Date());
    res.json({ ok: true, resentStages: stages });
  } catch (err: any) {
    console.error("resendEvent error:", err);
    res
      .status(500)
      .json({ message: "Failed to resend event", error: err.message || err });
  }
}

export async function previewEvent(req: Request, res: Response) {
  const id = Number(req.params.id || req.body.id);
  const stage = String(req.query.stage || req.body.stage || "");
  if (!id) return res.status(400).json({ message: "Missing event id" });
  if (!stage)
    return res.status(400).json({
      message: "Missing stage query param. Example: ?stage=24_hours_before",
      allowedStages: [
        "3_days_before",
        "24_hours_before",
        "3_hours_before",
        "1_hour_before",
        "15_minutes_before",
        "exact",
        "missed_10_minutes",
        "missed_1_hour",
        "missed_24_hours",
      ],
    });

  const event = await getEventByIdAdmin(id);
  if (!event) return res.status(404).json({ message: "Event not found" });

  const user = await findUserById(event.user_id);
  if (!user)
    return res.status(404).json({ message: "User not found for event" });

  try {
    const message = getReminderMessage(event, stage);
    const html = buildEventEmailHtml(user, event, message.text);
    res.json({
      ok: true,
      stage,
      text: message.text,
      subject: message.subject,
      html,
    });
  } catch (err: any) {
    console.error("previewEvent error:", err);
    res
      .status(500)
      .json({ message: "Failed to build preview", error: err.message || err });
  }
}

// Seed mock events endpoint removed.

export async function resolveDiscordTag(req: Request, res: Response) {
  const tag = String(req.query.tag || req.body.tag || "").trim();
  if (!tag) {
    return res.status(400).json({ message: "Missing tag query param" });
  }

  try {
    const normalized = normalizeDiscordInput(tag);
    if (normalized.discordId) {
      return res.json({
        success: true,
        discordId: normalized.discordId,
        source: "discord_id",
      });
    }

    // Build effectiveTag as username+tag (no '#') when both parts available, otherwise fall back
    let effectiveTag: string;
    if (normalized.discordUsername && normalized.discordTag) {
      effectiveTag = `${normalized.discordUsername}#${normalized.discordTag}`;
    } else if (normalized.discordUsername) {
      effectiveTag = normalized.discordUsername;
    } else if (normalized.discordTag) {
      effectiveTag = tag;
    } else {
      effectiveTag = tag;
    }

    let discordId = await resolveDiscordIdByTag(effectiveTag);
    if (!discordId && normalized.discordUsername && normalized.discordTag) {
      discordId = await resolveDiscordIdByTag(
        `${normalized.discordUsername}${normalized.discordTag}`,
      );
      effectiveTag = `${normalized.discordUsername}${normalized.discordTag}`;
    }

    if (!discordId) {
      return res.json({
        success: false,
        error: "not_found",
        normalizedTag: normalized.discordTag,
      });
    }
    return res.json({
      success: true,
      discordId,
      normalizedTag: normalized.discordTag,
    });
  } catch (err: any) {
    console.error("resolveDiscordTag error", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "resolve_failed" });
  }
}

export async function sendDiscordTest(req: Request, res: Response) {
  const tag = String(req.query.tag || req.body.tag || "").trim();
  if (!tag) {
    return res.status(400).json({ message: "Missing tag query param" });
  }

  try {
    const normalized = normalizeDiscordInput(tag);
    let discordId = normalized.discordId;
    let effectiveTag: string;
    if (normalized.discordUsername && normalized.discordTag) {
      effectiveTag = `${normalized.discordUsername}#${normalized.discordTag}`;
    } else if (normalized.discordUsername) {
      effectiveTag = normalized.discordUsername;
    } else if (normalized.discordTag) {
      effectiveTag = tag;
    } else {
      effectiveTag = tag;
    }

    if (!discordId) {
      discordId = await resolveDiscordIdByTag(effectiveTag);
      if (!discordId && normalized.discordUsername && normalized.discordTag) {
        // try legacy username+tag form without '#'
        effectiveTag = `${normalized.discordUsername}${normalized.discordTag}`;
        discordId = await resolveDiscordIdByTag(effectiveTag);
      }
    }

    if (!discordId) {
      return res.json({
        success: false,
        error: "not_found",
        normalizedTag: normalized.discordTag,
      });
    }

    const message = `Omega Notification test message for ${effectiveTag} at ${new Date().toLocaleString()}`;
    const result = await sendDiscordDm(discordId, { content: message });
    if (!result.success) {
      return res.json({
        success: false,
        discordId,
        result,
        normalizedTag: normalized.discordTag,
      });
    }
    return res.json({
      success: true,
      discordId,
      result,
      normalizedTag: normalized.discordTag,
    });
  } catch (err: any) {
    console.error("sendDiscordTest error", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "send_failed" });
  }
}

export async function triggerSchedulerNow(req: Request, res: Response) {
  try {
    await runScheduler();
    res.json({ ok: true });
  } catch (err: any) {
    console.error("triggerSchedulerNow error", err);
    res
      .status(500)
      .json({ message: "Failed to run scheduler", error: err.message || err });
  }
}
