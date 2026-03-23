import { Event } from "../types/event";
import {
  getAllPendingEvents,
  markEventStagesNotified,
  updateEventStatus,
  getEventByIdAdmin,
} from "../models/eventModel";
import { findUserById } from "../models/userModel";
import notification, { buildEventEmailHtml } from "./notification";
import {
  getDueJobs,
  markJobAttempt,
  createOrUpdateJobsForEvent,
  pruneStalePendingJobs,
} from "../models/notificationJobModel";

const scheduleWindows = [
  { stage: "3_days_before", offsetMillis: 1000 * 60 * 60 * 24 * 3 },
  { stage: "24_hours_before", offsetMillis: 1000 * 60 * 60 * 24 },
  { stage: "3_hours_before", offsetMillis: 1000 * 60 * 60 * 3 },
  { stage: "15_minutes_before", offsetMillis: 1000 * 60 * 15 },
  { stage: "exact", offsetMillis: 0 },
];

const missedWindows = [
  { stage: "missed_10_minutes", offsetMillis: 1000 * 60 * 10 },
  { stage: "missed_1_hour", offsetMillis: 1000 * 60 * 60 },
  { stage: "missed_24_hours", offsetMillis: 1000 * 60 * 60 * 24 },
];

function formatTriggerDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function getHoursLeft(eventDate: Date, now: Date) {
  const diffMs = Math.max(0, eventDate.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
  if (seconds > 0 || parts.length === 0)
    parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);

  return parts.join(", ").replace(/, ([^,]*)$/, " and $1");
}

export function parseStoredDate(datetime: string | Date): Date {
  if (datetime instanceof Date) return datetime;
  const s = String(datetime).trim();
  // If string already contains timezone info (Z or +HH:MM/-HH:MM), let Date parse it
  if (/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }

  // If ISO-like with T but no timezone, treat the stored time as Asia/Manila local time.
  // Convert to UTC instant by subtracting 8 hours when constructing the UTC timestamp.
  const isoMatch = s.match(
    /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = Number(ss || "0");
    // Treat parsed values as Asia/Manila local time and convert to UTC instant
    const utcMillis = Date.UTC(year, month, day, hour - 8, minute, second);
    return new Date(utcMillis);
  }

  // If space-separated (e.g. Postgres 'YYYY-MM-DD HH:MM:SS'), parse similarly
  const spaceMatch = s.match(
    /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (spaceMatch) {
    const [, y, m, d, hh, mm, ss] = spaceMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = Number(ss || "0");
    const utcMillis = Date.UTC(year, month, day, hour - 8, minute, second);
    return new Date(utcMillis);
  }

  // Fallback to default parser

  // Fallback to default parser
  return new Date(s);
}

export function getReminderMessage(
  event: Event,
  stage: string,
): { subject: string; text: string; html?: string } {
  const eventDate = parseStoredDate(event.datetime);
  const dateLabel = formatTriggerDate(eventDate);

  const createBody = (prefix: string, details: string) => ({
    subject: `${prefix} ${event.type} reminder: ${event.title}`,
    text: details,
    html: `<p>${details}</p><p><strong>${event.type}</strong>: ${event.title}</p><p>Date: ${dateLabel}</p>`,
  });

  if (stage.startsWith("missed")) {
    if (event.type === "Deadline") {
      return createBody(
        "Urgent Reminder:",
        `Urgent Reminder: You missed the deadline for ${event.title} that was ended on ${dateLabel}.`,
      );
    }

    if (event.type === "Meeting") {
      return createBody(
        "Urgent Reminder:",
        `Urgent Reminder: You missed the meeting on ${dateLabel}.`,
      );
    }

    return createBody(
      "Urgent Reminder:",
      `Urgent Reminder: You missed your business trip on ${dateLabel}.`,
    );
  }

  // For scheduled stages, prefer showing the nominal stage label (no fractional hours)
  const stageLabels: Record<string, string> = {
    "3_days_before": "3 days",
    "24_hours_before": "24 hours",
    "3_hours_before": "3 hours",
    "15_minutes_before": "15 minutes",
    exact: "now",
  };

  // Special-case 'exact' to be user-friendly
  if (stage === "exact") {
    if (event.type === "Deadline") {
      const base = `Reminder: Your deadline is happening now (${dateLabel}).`;
      return createBody("Reminder:", base);
    }
    if (event.type === "Meeting") {
      const base = `Reminder: Your meeting is happening now (${dateLabel}).`;
      return createBody("Reminder:", base);
    }
    const baseTrip = `Reminder: Your business trip is happening now (${dateLabel}).`;
    return createBody("Reminder:", baseTrip);
  }

  const nominal = stageLabels[stage] || getHoursLeft(eventDate, new Date());

  if (event.type === "Deadline") {
    const base = `Reminder: You have a deadline on ${dateLabel}. You have ${nominal} left before the deadline.`;
    return createBody("Reminder:", base);
  }

  if (event.type === "Meeting") {
    const base = `Reminder: You have a meeting on ${dateLabel}. You have ${nominal} left before the meeting.`;
    return createBody("Reminder:", base);
  }

  // Business Trip
  const base = `Reminder: You have a business trip on ${dateLabel}. You have ${nominal} left before the trip.`;
  return createBody("Reminder:", base);
}

function inWindow(trigger: number, now: number, windowMillis = 1000 * 60) {
  return now >= trigger && now < trigger + windowMillis;
}

function getDueSteps(event: Event, now: Date) {
  const eventDate = parseStoredDate(event.datetime);
  const nowMillis = now.getTime();
  const eventMillis = eventDate.getTime();

  if (eventMillis > nowMillis) {
    // If the event is still in the future, pick the single most-recent
    // schedule window whose trigger time has already passed. This avoids
    // sending an older "3 days" reminder when the correct nearest stage
    // is "24 hours".
    const passed: { stage: string; trigger: number }[] = [];
    for (const win of scheduleWindows) {
      const trigger = eventMillis - win.offsetMillis;
      if (nowMillis >= trigger && trigger < eventMillis) {
        passed.push({ stage: win.stage, trigger });
      }
    }
    if (passed.length === 0) return [];
    // choose the one with the greatest trigger (closest to now)
    passed.sort((a, b) => b.trigger - a.trigger);
    return [passed[0].stage];
  } else {
    for (const win of missedWindows) {
      const trigger = eventMillis + win.offsetMillis;
      if (inWindow(trigger, nowMillis)) {
        return [win.stage];
      }
    }
  }

  return [];
}

export async function processEvent(event: Event, now: Date) {
  const user = await findUserById(event.user_id);
  if (!user) {
    console.warn("Scheduler: user not found for event", event.id);
    return [];
  }

  const nowStages = getDueSteps(event, now);
  const stagesToSend = nowStages.filter(
    (s) => !event.notified_stages.includes(s),
  );

  if (stagesToSend.length === 0) {
    return [];
  }

  const actuallySent: string[] = [];
  for (const stage of stagesToSend) {
    const message = getReminderMessage(event, stage);
    const html = buildEventEmailHtml(
      user,
      {
        ...event,
        status:
          event.status === "missed" || stage.startsWith("missed")
            ? "missed"
            : "upcoming",
      },
      message.text,
    );

    let emailResult: any = { success: false, skipped: "no_email" };
    if (user.email) {
      try {
        emailResult = await notification.sendEmail(
          user.email,
          message.subject,
          message.text,
          html,
        );
      } catch (err) {
        console.error("Scheduler: sendEmail threw", err);
      }
    }

    let smsResult: any = { success: false, skipped: "no_phone" };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if ((user as any).phone) {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        smsResult = await notification.sendSms(
          (user as any).phone,
          message.text,
        );
      } catch (err) {
        console.error("Scheduler: sendSms threw", err);
      }
    }

    // Log outcomes
    console.log(
      `Scheduler: attempt ${stage} for event ${event.id} (${event.title}) => email:${emailResult?.success ? "ok" : emailResult?.skipped || emailResult?.error || "failed"} sms:${smsResult?.success ? "ok" : smsResult?.skipped || smsResult?.error || "failed"}`,
    );

    // Mark stage as notified only if at least one channel succeeded
    if (emailResult?.success || smsResult?.success) {
      actuallySent.push(stage);
    }
  }

  if (actuallySent.length > 0) {
    const nextStages = Array.from(
      new Set([...event.notified_stages, ...actuallySent]),
    );
    await markEventStagesNotified(event.id, nextStages);
  }

  if (
    parseStoredDate(event.datetime).getTime() <= now.getTime() &&
    event.status !== "missed"
  ) {
    await updateEventStatus(event.id, "missed");
  }
  return stagesToSend;
}

export async function runScheduler(): Promise<void> {
  const now = new Date();
  try {
    // Process any due notification jobs from the DB first
    await processDueJobs(now);

    // Fallback: run the existing event-based checks as a safety net
    const events = await getAllPendingEvents();
    await Promise.all(events.map((event) => processEvent(event, now)));
  } catch (error) {
    console.error("Scheduler error:", error);
  }
}

export async function processDueJobs(now: Date): Promise<void> {
  try {
    const jobs = await getDueJobs(500);

    // Group jobs by event_id and keep only the job with the latest run_at per event.
    const latestJobByEvent = new Map<number, any>();
    for (const job of jobs) {
      const existing = latestJobByEvent.get(job.event_id);
      if (!existing) {
        latestJobByEvent.set(job.event_id, job);
        continue;
      }
      const existingTime = new Date(existing.run_at).getTime();
      const thisTime = new Date(job.run_at).getTime();
      if (thisTime > existingTime) {
        latestJobByEvent.set(job.event_id, job);
      }
    }

    for (const job of Array.from(latestJobByEvent.values())) {
      try {
        const event = await getEventByIdAdmin(job.event_id);
        if (!event) {
          await markJobAttempt(job.id, false, "event_not_found");
          continue;
        }

        const user = await findUserById(event.user_id);
        if (!user) {
          await markJobAttempt(job.id, false, "user_not_found");
          continue;
        }

        const message = getReminderMessage(event, job.stage);
        const html = buildEventEmailHtml(
          user,
          {
            ...event,
            status:
              event.status === "missed" || job.stage.startsWith("missed")
                ? "missed"
                : "upcoming",
          },
          message.text,
        );

        let emailResult: any = { success: false, skipped: "no_email" };
        if (user.email) {
          try {
            emailResult = await notification.sendEmail(
              user.email,
              message.subject,
              message.text,
              html,
            );
          } catch (err) {
            console.error("Scheduler job sendEmail threw", err);
            emailResult = { success: false, error: String(err) };
          }
        }

        let smsResult: any = { success: false, skipped: "no_phone" };
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if ((user as any).phone) {
          try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            smsResult = await notification.sendSms(
              (user as any).phone,
              message.text,
            );
          } catch (err) {
            console.error("Scheduler job sendSms threw", err);
            smsResult = { success: false, error: String(err) };
          }
        }

        const success = !!(emailResult?.success || smsResult?.success);
        if (success) {
          // mark event notified_stages
          const nextStages = Array.from(
            new Set([...event.notified_stages, job.stage]),
          );
          await markEventStagesNotified(event.id, nextStages);
        }

        await markJobAttempt(
          job.id,
          success,
          success
            ? undefined
            : emailResult?.error || smsResult?.error || "unknown",
        );

        if (
          parseStoredDate(event.datetime).getTime() <= now.getTime() &&
          event.status !== "missed"
        ) {
          await updateEventStatus(event.id, "missed");
        }
      } catch (err) {
        console.error("Error processing job", job.id, err);
        try {
          await markJobAttempt(job.id, false, String(err));
        } catch (e) {
          console.error("Failed marking job attempt", job.id, e);
        }
      }
    }
  } catch (err) {
    console.error("processDueJobs error:", err);
  }
}

export async function rebuildJobsFromEvents(): Promise<void> {
  try {
    // First prune any old pending jobs so we don't resurrect stale stages
    try {
      await pruneStalePendingJobs(5); // 5 minutes
    } catch (e) {
      console.warn("pruneStalePendingJobs failed:", e);
    }

    const events = await getAllPendingEvents();
    const now = new Date();
    await Promise.all(
      events.map((ev) =>
        createOrUpdateJobsForEvent(ev, { now, pastToleranceMs: 1000 * 60 }),
      ),
    );
  } catch (err) {
    console.error("rebuildJobsFromEvents error:", err);
  }
}

export function startScheduler(): void {
  // At startup and every minute
  // Rebuild DB-backed jobs from events so restarts recreate pending jobs
  rebuildJobsFromEvents()
    .then(() => runScheduler())
    .catch((err) => {
      console.error("Failed to rebuild jobs on startup:", err);
      runScheduler();
    });

  setInterval(runScheduler, 1000 * 60);
}
