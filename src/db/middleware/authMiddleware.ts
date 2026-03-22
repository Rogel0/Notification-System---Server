import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../utils/jwtUtils";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    // Token invalid or expired: clear cookie and reject
    res.clearCookie("token", { path: "/" });
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  (req as any).userId = payload.userId;
  next();
}
