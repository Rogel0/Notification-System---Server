import express from "express";
import {
  addEvent,
  completeEvent,
  getEvent,
  listEvents,
} from "../controllers/eventController";

const router = express.Router();

router.get("/", listEvents);
router.post("/", addEvent);
router.get("/:id", getEvent);
router.put("/:id/complete", completeEvent);

export default router;
