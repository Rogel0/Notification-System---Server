import { Router } from "express";
import {
  getNotificationConfig,
  resendEvent,
  previewEvent,
  triggerSchedulerNow,
} from "../controllers/adminController";

const router = Router();

router.get("/notification-config", getNotificationConfig);
router.post("/resend-event/:id", resendEvent);
router.get("/preview-event/:id", previewEvent);
router.post("/trigger-scheduler", triggerSchedulerNow);

export default router;
