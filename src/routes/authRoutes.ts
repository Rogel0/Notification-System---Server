import { Router } from "express";
import {
  register,
  login,
  profile,
  logout,
} from "../controllers/authController";
import { resolveDiscordIdByTag, sendDiscordDm } from "../utils/notification";
import { authMiddleware } from "../db/middleware/authMiddleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/profile", authMiddleware, profile);

// Testing endpoints for Discord lookup + DM are available without auth for local/dev.
// Remove or protect in production if necessary.
router.get("/discord-resolve", async (req, res) => {
  const tag = String(req.query.tag || "").trim();
  if (!tag) return res.status(400).json({ message: "Missing tag" });
  try {
    const discordId = await resolveDiscordIdByTag(tag);
    if (!discordId) return res.json({ success: false, error: "not_found" });
    return res.json({ success: true, discordId });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, error: err.message || "resolve_failed" });
  }
});

router.get("/discord-send-test", async (req, res) => {
  const tag = String(req.query.tag || "").trim();
  if (!tag) return res.status(400).json({ message: "Missing tag" });
  try {
    const discordId = await resolveDiscordIdByTag(tag);
    if (!discordId) return res.json({ success: false, error: "not_found" });
    const result = await sendDiscordDm(discordId, {
      content: `Test message for ${tag}`,
    });
    return res.json({ success: Boolean(result.success), result });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, error: err.message || "send_failed" });
  }
});

export default router;
