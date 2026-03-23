import { Router } from "express";
import {
  notifyTest,
  getNotificationConfig,
  resendEvent,
  previewEvent,
  seedMockEvents,
  triggerSchedulerNow,
} from "../controllers/adminController";

const router = Router();

router.post("/notify-test", notifyTest);
router.get("/notification-config", getNotificationConfig);
router.post("/resend-event/:id", resendEvent);
router.get("/preview-event/:id", previewEvent);
router.post("/seed-mock", seedMockEvents);
router.post("/trigger-scheduler", triggerSchedulerNow);

export default router;
