import cron from "node-cron";
import { storage } from "../storage";
import { generateEmail } from "./email-generator.ts";
import { sendEmail, checkForReplies, isGmailConfigured } from "./gmail.ts";
import { type User, type Contact, type EmailSend, type CampaignSettings } from "../../shared/schema.ts";
import { syncContactStatusToNotion } from "./notion.ts";
import { eq, and, desc } from "drizzle-orm";

let automationTask: ReturnType<typeof cron.schedule> | null = null;
let replyCheckTask: ReturnType<typeof cron.schedule> | null = null;
let sendCycleRunning = false;
let replyCheckRunning = false;

export function startAutomationScheduler() {
  if (automationTask) {
    automationTask.stop();
  }
  if (replyCheckTask) {
    replyCheckTask.stop();
  }

  // Run every 5 minutes
  automationTask = cron.schedule("*/5 * * * *", async () => {
    console.log("[Automation] Running send cycle...");
    await runAutomationCycle();
  });

  // Check replies every 10 minutes
  replyCheckTask = cron.schedule("*/10 * * * *", async () => {
    console.log("[Automation] Checking for replies...");
    await runReplyCheck();
  });

  console.log("[Automation] Scheduler started - send cycle every 5 min, reply check every 10 min");
}

export function stopAutomationScheduler() {
  if (automationTask) {
    automationTask.stop();
    automationTask = null;
  }
  if (replyCheckTask) {
    replyCheckTask.stop();
    replyCheckTask = null;
  }
  console.log("[Automation] Scheduler stopped");
}

export async function runAutomationCycle() {
  if (sendCycleRunning) {
    console.log("[Automation] Send cycle already running, skipping");
    return;
  }
  sendCycleRunning = true;
  try {
    const activeUsers = await storage.getUsersWithActiveAutomation();
    for (const userId of activeUsers) {
      try {
        await processUserAutomation(userId);
      } catch (err: any) {
        console.error(`[Automation] Error for user ${userId}:`, err.message);
      }
    }
  } finally {
    sendCycleRunning = false;
  }
}

function isAfterStartTime(settings: any): boolean {
  const startTime = settings.startTime || "09:00";
  const tz = settings.timezone || "America/New_York";

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const currentHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const currentMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;

    return currentMinutes >= startMinutes;
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRALIZED ATOMIC STATE TRANSITION
// This is the SINGLE function responsible for all post-send status + date updates.
// It is IDEMPOTENT: safe to call multiple times without double-updating.
// ─────────────────────────────────────────────────────────────────────────────
async function updateContactAfterSend(
  contact: Contact,
  type: "first" | "followup1" | "followup2",
  userId: string
): Promise<void> {
  const finalStatus =
    type === "first" ? "sent" :
      type === "followup1" ? "followup-1" :
        "followup-2";

  // IDEMPOTENCY GUARD 1: Re-fetch fresh state from DB (not stale in-memory copy)
  const fresh = await storage.getContact(contact.id, userId);
  if (!fresh) {
    throw new Error(`[AUTOMATION] Contact ${contact.id} not found during post-send update`);
  }

  // IDEMPOTENCY GUARD 2: Skip entirely if already transitioned
  if (fresh.status === finalStatus) {
    console.log(`[AUTOMATION] Contact ${contact.email} already in state "${finalStatus}" — skipping duplicate update`);
    return;
  }

  // ─── DEFENSIVE PRECONDITION GUARDS ───────────────────────────────────────
  // Enforce state machine invariants BEFORE writing to DB.
  // A transition to followup-1 REQUIRES firstEmailDate to already be set.
  // A transition to followup-2 REQUIRES followup1Date to already be set.
  // If these are missing, the contact is in a corrupt state — abort immediately.
  if (type === "followup1" && !fresh.firstEmailDate) {
    throw new Error(
      `[AUTOMATION] PRECONDITION FAILED: Cannot transition ${contact.email} to followup-1 — firstEmailDate is NULL on fresh DB read. Aborting to prevent corrupt state.`
    );
  }
  if (type === "followup2" && !fresh.followup1Date) {
    throw new Error(
      `[AUTOMATION] PRECONDITION FAILED: Cannot transition ${contact.email} to followup-2 — followup1Date is NULL on fresh DB read. Aborting to prevent corrupt state.`
    );
  }

  // ─── TIMESTAMP GENERATION ─────────────────────────────────────────────────
  // ALWAYS use full ISO-8601 UTC string. NEVER a Date object, NEVER date-only.
  // Columns are timestamptz — they require the full precision moment.
  const now = new Date().toISOString(); // e.g. "2026-02-19T11:24:00.000Z"

  // ─── STRICT DATE ASSIGNMENT ───────────────────────────────────────────────
  // Each transition sets EXACTLY ONE date field.
  // NEVER touch other date fields. NEVER overwrite an existing date.
  // ─────────────────────────────────────────────────────────────────────────
  const dateUpdates: Record<string, any> = {
    status: finalStatus,
    lastSentAt: now,
  };

  if (type === "first") {
    // STATE 1 → 2: Set firstEmailDate only. followup1Date and followup2Date untouched.
    if (fresh.firstEmailDate) {
      // Already set — idempotency: preserve original, do not overwrite
      console.log(`[AUTOMATION] firstEmailDate already set (${fresh.firstEmailDate}) — preserving original`);
    } else {
      dateUpdates.firstEmailDate = now;
      console.log(`[AUTOMATION] Transition:\n  not-sent -> sent\n  Setting firstEmailDate=${now}`);
    }
    // Explicit safety: do NOT include followup1Date or followup2Date in this update

  } else if (type === "followup1") {
    // STATE 2 → 3: Set followup1Date only. firstEmailDate and followup2Date untouched.
    if (fresh.followup1Date) {
      console.log(`[AUTOMATION] followup1Date already set (${fresh.followup1Date}) — preserving original`);
    } else {
      dateUpdates.followup1Date = now;
      console.log(`[AUTOMATION] Transition:\n  sent -> followup-1\n  Setting followup1Date=${now}`);
    }
    // Explicit safety: do NOT include firstEmailDate or followup2Date in this update

  } else if (type === "followup2") {
    // STATE 3 → 4: Set followup2Date only. firstEmailDate and followup1Date untouched.
    if (fresh.followup2Date) {
      console.log(`[AUTOMATION] followup2Date already set (${fresh.followup2Date}) — preserving original`);
    } else {
      dateUpdates.followup2Date = now;
      console.log(`[AUTOMATION] Transition:\n  followup-1 -> followup-2\n  Setting followup2Date=${now}`);
    }
    // Explicit safety: do NOT include firstEmailDate or followup1Date in this update
  }

  // ─── DEFENSIVE GUARD: No date-only strings in DB ──────────────────────────
  // Only validate actual date fields (keys ending in "Date").
  // Do NOT check "status" or "lastSentAt" — status values like "followup-2"
  // are exactly 10 chars and would trip the length check incorrectly.
  for (const [key, value] of Object.entries(dateUpdates)) {
    if (key.endsWith("Date") && typeof value === "string" && value.length <= 10) {
      throw new Error(
        `[AUTOMATION] GUARD: Attempted to store date-only value "${value}" ` +
        `for field "${key}". Only full ISO-8601 timestamps are allowed in timestamp columns.`
      );
    }
  }

  // DB UPDATE — status + exactly one date field in a single atomic call
  console.log(`[AUTOMATION] Updating DB status -> "${finalStatus}" for ${contact.email}`);
  await storage.updateContact(contact.id, userId, dateUpdates);
  console.log(`[AUTOMATION] DB update complete for ${contact.email}`);

  // NOTION SYNC — best-effort, logged on error (never blocks the DB commit)
  // Pass the full date picture so Notion reflects current state accurately.
  // Only the newly-set date will be non-null in dateUpdates; others come from fresh.
  console.log(`[AUTOMATION] Updating Notion page -> "${finalStatus}" for ${contact.email}`);
  await tryNotionSync(userId, contact.id, finalStatus, {
    firstEmailDate: (dateUpdates.firstEmailDate ?? fresh.firstEmailDate) ?? null,
    followup1Date: (dateUpdates.followup1Date ?? fresh.followup1Date) ?? null,
    followup2Date: (dateUpdates.followup2Date ?? fresh.followup2Date) ?? null,
  });

  console.log(`[AUTOMATION] Transition complete for ${contact.email}: "${contact.status}" -> "${finalStatus}"`);
}

export async function processUserAutomation(userId: string) {
  console.log(`[Automation Debug] Starting processUserAutomation for user: ${userId}`);
  const settings = await storage.getCampaignSettings(userId);
  if (!settings || settings.automationStatus !== "running") {
    return;
  }

  if (!isAfterStartTime(settings)) {
    console.log(`[Automation Debug] User ${userId}: Before start time, skipping`);
    return;
  }

  const gmailIntegration = await storage.getIntegration(userId, "gmail");
  if (!gmailIntegration?.connected) {
    console.log(`[Automation Debug] User ${userId}: Gmail not connected, skipping`);
    return;
  }

  // ─── TIMEZONE-AWARE DAILY QUOTA DATE ─────────────────────────────────────
  // Use the user's configured timezone so the daily counter resets at midnight
  // in their local time — not at UTC midnight (which is 6:30 AM IST for +05:30).
  // en-CA locale produces "YYYY-MM-DD" format.
  const tz = settings.timezone || "UTC";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const usage = await storage.getDailyUsage(userId, today);
  const sentToday = usage?.emailsSent ?? 0;
  const dailyLimit = settings.dailyLimit ?? 80;

  if (sentToday >= dailyLimit) {
    console.log(`[Automation Debug] User ${userId}: Daily limit reached (${sentToday}/${dailyLimit}).`);
    return;
  }

  const remainingQuota = dailyLimit - sentToday;
  const contacts = await storage.getContacts(userId);

  // ─── CAMPAIGN SETTINGS: STRICT LOADING WITH FALLBACK WARNINGS ───────────
  // Log the raw DB values BEFORE any fallback so we can see exactly what
  // Supabase returned. Silent defaults are the #1 cause of "random" behavior.
  const maxFollowups = settings.followupCount ?? (() => {
    console.warn(`[AUTOMATION] followupCount not set in DB for user ${userId} — defaulting to 2. Set it in Campaign Settings.`);
    return 2;
  })();

  // ─── SAFE JSONB PARSING ──────────────────────────────────────────────────
  // followupDelays is stored as JSONB. Drizzle may return it as:
  //   - number[] (correct)
  //   - string (if serialized incorrectly, e.g. "[2,4]")
  //   - null/undefined
  // We MUST defensively parse it — but WARN loudly when a fallback fires.
  let delays: number[] = [];
  const rawDelays = settings.followupDelays;
  if (Array.isArray(rawDelays)) {
    delays = rawDelays;
  } else if (typeof rawDelays === "string") {
    try {
      const parsed = JSON.parse(rawDelays);
      if (Array.isArray(parsed)) {
        delays = parsed;
        console.warn(`[AUTOMATION] followupDelays was a JSON string in DB: "${rawDelays}" — parsed to ${JSON.stringify(delays)}. Check JSONB column type.`);
      } else {
        console.error(`[AUTOMATION] followupDelays parsed but not an array: ${JSON.stringify(parsed)}. Using fallback [2,4].`);
        delays = [2, 4];
      }
    } catch {
      console.error(`[AUTOMATION] followupDelays failed to parse: "${rawDelays}". Using fallback [2,4].`);
      delays = [2, 4];
    }
  } else if (rawDelays != null) {
    console.error(`[AUTOMATION] Unexpected followupDelays type: ${typeof rawDelays} value: ${rawDelays}. Using fallback [2,4].`);
    delays = [2, 4];
  } else {
    // null/undefined — no delays configured at all
    console.warn(`[AUTOMATION] followupDelays is null/undefined for user ${userId}. Using fallback [2,4].`);
    delays = [2, 4];
  }

  let processedCount = 0;

  console.log(`[AUTOMATION] Campaign settings resolved for user ${userId}:`, {
    rawFollowupCount: settings.followupCount,        // exact DB value
    rawFollowupDelays: settings.followupDelays,      // exact DB value
    rawDelaysType: typeof settings.followupDelays,   // helps diagnose JSONB issues
    resolvedMaxFollowups: maxFollowups,              // what automation will use
    resolvedDelays: delays,                          // what automation will use
    timezone: tz,
    today: today,                                    // date in user's own timezone
    dailyLimit,
    sentToday,
    remainingQuota: dailyLimit - sentToday,
    totalContacts: contacts.length,
  });

  // ─── SORT CONTACTS: FOLLOWUP-ELIGIBLE FIRST ──────────────────────────────
  // Critical: if not-sent contacts appear first, they consume the entire cycle
  // and followup-eligible contacts never get processed within the 5-min window.
  // Priority: followup-1 > sent > not-sent (followups before first sends)
  const statusPriority: Record<string, number> = {
    "followup-1": 0,  // highest priority — these have been waiting longest
    "sent": 1,        // next — eligible for followup-1
    "not-sent": 2,    // lowest — first emails can wait
  };
  const sortedContacts = [...contacts].sort((a, b) => {
    const pa = statusPriority[a.status || ""] ?? 99;
    const pb = statusPriority[b.status || ""] ?? 99;
    return pa - pb;
  });

  for (const contact of sortedContacts) {
    if (processedCount >= remainingQuota) break;

    // Terminal states — skip permanently
    // NOTE: "failed" is intentionally excluded — it was set by the old error handler and retried.
    // NOTE: lock statuses (sending_first/f1/f2) are also excluded from permanent terminal list.
    //       These are transient in-progress locks; if the server crashed mid-send, they must be
    //       rolled back to their base status (not-sent/sent/followup-1) so the next cycle retries.
    if (["replied", "bounced", "stopped", "manual_break", "rejected"].includes(contact.status || "")) continue;

    // Roll back stale lock statuses (server crash / uncaught failure mid-send)
    if (["sending_first", "sending_f1", "sending_f2"].includes(contact.status || "")) {
      const rollbackStatus = contact.status === "sending_first" ? "not-sent"
        : contact.status === "sending_f1" ? "sent"
          : "followup-1";
      console.warn(`[AUTOMATION] Stale lock detected for ${contact.email}: "${contact.status}" → rolling back to "${rollbackStatus}"`);
      try {
        await storage.updateContact(contact.id, userId, { status: rollbackStatus } as any);
      } catch (e: any) {
        console.error(`[AUTOMATION] Lock rollback failed for ${contact.email}:`, e.message);
      }
      continue; // Skip this cycle; contact will be picked up next cycle with clean status
    }

    // ─── PER-CONTACT DEBUG LOG ──────────────────────────────────────────────
    console.log(`[AUTOMATION DEBUG] Evaluating contact: ${contact.email}`);
    console.log(`  status=${contact.status}`);
    console.log(`  firstEmailDate=${contact.firstEmailDate || "NULL"}`);
    console.log(`  followup1Date=${contact.followup1Date || "NULL"}`);
    console.log(`  followup2Date=${contact.followup2Date || "NULL"}`);
    console.log(`  campaignDelays=${JSON.stringify(delays)}`);

    let targetAction: {
      type: "first" | "followup1" | "followup2";
      isFollowup: boolean;
      number: number;
      lockStatus: string;
      delayDays: number;
      referenceDate: Date | string | null;
    } | null = null;

    // ─── STATE MACHINE ───────────────────────────────────────────────────────
    // Status strings UNCHANGED: not-sent → sent → followup-1 → followup-2
    //
    // STRICT RULES:
    //   STATE 1 (not-sent):   firstEmailDate MUST be null. Eligible immediately.
    //   STATE 2 (sent):       Eligibility = daysSince(firstEmailDate) >= delays[0]
    //                         Reference MUST be firstEmailDate — NEVER lastSentAt.
    //   STATE 3 (followup-1): Eligibility = daysSince(followup1Date) >= delays[1]
    //                         Reference MUST be followup1Date — NEVER lastSentAt.
    //   STATE 4 (followup-2): If no more followups → status = "rejected". Terminal.
    // ─────────────────────────────────────────────────────────────────────────
    switch (contact.status) {
      case "not-sent":
        // STATE 1: Send first email. firstEmailDate must be null.
        if (contact.firstEmailDate !== null && contact.firstEmailDate !== undefined) {
          console.warn(`[AUTOMATION] SKIP ${contact.email}: status="not-sent" but firstEmailDate already set (${contact.firstEmailDate}). Data inconsistency.`);
          continue;
        }
        targetAction = {
          type: "first",
          isFollowup: false,
          number: 0,
          lockStatus: "sending_first",
          referenceDate: null,
          delayDays: 0,
        };
        console.log(`[AUTOMATION DEBUG] ${contact.email}: Eligible for FIRST email (immediate).`);
        break;

      case "sent":
        // STATE 2: Send Follow-up 1.
        // Reference date MUST be firstEmailDate — no fallback.
        if (!contact.firstEmailDate) {
          console.error(`[AUTOMATION] SKIP ${contact.email}: status="sent" but firstEmailDate is NULL. Cannot determine followup-1 eligibility.`);
          continue;
        }
        if (maxFollowups < 1) {
          console.log(`[AUTOMATION DEBUG] ${contact.email}: maxFollowups=${maxFollowups}, no followups configured. Moving to rejected.`);
          await storage.updateContact(contact.id, userId, { status: "rejected" } as any);
          await tryNotionSync(userId, contact.id, "rejected", {
            firstEmailDate: contact.firstEmailDate,
            followup1Date: null,
            followup2Date: null,
          });
          continue;
        }
        targetAction = {
          type: "followup1",
          isFollowup: true,
          number: 1,
          lockStatus: "sending_f1",
          referenceDate: contact.firstEmailDate, // STRICT: only firstEmailDate
          delayDays: delays[0] ?? 2,
        };
        break;

      case "followup-1":
        // STATE 3: Send Follow-up 2.
        // Reference date MUST be followup1Date — no fallback.
        if (!contact.firstEmailDate) {
          console.error(`[AUTOMATION] SKIP ${contact.email}: status="followup-1" but firstEmailDate is NULL. Data inconsistency.`);
          continue;
        }
        if (!contact.followup1Date) {
          console.error(`[AUTOMATION] SKIP ${contact.email}: status="followup-1" but followup1Date is NULL. Cannot determine followup-2 eligibility.`);
          continue;
        }
        if (maxFollowups < 2) {
          console.log(`[AUTOMATION DEBUG] ${contact.email}: maxFollowups=${maxFollowups}, no followup-2 configured. Moving to rejected.`);
          await storage.updateContact(contact.id, userId, { status: "rejected" } as any);
          await tryNotionSync(userId, contact.id, "rejected", {
            firstEmailDate: contact.firstEmailDate,
            followup1Date: contact.followup1Date,
            followup2Date: null,
          });
          continue;
        }
        targetAction = {
          type: "followup2",
          isFollowup: true,
          number: 2,
          lockStatus: "sending_f2",
          referenceDate: contact.followup1Date, // STRICT: only followup1Date
          delayDays: delays[1] ?? 4,
        };
        break;

      case "followup-2":
        // STATE 4: No more follow-ups. If no reply, mark rejected.
        if (contact.status === "followup-2") {
          console.log(`[AUTOMATION DEBUG] ${contact.email}: status="followup-2", no more followups. Moving to rejected.`);
          await storage.updateContact(contact.id, userId, { status: "rejected" } as any);
          await tryNotionSync(userId, contact.id, "rejected", {
            firstEmailDate: contact.firstEmailDate ?? null,
            followup1Date: contact.followup1Date ?? null,
            followup2Date: contact.followup2Date ?? null,
          });
        }
        continue;

      default:
        console.log(`[AUTOMATION DEBUG] ${contact.email}: Unknown status "${contact.status}". Skipping.`);
        continue;
    }

    if (!targetAction) continue;

    // ─── DATE ELIGIBILITY CHECK ───────────────────────────────────────────────
    // MANDATORY logging before every send decision.
    if (targetAction.isFollowup) {
      const referenceDate = targetAction.referenceDate!;
      const daysPassed = daysSince(referenceDate);
      const required = targetAction.delayDays;
      const eligible = daysPassed >= required;

      console.log(
        `[AUTOMATION] Checking eligibility:\n` +
        `  status=${contact.status}\n` +
        `  referenceDate=${new Date(referenceDate).toISOString().split("T")[0]}\n` +
        `  daysSince=${daysPassed}\n` +
        `  requiredDelay=${required}\n` +
        `  eligible=${eligible}`
      );

      if (!eligible) {
        console.log(`[AUTOMATION DEBUG] ${contact.email}: Not eligible yet. Skipping.`);
        continue;
      }

      console.log(`[AUTOMATION DEBUG] ${contact.email}: ELIGIBLE — proceeding to send.`);
    }

    // ─── CONCURRENCY LOCK ─────────────────────────────────────────────────────
    const locked = await storage.acquireAutomationLock(contact.id, userId, contact.status!, targetAction.lockStatus);
    if (!locked) {
      console.log(`[Automation] Could not acquire lock for ${contact.email}, skipping.`);
      continue;
    }

    // ─── EXECUTE SEND ─────────────────────────────────────────────────────────
    const sendType = targetAction.isFollowup ? `Follow-up ${targetAction.number}` : "FIRST email";
    console.log(`[AUTOMATION] Sending ${sendType} to ${contact.email}`);

    // ── LAYER 1: SEND ─────────────────────────────────────────────────────────
    // Generate + send. If this throws, we rollback the lock and skip commit.
    // Separation ensures that any post-send failure never silently skips the delay.
    let sendResult: { emailContent: { subject: string; body: string }; result: { messageId: string; threadId?: string } } | null = null;

    try {
      // 1. Generate email content
      const userProfile = await storage.getUserProfile(userId);
      console.log(`[AUTOMATION][A] Generating ${sendType} for ${contact.email}`);
      const emailContent = await generateEmail({
        userId,
        contactId: contact.id,
        contactName: contact.name,
        contactCompany: contact.company || undefined,
        contactRole: contact.role || undefined,
        isFollowup: targetAction.isFollowup,
        followupNumber: targetAction.number,
        resumeUrl: userProfile?.resumeUrl || undefined,
      });
      console.log(`[AUTOMATION][B] Email generated — subject: "${emailContent.subject}"`);

      // 2. Threading — attach to previous thread for follow-ups
      let previousThreadId: string | undefined;
      let previousMessageId: string | undefined;
      if (targetAction.isFollowup) {
        const history = await storage.getEmailSendsForContact(userId, contact.id);
        const lastSend = history[history.length - 1];
        if (lastSend) {
          previousThreadId = lastSend.gmailThreadId || undefined;
          previousMessageId = lastSend.gmailMessageId || undefined;
        }
      }

      // 3. Attachments
      let attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      if (userProfile?.resumeUrl) {
        try {
          const resumeRes = await fetch(userProfile.resumeUrl);
          if (resumeRes.ok) {
            const arrayBuffer = await resumeRes.arrayBuffer();
            attachments.push({
              filename: userProfile.resumeOriginalName || "attachment.pdf",
              content: Buffer.from(arrayBuffer),
              contentType: "application/pdf",
            });
          }
        } catch (e) {
          console.error("[Automation] Resume fetch failed:", e);
        }
      }

      // 4. Send via Gmail — MUST succeed before any state transition
      console.log(`[AUTOMATION][C] Sending via Gmail to ${contact.email}`);
      const result = await sendEmail(
        userId,
        contact.email,
        emailContent.subject,
        emailContent.body,
        previousThreadId,
        previousMessageId,
        attachments
      );
      console.log(`[AUTOMATION][D] Gmail confirmed — messageId: ${result.messageId} for ${contact.email}`);

      sendResult = { emailContent, result };

    } catch (sendError: any) {
      // Send failed (AI generation or Gmail error). Roll back the lock so the
      // contact is retried next cycle. Do NOT create inbox records.
      console.error(`[AUTOMATION] Send attempt failed for ${contact.email}: ${sendError.message}`);
      try {
        await storage.updateContact(contact.id, userId, { status: contact.status } as any);
        console.error(`[AUTOMATION] Lock rolled back — restored "${contact.status}" for ${contact.email}`);
      } catch (rollbackErr: any) {
        console.error(`[AUTOMATION] CRITICAL: Lock rollback failed for ${contact.email}:`, rollbackErr.message);
      }
    }

    // ── LAYER 2: COMMIT (only if send succeeded) ──────────────────────────────
    // Each step is independently fault-tolerant. A DB failure must not block
    // the inbox record, and vice versa. Notion failure must never block either.
    if (sendResult) {
      const { emailContent, result } = sendResult;

      // 2a. Update contact status + timestamp
      try {
        console.log(`[AUTOMATION][E] Updating DB — status + timestamp for ${contact.email}`);
        await updateContactAfterSend(contact, targetAction.type, userId);
        console.log(`[AUTOMATION][F] DB update complete for ${contact.email}`);
      } catch (dbErr: any) {
        console.error(`[AUTOMATION] DB update failed for ${contact.email}: ${dbErr.message}`);
        // updateContactAfterSend already calls tryNotionSync internally.
        // If it throws, Notion was not reached — log and continue.
      }

      // 2b. Create inbox email record
      try {
        console.log(`[AUTOMATION][I] Creating inbox record for ${contact.email}`);
        await storage.createEmailSend(userId, contact.id, {
          subject: emailContent.subject,
          body: emailContent.body,
          status: "sent",
          followupNumber: targetAction.number,
          sentAt: new Date(),
          gmailMessageId: result.messageId,
          gmailThreadId: result.threadId,
        });
        console.log(`[AUTOMATION][J] Inbox record created for ${contact.email}`);
      } catch (inboxErr: any) {
        console.error(`[AUTOMATION] Inbox record failed for ${contact.email}: ${inboxErr.message}`);
      }

      // 2c. Activity log (best-effort, non-critical)
      try {
        await storage.createActivityLog(userId, {
          contactName: contact.name,
          action: targetAction.isFollowup ? `Follow-up ${targetAction.number} sent` : "First email sent",
          status: "success",
        });
      } catch { /* non-critical */ }

      processedCount++;
      console.log(`[AUTOMATION] Processed ${sendType} for ${contact.email}. Total this cycle: ${processedCount}`);
    }

    // ── LAYER 3: DELAY (ALWAYS runs — outside every try block) ────────────────
    // Guaranteed 60s gap between contacts regardless of send/commit outcome.
    // This prevents rate-limit hammering even when every send fails.
    console.log(`[AUTOMATION][K] Starting 60s anti-spam delay after ${contact.email}`);
    await new Promise((resolve) => setTimeout(resolve, 60000));
    console.log(`[AUTOMATION][L] Delay complete — moving to next contact`);

  }

  if (processedCount > 0) {
    const freshUsage = await storage.getDailyUsage(userId, today);
    await storage.upsertDailyUsage(userId, today, {
      emailsSent: (freshUsage?.emailsSent ?? 0) + processedCount,
    });
    console.log(`[Automation] User ${userId}: Processed ${processedCount} emails this cycle`);
  } else {
    console.log(`[Automation] User ${userId}: No emails sent this cycle. All contacts either terminal, ineligible, or quota exhausted.`);
  }
}

// ─── DATA REPAIR FUNCTION ──────────────────────────────────────────────────────
// Repairs corrupted contacts where status implies dates should exist but they're NULL.
// This happens when contacts are imported from Notion without date extraction.
// ────────────────────────────────────────────────────────────────────────────────
export async function repairContactDates(userId: string): Promise<{ repaired: number; details: string[] }> {
  const contacts = await storage.getContacts(userId);
  let repaired = 0;
  const details: string[] = [];

  for (const contact of contacts) {
    const updates: Record<string, any> = {};
    const notionData = (contact as any).notionData as Record<string, any> | null;

    // Helper: try to extract date from notionData, fallback to createdAt
    const extractDate = (key: string): Date | null => {
      if (notionData && notionData[key]) {
        const parsed = new Date(notionData[key]);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return null;
    };

    const status = contact.status;

    if (status === "sent" && !contact.firstEmailDate) {
      const date = extractDate("First Email Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
      updates.firstEmailDate = date;
      details.push(`[AUTOMATION REPAIR] ${contact.email}: status="sent", set firstEmailDate=${date.toISOString().split("T")[0]} (source: ${extractDate("First Email Date") ? "notionData" : "createdAt"})`);
    }

    if (status === "followup-1") {
      if (!contact.firstEmailDate) {
        const date = extractDate("First Email Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
        updates.firstEmailDate = date;
        details.push(`[AUTOMATION REPAIR] ${contact.email}: status="followup-1", set firstEmailDate=${date.toISOString().split("T")[0]} (source: ${extractDate("First Email Date") ? "notionData" : "createdAt"})`);
      }
      if (!contact.followup1Date) {
        const date = extractDate("Follow-up 1 Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
        updates.followup1Date = date;
        details.push(`[AUTOMATION REPAIR] ${contact.email}: status="followup-1", set followup1Date=${date.toISOString().split("T")[0]} (source: ${extractDate("Follow-up 1 Date") ? "notionData" : "createdAt"})`);
      }
    }

    if (status === "followup-2") {
      if (!contact.firstEmailDate) {
        const date = extractDate("First Email Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
        updates.firstEmailDate = date;
        details.push(`[AUTOMATION REPAIR] ${contact.email}: status="followup-2", set firstEmailDate=${date.toISOString().split("T")[0]} (source: ${extractDate("First Email Date") ? "notionData" : "createdAt"})`);
      }
      if (!contact.followup1Date) {
        const date = extractDate("Follow-up 1 Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
        updates.followup1Date = date;
        details.push(`[AUTOMATION REPAIR] ${contact.email}: status="followup-2", set followup1Date=${date.toISOString().split("T")[0]} (source: ${extractDate("Follow-up 1 Date") ? "notionData" : "createdAt"})`);
      }
      if (!contact.followup2Date) {
        const date = extractDate("Follow-up 2 Date") || (contact.createdAt ? new Date(contact.createdAt) : new Date());
        updates.followup2Date = date;
        details.push(`[AUTOMATION REPAIR] ${contact.email}: status="followup-2", set followup2Date=${date.toISOString().split("T")[0]} (source: ${extractDate("Follow-up 2 Date") ? "notionData" : "createdAt"})`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await storage.updateContact(contact.id, userId, updates as any);
      repaired++;
      console.log(`[AUTOMATION REPAIR] Repaired ${contact.email}: ${JSON.stringify(updates)}`);
    }
  }

  console.log(`[AUTOMATION REPAIR] Complete. Repaired ${repaired} contacts for user ${userId}.`);
  return { repaired, details };
}

function daysSince(dateVal: Date | string | null | undefined): number {
  if (!dateVal) return -1;
  // Append "Z" if no timezone marker — same fix as Notion sync.
  // DB columns are timestamp without time zone: returned strings have no Z.
  // new Date("2026-02-15T00:30:00") is treated as local IST, not UTC.
  const raw = dateVal instanceof Date ? dateVal.toISOString() : String(dateVal);
  const utcStr = /[Zz]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + "Z";
  const last = new Date(utcStr).getTime();
  const now = Date.now();
  if (isNaN(last)) return -1;
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

async function runReplyCheck() {
  if (replyCheckRunning) return;
  replyCheckRunning = true;
  try {
    const activeUsers = await storage.getUsersWithActiveAutomation();
    for (const userId of activeUsers) {
      try {
        const gmailIntegration = await storage.getIntegration(userId, "gmail");
        if (!gmailIntegration?.connected) continue;

        const replies = await checkForReplies(userId);
        const contacts = await storage.getContacts(userId);

        for (const reply of replies) {
          const contact = contacts.find((c) => c.email.toLowerCase() === reply.contactEmail);
          if (!contact || contact.status === "replied") continue;

          // Verify reply is in a known thread
          const emailSends = await storage.getEmailSendsForContact(userId, contact.id);
          const matchingThread = emailSends.find((es) => es.gmailThreadId === reply.threadId);

          if (matchingThread) {
            console.log(`[AUTOMATION] Reply detected from ${contact.email} — transitioning to "replied"`);
            await storage.updateContact(contact.id, userId, { status: "replied" } as any);
            await storage.createActivityLog(userId, {
              contactName: contact.name,
              action: "Reply received",
              status: "replied",
            });

            const today = new Date().toISOString().split("T")[0];
            const usage = await storage.getDailyUsage(userId, today);
            await storage.upsertDailyUsage(userId, today, {
              repliesReceived: (usage?.repliesReceived ?? 0) + 1,
            });

            // Sync replied status to Notion (no dates to update for replies)
            await tryNotionSync(userId, contact.id, "replied", {});
          }
        }
      } catch (e: any) {
        console.error(`[Automation] Reply check error for user ${userId}:`, e.message);
      }
    }
  } finally {
    replyCheckRunning = false;
  }
}

async function tryNotionSync(
  userId: string,
  contactId: string,
  status: string,
  dates: {
    firstEmailDate?: Date | null;
    followup1Date?: Date | null;
    followup2Date?: Date | null;
  }
) {
  console.log(`[NOTION SYNC START] contactId=${contactId} status="${status}" dates:`, {
    firstEmailDate: dates.firstEmailDate ?? null,
    followup1Date: dates.followup1Date ?? null,
    followup2Date: dates.followup2Date ?? null,
  });
  try {
    await syncContactStatusToNotion(userId, contactId, status, dates);
    console.log(`[NOTION SYNC SUCCESS] contactId=${contactId} status="${status}"`);
  } catch (e: any) {
    // Log full error context so we can diagnose property name mismatches, auth failures, etc.
    console.error(`[NOTION SYNC FAILED] contactId=${contactId} status="${status}":`, {
      message: e.message,
      code: e.code,
      status: e.status,
      body: e.body,
    });
  }
}

export function isAutomationRunning(): boolean {
  // sendCycleRunning is true ONLY when a send cycle is actively mid-execution.
  // automationTask !== null just means the cron scheduler is registered (always true
  // after server start), so it is NOT a valid indicator of active processing.
  return sendCycleRunning;
}
