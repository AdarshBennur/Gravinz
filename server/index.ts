import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
// serveStatic removed — frontend is served separately via Vercel in production
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// ────────────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE — Must be registered before any routes
// ────────────────────────────────────────────────────────────────────────────

// 1. Helmet — sets secure HTTP headers (HSTS, X-Frame-Options, CSP, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Vite dev needs these
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
      },
    },
    crossOriginEmbedderPolicy: false, // Relax for external image loads
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
  })
);

// 2. CORS — restrict to known origins only
const allowedOrigins = [
  process.env.FRONTEND_URL, // Production frontend domain
  "http://localhost:5000",
  "http://localhost:5001",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5001",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, mobile apps, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 3. Rate limiters — applied before route logic
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please wait 1 minute." },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many signup attempts. Please wait 1 minute." },
});

const emailSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many test email sends. Please wait 1 minute." },
});

const automationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many automation requests. Please wait 1 minute." },
});

// Apply global rate limit to all /api routes
app.use("/api", globalLimiter);

// Apply specific rate limits (these stack with the global limiter)
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/email-test/send", emailSendLimiter);
app.use("/api/automation/start", automationLimiter);

// ────────────────────────────────────────────────────────────────────────────
// BODY PARSING
// ────────────────────────────────────────────────────────────────────────────

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "1mb", // Reject oversized payloads
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ────────────────────────────────────────────────────────────────────────────
// STRUCTURED REQUEST LOGGING — No response body, no PII, no tokens
// ────────────────────────────────────────────────────────────────────────────

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Structured log: method, route, status, duration ONLY.
      // NO response body — prevents leaking tokens, PII, and emails.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// ────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK — Unauthenticated, no sensitive data
// ────────────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ────────────────────────────────────────────────────────────────────────────
// APP SETUP
// ────────────────────────────────────────────────────────────────────────────

(async () => {
  await registerRoutes(httpServer, app);

  // Global error handler — NEVER leak internal error details to client
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    // Log full error server-side for debugging
    console.error("[Server Error]", err);

    // Return generic message to client — never expose internals
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({ message: "Internal server error" });
  });

  // In production, frontend is served separately (Vercel).
  // Backend is a pure API server — no static file serving needed.
  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on http://localhost:${port}`);
  });
})();

// ────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN — Stop scheduler, close server, close DB connections
// ────────────────────────────────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);

  try {
    // 1. Stop automation scheduler
    const { stopAutomationScheduler } = await import("./services/automation");
    stopAutomationScheduler();
    console.log("[Shutdown] Automation scheduler stopped.");
  } catch (e) {
    console.error("[Shutdown] Error stopping automation:", e);
  }

  // 2. Close HTTP server (stop accepting new connections)
  httpServer.close(() => {
    console.log("[Shutdown] HTTP server closed.");
  });

  try {
    // 3. Close database connections
    const { pool } = await import("./db");
    await pool.end();
    console.log("[Shutdown] Database pool closed.");
  } catch (e) {
    console.error("[Shutdown] Error closing DB pool:", e);
  }

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error("[Shutdown] Forced exit after timeout.");
    process.exit(1);
  }, 10_000).unref();

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
