import { Request, Response } from "express";
import notification, { buildEventEmailHtml } from "../utils/notification";
import { findUserById } from "../models/userModel";
import { getEventByIdAdmin, createEvent } from "../models/eventModel";
import { processEvent, runScheduler } from "../utils/scheduler";
import { getReminderMessage } from "../utils/scheduler";

export async function notifyTest(req: Request, res: Response) {
  // Accept overrides in body for quick testing
  const { toEmail, toPhone, subject, text } = req.body || {};

  const userId = (req as any).userId as number | undefined;
  let user: any = null;
  if (userId) {
    try {
      user = await findUserById(userId);
    } catch (err) {
      // ignore
    }
  }

  const targetEmail = toEmail || (user && user.email) || null;
  const targetPhone = toPhone || (user && (user as any).phone) || null;

  if (!targetEmail && !targetPhone) {
    return res
      .status(400)
      .json({ message: "No target email or phone available for test" });
  }

  const msgSubject = subject || "Notification test from NotificationSystem";
  const msgText = text || "This is a test notification from your app.";

  const results: any = {};
  const cfg = notification.checkNotificationConfig();
  if (targetEmail) {
    try {
      if (!cfg.sendgrid) {
        results.email = { skipped: "sendgrid-not-configured" };
      } else {
        await notification.sendEmail(targetEmail, msgSubject, msgText);
        results.email = "sent-or-queued";
      }
    } catch (err: any) {
      results.email = { error: err.message || err };
    }
  }

  if (targetPhone) {
    try {
      if (!cfg.twilio) {
        results.sms = { skipped: "twilio-not-configured" };
      } else {
        await notification.sendSms(targetPhone, msgText);
        results.sms = "sent-or-queued";
      }
    } catch (err: any) {
      results.sms = { error: err.message || err };
    }
  }

  res.json({ ok: true, results });
}

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

export async function seedMockEvents(req: Request, res: Response) {
  const userId = (req as any).userId as number | undefined;
  if (!userId) return res.status(400).json({ message: "No user in request" });

  const now = new Date();
  const makeISO = (d: Date) => d.toISOString();

  const eventsToCreate = [
    {
      type: "Deadline",
      title: "Mock Deadline 3 days",
      dt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3),
    },
    {
      type: "Meeting",
      title: "Mock Meeting 24 hours",
      dt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    },
    {
      type: "Business Trip",
      title: "Mock Trip 3 hours",
      dt: new Date(now.getTime() + 1000 * 60 * 60 * 3),
    },
    {
      type: "Meeting",
      title: "Mock Meeting 15 minutes",
      dt: new Date(now.getTime() + 1000 * 60 * 15),
    },
    { type: "Deadline", title: "Mock Exact Now", dt: new Date(now.getTime()) },
    // missed events
    {
      type: "Meeting",
      title: "Missed 10 minutes ago",
      dt: new Date(now.getTime() - 1000 * 60 * 10),
    },
    {
      type: "Deadline",
      title: "Missed 1 hour ago",
      dt: new Date(now.getTime() - 1000 * 60 * 60),
    },
    {
      type: "Business Trip",
      title: "Missed 24 hours ago",
      dt: new Date(now.getTime() - 1000 * 60 * 60 * 24),
    },
  ];

  const created: any[] = [];
  for (const e of eventsToCreate) {
    // details to make visible
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const details = `Auto-generated mock event: ${e.title}`;
    const ev = await createEvent(
      userId,
      e.type,
      e.title,
      makeISO(e.dt),
      details,
    );
    created.push(ev);
  }

  res.json({ ok: true, created });
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
