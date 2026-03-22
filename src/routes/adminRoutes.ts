import { Router } from "express";
import {
  notifyTest,
  getNotificationConfig,
} from "../controllers/adminController";

const router = Router();

router.post("/notify-test", notifyTest);
router.get("/notification-config", getNotificationConfig);

export default router;
