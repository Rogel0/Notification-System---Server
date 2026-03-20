import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../utils/jwtUtils";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ message: "Invalid token" });
  (req as any).userId = payload.userId;
  next();
}
