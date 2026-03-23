import { User } from "../types/user";
import { parseStoredDate } from "./scheduler";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

let sgMail: any = null;
if (SENDGRID_API_KEY) {
  try {
    // lazy require so tests without dependency won't fail
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(SENDGRID_API_KEY);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("SendGrid module not available or failed to initialize", err);
    sgMail = null;
  }
}

let twilioClient: any = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Twilio = require("twilio");
    twilioClient = new Twilio(TWILIO_SID, TWILIO_TOKEN);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Twilio module not available or failed to initialize", err);
    twilioClient = null;
  }
}

export type NotificationResult = {
  success: boolean;
  error?: string;
  skipped?: string;
};

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<NotificationResult> {
  if (!sgMail) {
    // eslint-disable-next-line no-console
    console.warn("SendGrid not configured; skipping email to", to);
    return { success: false, skipped: "sendgrid_not_configured" };
  }
  if (!SENDGRID_FROM) {
    // eslint-disable-next-line no-console
    console.warn("SENDGRID_FROM_EMAIL not set; skipping email to", to);
    return { success: false, skipped: "sendgrid_from_not_set" };
  }

  const msg: any = {
    to,
    from: { email: SENDGRID_FROM, name: "Omega Notification" },
    replyTo: SENDGRID_FROM,
    subject,
    text,
    headers: {
      "List-Unsubscribe": `<mailto:unsubscribe@yourdomain.com>, <https://yourdomain.com/unsubscribe>`,
      "X-Mailer": "Omega Notification System",
      "X-Sender": SENDGRID_FROM,
    },
  };
  if (html) msg.html = html;

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(
      "SendGrid send error:",
      err?.response?.body || err.message || err,
    );
    return {
      success: false,
      error:
        err?.response?.body?.errors?.[0]?.message ||
        err.message ||
        "SendGrid error",
    };
  }
}

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (digits.startsWith("63")) return `+${digits}`;
  if (digits.startsWith("0")) return `+63${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendSms(
  to: string,
  body: string,
): Promise<NotificationResult> {
  if (!twilioClient) {
    // eslint-disable-next-line no-console
    console.warn("Twilio not configured; skipping SMS to", to);
    return { success: false, skipped: "twilio_not_configured" };
  }
  if (!TWILIO_FROM) {
    // eslint-disable-next-line no-console
    console.warn("TWILIO_FROM_NUMBER not set; skipping SMS to", to);
    return { success: false, skipped: "twilio_from_not_set" };
  }

  const normalizedTo = toE164(to);
  console.log("sendSms normalized to", normalizedTo);

  try {
    await twilioClient.messages.create({
      body,
      from: TWILIO_FROM,
      to: normalizedTo,
    });
    return { success: true };
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("Twilio send error:", err.message || err);
    return { success: false, error: err.message || "Twilio send error" };
  }
}

export function buildEventEmailHtml(
  user: User,
  event: any,
  messageBody?: string,
): string {
  const eventDateObj = parseStoredDate(event.datetime);
  const eventTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(eventDateObj);
  const computeHoursLeft = () => {
    try {
      const diff =
        (parseStoredDate(event.datetime).getTime() - Date.now()) / (1000 * 60 * 60);
      // Return integer hours (round up) with no decimal places so emails don't show fractional hours
      return Math.max(0, Math.ceil(diff));
    } catch {
      return 0;
    }
  };

  const hoursLeft = computeHoursLeft();

  const messageParagraph = messageBody
    ? `<p>${messageBody}</p>`
    : event.status === "missed"
      ? event.type === "Deadline"
        ? `<p>Urgent Reminder: You missed the deadline for ${event.title} that was ended on ${eventTime}.</p>`
        : event.type === "Meeting"
          ? `<p>Urgent Reminder: You missed the meeting on ${eventTime}.</p>`
          : `<p>Urgent Reminder: You missed your business trip on ${eventTime}.</p>`
      : // upcoming
        event.type === "Deadline"
        ? `<p>Reminder: You have a deadline on ${eventTime}. You have ${hoursLeft} hours left before deadline.</p>`
        : event.type === "Meeting"
          ? `<p>Reminder: You have a meeting on ${eventTime}. You have ${hoursLeft} hours left before the meeting.</p>`
          : `<p>Reminder: You have a business trip on ${eventTime}. You have ${hoursLeft} hours left before the trip.</p>`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #eef2ff; color: #1f2937; margin: 0; padding: 0; }
      .email-container { background: #ffffff; border-radius: 14px; max-width: 640px; margin: 28px auto; overflow: hidden; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14); }
      .header { background: linear-gradient(135deg, #4338ca, #6366f1); color: #fff; padding: 22px 30px; }
      .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.03em; }
      .header p { margin: 8px 0 0; font-size: 14px; opacity: .95; }

      .body { padding: 24px 32px; }
      .body h2 { margin: 0 0 8px; font-size: 20px; color: #111827; }
      .body p { margin: 0 0 12px; line-height: 1.5; color: #374151; }

      .card { border-radius: 12px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 16px; margin: 16px 0; }
      .card p { margin: 6px 0; font-size: 14px; color: #334155; }
      .card p strong { color: #1e3a8a; }

      .cta { display: inline-block; margin-top: 16px; background: #4f46e5; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-weight: 600; }

      .footer { padding: 16px 32px; font-size: 12px; color: #6b7280; background: #f3f4f6; text-align: center; }

      .tag { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; text-transform: uppercase; color: #fff; background: #6d28d9; margin-right: 6px; }
      .status { color: ${event.status === "missed" ? "#b91c1c" : "#065f46"}; font-weight: 600; }

      @media (max-width: 620px) {
        .email-container { width: 94%; margin: 14px auto; }
        .header, .body, .footer { padding: 16px; }
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Omega Notification</h1>
        <p>You are scheduled and never miss an important date.</p>
      </div>
      <div class="body">
        <p class="tag">${event.type}</p>
        <p class="status">${event.status === "missed" ? "Urgent Attention Needed" : "Upcoming Reminder"}</p>

        <h2>Hi ${user.name || user.email},</h2>
        ${messageParagraph}

        <div class="card">
          <p><strong>Title:</strong> ${event.title}</p>
          <p><strong>Date & Time:</strong> ${eventTime}</p>
          <p><strong>Details:</strong> ${event.details || "No additional notes"}</p>
          <p><strong>Current Status:</strong> ${event.status || "upcoming"}</p>
        </div>

        <a class="cta" href="http://localhost:5173/dashboard">Go to Dashboard</a>
      </div>
      <div class="footer">
        <p>
          If this is not your action, you can ignore this email or contact support at <a href="mailto:support@omega-notify.com" style="color:#4338ca; text-decoration: none;">support@omega-notify.com</a>.
        </p>
        <p>&copy; ${new Date().getFullYear()} Omega Notification System. All rights reserved.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

export async function notifyUserOfEvent(user: User, event: any) {
  const subject = `New ${event.type} scheduled: ${event.title}`;
  const text = `Your ${event.type} "${event.title}" is scheduled for ${new Date(
    event.datetime,
  ).toLocaleString()}.`;
  const html = buildEventEmailHtml(user, event);

  console.log("notifyUserOfEvent: user", user.email, (user as any).phone);

  const result: { email?: NotificationResult; sms?: NotificationResult } = {};

  if (user.email) {
    console.log("notifyUserOfEvent: sending email", user.email);
    result.email = await sendEmail(user.email, subject, text, html);
  } else {
    result.email = { success: false, skipped: "no_email" };
  }

  // If you add a `phone` column to the users table, SMS will be sent when available
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if ((user as any).phone) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const normalized = toE164((user as any).phone);
    console.log("notifyUserOfEvent: sending sms", normalized);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    result.sms = await sendSms(normalized, text);
  } else {
    result.sms = { success: false, skipped: "no_phone" };
  }

  return result;
}

export function checkNotificationConfig() {
  return {
    sendgrid: !!(SENDGRID_API_KEY && SENDGRID_FROM && sgMail),
    twilio: !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && twilioClient),
  };
}

export default {
  sendEmail,
  sendSms,
  notifyUserOfEvent,
  checkNotificationConfig,
};
