import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Middleware: Verify Supabase JWT and set req.userId.
 * Expects Authorization: Bearer <access_token>
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);

  supabaseAdmin.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      req.userId = data.user.id;
      next();
    })
    .catch(() => {
      return res.status(401).json({ message: "Authentication failed" });
    });
}

/**
 * Get the authenticated user's ID from the request.
 * Must be called after requireAuth middleware.
 */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new Error("getUserId called without requireAuth middleware");
  }
  return req.userId;
}
