import { Request, Response } from "express";
import notification from "../utils/notification";
import { findUserById } from "../models/userModel";

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
