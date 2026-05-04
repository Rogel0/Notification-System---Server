import { Request, Response } from "express";
import {
  createEvent,
  getEventsByUser,
  getEventById,
  updateEventStatus,
} from "../models/eventModel";
import { parseStoredDate } from "../utils/scheduler";
import {
  cancelJobsForEvent,
  createOrUpdateJobsForEvent,
} from "../models/notificationJobModel";
import { findUserById } from "../models/userModel";
import notification, { NotificationResult } from "../utils/notification";

function getStatus(datetime: string): "upcoming" | "missed" {
  return new Date(datetime).getTime() <= Date.now() ? "missed" : "upcoming";
}

export async function listEvents(req: Request, res: Response) {
  const userId = (req as any).userId as number;
  const events = await getEventsByUser(userId);

  const normalized = events.map((event) => {
    const computedStatus =
      event.status === "completed" ? "completed" : getStatus(event.datetime);
    // Normalize datetime to an explicit ISO string (UTC) for the client to avoid
    // timezone-parsing mismatches between browser and server.
    const parsed = parseStoredDate(event.datetime);
    const normalizedDatetime = parsed.toISOString();
    const datetimeLabel = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(parsed);
    return {
      ...event,
      status: computedStatus,
      datetime: normalizedDatetime,
      datetime_label: datetimeLabel,
    };
  });

  await Promise.all(
    normalized
      .filter((event, index) => event.status !== events[index].status)
      .map((event) => updateEventStatus(event.id, event.status)),
  );

  res.json({ events: normalized });
}

export async function addEvent(req: Request, res: Response) {
  const userId = (req as any).userId as number;
  const { type, title, datetime, details } = req.body;

  if (!type || !title || !datetime) {
    return res
      .status(400)
      .json({ message: "Type, title, and datetime are required" });
  }

  // Normalize and validate incoming datetime. Treat datetime values coming
  // from the client (often `datetime-local` strings without a timezone)
  // as Asia/Manila local times and convert them to an explicit UTC ISO
  // string so the DB stores a timezone-aware value and both server/client
  // interpret it consistently.
  const eventDate = parseStoredDate(datetime);
  if (Number.isNaN(eventDate.getTime()) || eventDate < new Date()) {
    return res
      .status(400)
      .json({ message: "Datetime must be a future date and time" });
  }

  if (!["Deadline", "Meeting", "Business Trip"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }

  let newEvent;
  try {
    const normalizedDatetime = eventDate.toISOString();
    newEvent = await createEvent(
      userId,
      type,
      title,
      normalizedDatetime,
      details,
    );
  } catch (err) {
    console.error("addEvent DB error:", err);
    return res.status(500).json({
      message: "Failed to create event",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // enqueue scheduled notification jobs for this event
  try {
    await createOrUpdateJobsForEvent(newEvent);
  } catch (err) {
    console.warn(
      "Failed to create notification jobs for event",
      newEvent?.id,
      err,
    );
  }

  // notify user about the newly created event (email/sms)
  let notificationStatus: {
    email?: NotificationResult;
    sms?: NotificationResult;
  } = {
    email: { success: false },
    sms: { success: false },
  };
  try {
    const user = await findUserById(userId);
    if (!user) {
      console.warn(
        "Event created but user not found for notifications",
        userId,
      );
    } else {
      console.log("Event created", newEvent);
      console.log("Notifying user", user.email, (user as any).phone);
      notificationStatus = await notification.notifyUserOfEvent(
        user,
        newEvent,
        { sendDiscord: false },
      );
      console.log(
        "notifyUserOfEvent called for event",
        newEvent.id,
        notificationStatus,
      );
    }
  } catch (err) {
    // don't fail the request if notifications fail
    // eslint-disable-next-line no-console
    console.warn("Notification send failed:", err);
    notificationStatus = {
      email: { success: false, error: "unknown" },
      sms: { success: false, error: "unknown" },
    };
  }

  // Attach a Manila-friendly label so clients (dashboards) can render consistent times
  const createdLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(parseStoredDate(newEvent.datetime));

  res.status(201).json({
    event: {
      ...newEvent,
      datetime: newEvent.datetime,
      datetime_label: createdLabel,
    },
    notificationStatus,
  });
}

export async function getEvent(req: Request, res: Response) {
  const userId = (req as any).userId as number;
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId, userId);
  if (!event) return res.status(404).json({ message: "Event not found" });
  // normalize datetime
  const parsed = parseStoredDate(event.datetime);
  const normalized = {
    ...event,
    datetime: parsed.toISOString(),
    datetime_label: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(parsed),
  };
  res.json({ event: normalized });
}

export async function completeEvent(req: Request, res: Response) {
  const userId = (req as any).userId as number;
  const eventId = Number(req.params.id);
  const event = await getEventById(eventId, userId);
  if (!event) return res.status(404).json({ message: "Event not found" });

  await updateEventStatus(eventId, "completed");
  await cancelJobsForEvent(eventId, "event_completed");
  res.json({ message: "Event marked completed" });
}
