/**
 * plan-guard.ts — Single source of truth for plan-based email limit enforcement.
 *
 * Plans:
 *   "owner"  → unlimited sends, no trial window
 *   "free"   → max FREE_DAILY_LIMIT per day, valid for FREE_TRIAL_DAYS from createdAt
 *
 * All enforcement is server-side. This module is imported by:
 *   - automation.ts (send cycle)
 *   - routes.ts (dashboard API enrichment)
 *
 * NEVER import this in frontend code.
 */

export const FREE_DAILY_LIMIT = 5;
export const FREE_TRIAL_DAYS = 14;

export type PlanName = "free" | "owner" | string;

export type PlanCheckResult =
  | { allowed: true; isOwner: boolean }
  | { allowed: false; reason: "trial_expired" | "daily_limit_reached"; isOwner: false };

/**
 * Returns whether this user is allowed to send another email right now.
 *
 * @param user     - User record (needs .plan and .createdAt)
 * @param sentToday - Number of emails already sent by this user today
 */
export function checkPlan(
  user: { plan?: string | null; createdAt: Date | string },
  sentToday: number
): PlanCheckResult {
  const plan: PlanName = user.plan ?? "free";

  // Owner — always allowed, no cap
  if (plan === "owner") {
    return { allowed: true, isOwner: true };
  }

  // Free plan — check trial window first
  const createdAt = user.createdAt instanceof Date
    ? user.createdAt
    : new Date(user.createdAt);

  const trialExpiresAt = new Date(createdAt);
  trialExpiresAt.setDate(trialExpiresAt.getDate() + FREE_TRIAL_DAYS);

  const now = new Date();
  if (now > trialExpiresAt) {
    return { allowed: false, reason: "trial_expired", isOwner: false };
  }

  // Free plan — check daily cap
  if (sentToday >= FREE_DAILY_LIMIT) {
    return { allowed: false, reason: "daily_limit_reached", isOwner: false };
  }

  return { allowed: true, isOwner: false };
}

/**
 * Returns trial metadata for a given user — used by the dashboard API.
 */
export function getTrialInfo(user: { plan?: string | null; createdAt: Date | string }): {
  plan: PlanName;
  isOwner: boolean;
  trialExpiresAt: Date | null;
  trialExpired: boolean;
  effectiveDailyLimit: number | null; // null = unlimited
} {
  const plan: PlanName = user.plan ?? "free";

  if (plan === "owner") {
    return {
      plan,
      isOwner: true,
      trialExpiresAt: null,
      trialExpired: false,
      effectiveDailyLimit: null,
    };
  }

  const createdAt = user.createdAt instanceof Date
    ? user.createdAt
    : new Date(user.createdAt);

  const trialExpiresAt = new Date(createdAt);
  trialExpiresAt.setDate(trialExpiresAt.getDate() + FREE_TRIAL_DAYS);

  return {
    plan,
    isOwner: false,
    trialExpiresAt,
    trialExpired: new Date() > trialExpiresAt,
    effectiveDailyLimit: FREE_DAILY_LIMIT,
  };
}
