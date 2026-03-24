import { Router } from "express";
import {
  getNotificationConfig,
  resendEvent,
  previewEvent,
  triggerSchedulerNow,
  resolveDiscordTag,
  sendDiscordTest,
} from "../controllers/adminController";

const router = Router();

router.get("/notification-config", getNotificationConfig);
router.get("/discord-resolve", resolveDiscordTag);
router.get("/discord-send-test", sendDiscordTest);
router.post("/resend-event/:id", resendEvent);
router.get("/preview-event/:id", previewEvent);
router.post("/trigger-scheduler", triggerSchedulerNow);

export default router;
