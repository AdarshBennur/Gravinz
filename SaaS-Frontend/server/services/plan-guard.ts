/**
 * plan-guard.ts — Single source of truth for plan-based email limit enforcement.
 *
 * Two-tier limit system:
 *   Plan cap (hard ceiling, backend-enforced):
 *     "owner" → Infinity
 *     "free"  → FREE_DAILY_LIMIT (5), only for FREE_TRIAL_DAYS (14) days
 *
 *   User-configured limit (soft throttle, from campaign settings):
 *     Any positive integer the user sets in Campaign Settings UI
 *
 *   Effective limit = MIN(userConfiguredLimit, planHardCap)
 *   For owner: planHardCap = Infinity → effectiveLimit = userConfiguredLimit
 *
 * NEVER import this in frontend code.
 */

export const FREE_DAILY_LIMIT = 5;
export const FREE_TRIAL_DAYS = 14;
export const OWNER_DEFAULT_LIMIT = 20; // fallback when owner has no configured limit

export type PlanName = "free" | "owner" | string;

export type PlanCheckResult =
  | { allowed: true; isOwner: boolean; effectiveLimit: number }
  | { allowed: false; isOwner: false; effectiveLimit: number; reason: "trial_expired" | "daily_limit_reached" };

/**
 * Returns whether this user is allowed to send another email right now,
 * and what the effective daily limit is (for quota tracking downstream).
 *
 * @param user               - User record (needs .plan and .createdAt)
 * @param sentToday          - Emails already sent today
 * @param userConfiguredLimit - Value from campaign_settings.daily_limit (optional)
 */
export function checkPlan(
  user: { plan?: string | null; createdAt: Date | string },
  sentToday: number,
  userConfiguredLimit?: number | null,
): PlanCheckResult {
  const plan: PlanName = user.plan ?? "free";

  if (plan === "owner") {
    // Owner: no trial, no hard cap.
    // effectiveLimit = whatever the user configured (or a sensible default).
    const effectiveLimit = userConfiguredLimit ?? OWNER_DEFAULT_LIMIT;
    return { allowed: true, isOwner: true, effectiveLimit };
  }

  // Free plan — check trial window first (hard block, ignores configured limit)
  const createdAt = user.createdAt instanceof Date
    ? user.createdAt
    : new Date(user.createdAt);

  const trialExpiresAt = new Date(createdAt);
  trialExpiresAt.setDate(trialExpiresAt.getDate() + FREE_TRIAL_DAYS);

  if (new Date() > trialExpiresAt) {
    return { allowed: false, reason: "trial_expired", isOwner: false, effectiveLimit: 0 };
  }

  // Free plan — compute effective limit: MIN(configured, FREE_DAILY_LIMIT)
  const effectiveLimit = userConfiguredLimit
    ? Math.min(userConfiguredLimit, FREE_DAILY_LIMIT)
    : FREE_DAILY_LIMIT;

  if (sentToday >= effectiveLimit) {
    return { allowed: false, reason: "daily_limit_reached", isOwner: false, effectiveLimit };
  }

  return { allowed: true, isOwner: false, effectiveLimit };
}

/**
 * Returns trial + plan metadata for dashboard API response.
 *
 * @param user               - User record
 * @param userConfiguredLimit - Value from campaign_settings.daily_limit (optional)
 */
export function getTrialInfo(
  user: { plan?: string | null; createdAt: Date | string },
  userConfiguredLimit?: number | null,
): {
  plan: PlanName;
  isOwner: boolean;
  trialExpiresAt: Date | null;
  trialExpired: boolean;
  effectiveDailyLimit: number | null; // null = unlimited display (owner with no config)
} {
  const plan: PlanName = user.plan ?? "free";

  if (plan === "owner") {
    return {
      plan,
      isOwner: true,
      trialExpiresAt: null,
      trialExpired: false,
      // null signals "unlimited" to UI. If owner has a configured limit, show it.
      effectiveDailyLimit: userConfiguredLimit ?? null,
    };
  }

  const createdAt = user.createdAt instanceof Date
    ? user.createdAt
    : new Date(user.createdAt);

  const trialExpiresAt = new Date(createdAt);
  trialExpiresAt.setDate(trialExpiresAt.getDate() + FREE_TRIAL_DAYS);
  const trialExpired = new Date() > trialExpiresAt;

  const effectiveDailyLimit = userConfiguredLimit
    ? Math.min(userConfiguredLimit, FREE_DAILY_LIMIT)
    : FREE_DAILY_LIMIT;

  return {
    plan,
    isOwner: false,
    trialExpiresAt,
    trialExpired,
    effectiveDailyLimit: trialExpired ? 0 : effectiveDailyLimit,
  };
}
