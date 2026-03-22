import { Event } from "../types/event";
import {
  getAllPendingEvents,
  markEventStagesNotified,
  updateEventStatus,
} from "../models/eventModel";
import { findUserById } from "../models/userModel";
import notification, { buildEventEmailHtml } from "./notification";

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
  }).format(date);
}

function getHoursLeft(eventDate: Date, now: Date) {
  const diff = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 100) / 100);
}

function getReminderMessage(
  event: Event,
  stage: string,
): { subject: string; text: string; html?: string } {
  const eventDate = new Date(event.datetime);
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

  const hoursLeft = getHoursLeft(eventDate, new Date());
  const eventWord =
    event.type === "Deadline" ? "deadline" : event.type.toLowerCase();
  const base = `Reminder: You have a ${eventWord} on ${dateLabel}. You have ${hoursLeft} hours left before ${eventWord}.`;

  return createBody("Reminder:", base);
}

function inWindow(trigger: number, now: number, windowMillis = 1000 * 60) {
  return now >= trigger && now < trigger + windowMillis;
}

function getDueSteps(event: Event, now: Date) {
  const eventDate = new Date(event.datetime);
  const nowMillis = now.getTime();
  const eventMillis = eventDate.getTime();

  if (eventMillis > nowMillis) {
    for (const win of scheduleWindows) {
      const trigger = eventMillis - win.offsetMillis;
      if (inWindow(trigger, nowMillis)) {
        return [win.stage];
      }
    }
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

async function processEvent(event: Event, now: Date) {
  const user = await findUserById(event.user_id);
  if (!user) {
    console.warn("Scheduler: user not found for event", event.id);
    return;
  }

  const nowStages = getDueSteps(event, now);
  const stagesToSend = nowStages.filter(
    (s) => !event.notified_stages.includes(s),
  );

  if (stagesToSend.length === 0) {
    return;
  }

  for (const stage of stagesToSend) {
    const message = getReminderMessage(event, stage);
    const html = buildEventEmailHtml(user, {
      ...event,
      status:
        event.status === "missed" || stage.startsWith("missed")
          ? "missed"
          : "upcoming",
    });

    await notification.sendEmail(
      user.email,
      message.subject,
      message.text,
      html,
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if ((user as any).phone) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await notification.sendSms((user as any).phone, message.text);
    }

    console.log(
      `Scheduler: sent ${stage} for event ${event.id} (${event.title})`,
    );
  }
  const nextStages = Array.from(
    new Set([...event.notified_stages, ...stagesToSend]),
  );
  await markEventStagesNotified(event.id, nextStages);

  if (
    new Date(event.datetime).getTime() <= now.getTime() &&
    event.status !== "missed"
  ) {
    await updateEventStatus(event.id, "missed");
  }
}

export async function runScheduler(): Promise<void> {
  const now = new Date();
  try {
    const events = await getAllPendingEvents();

    await Promise.all(events.map((event) => processEvent(event, now)));
  } catch (error) {
    console.error("Scheduler error:", error);
  }
}

export function startScheduler(): void {
  // At startup and every minute
  runScheduler();
  setInterval(runScheduler, 1000 * 60);
}
