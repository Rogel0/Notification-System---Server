import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import eventRoutes from "./routes/eventRoutes";
import { authMiddleware } from "./db/middleware/authMiddleware";
import pool from "./db";

dotenv.config();

const app = express();
app.set("trust proxy", 1); // needed for req.secure behind proxies (Railway/Vercel/etc.)
const frontendUrlEnv = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = frontendUrlEnv
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  allowedOrigins.push("http://localhost:5173");
}
const isProduction = process.env.NODE_ENV === "production";

// Configure CORS with credentials and explicit allowed methods/headers.
const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // In non-production, allow any origin to ease diagnostics and local/emulator usage.
    if (!isProduction) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Robust preflight responder to avoid any explicit wildcard `app.options` problems
// Returns required CORS headers for OPTIONS requests early in the pipeline.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin as string | undefined;
    if (!origin || !isProduction || allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Requested-With,Accept,Origin",
      );
      return res.sendStatus(204);
    }
    return res.status(403).send("CORS origin not allowed");
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

// Dev-only cookie debug logger — prints incoming cookies for each request.
// Remove or disable in production.
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log("[dev] incoming cookies:", req.cookies);
    next();
  });
}

// NB: avoid registering wildcard `app.options("*")` which can trigger
// path-to-regexp PathError in some environments. The preflight responder
// above covers OPTIONS requests.

import adminRoutes from "./routes/adminRoutes";
import { startScheduler } from "./utils/scheduler";

app.use("/api", authRoutes);
app.use("/api/events", authMiddleware, eventRoutes);
// Admin routes are unprotected for local testing; make sure to secure in production.
app.use("/api/admin", adminRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);

  // start background schedule checker
  startScheduler();
});
