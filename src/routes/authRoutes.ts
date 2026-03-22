import { Router } from "express";
import {
  register,
  login,
  profile,
  logout,
} from "../controllers/authController";
import { authMiddleware } from "../db/middleware/authMiddleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/profile", authMiddleware, profile);

export default router;
