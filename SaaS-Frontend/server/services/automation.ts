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

async function runAutomationCycle() {
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

  const now = new Date();
  const nowDateStr = now.toISOString().split("T")[0];

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
      console.log(`[AUTOMATION] Transition:\n  not-sent -> sent\n  Setting firstEmailDate=${nowDateStr}`);
    }
    // Explicit safety: do NOT include followup1Date or followup2Date in this update

  } else if (type === "followup1") {
    // STATE 2 → 3: Set followup1Date only. firstEmailDate and followup2Date untouched.
    if (fresh.followup1Date) {
      console.log(`[AUTOMATION] followup1Date already set (${fresh.followup1Date}) — preserving original`);
    } else {
      dateUpdates.followup1Date = now;
      console.log(`[AUTOMATION] Transition:\n  sent -> followup-1\n  Setting followup1Date=${nowDateStr}`);
    }
    // Explicit safety: do NOT include firstEmailDate or followup2Date in this update

  } else if (type === "followup2") {
    // STATE 3 → 4: Set followup2Date only. firstEmailDate and followup1Date untouched.
    if (fresh.followup2Date) {
      console.log(`[AUTOMATION] followup2Date already set (${fresh.followup2Date}) — preserving original`);
    } else {
      dateUpdates.followup2Date = now;
      console.log(`[AUTOMATION] Transition:\n  followup-1 -> followup-2\n  Setting followup2Date=${nowDateStr}`);
    }
    // Explicit safety: do NOT include firstEmailDate or followup1Date in this update
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

  const today = new Date().toISOString().split("T")[0];
  const usage = await storage.getDailyUsage(userId, today);
  const sentToday = usage?.emailsSent ?? 0;
  const dailyLimit = settings.dailyLimit ?? 80;

  if (sentToday >= dailyLimit) {
    console.log(`[Automation Debug] User ${userId}: Daily limit reached (${sentToday}/${dailyLimit}).`);
    return;
  }

  const remainingQuota = dailyLimit - sentToday;
  const contacts = await storage.getContacts(userId);

  let processedCount = 0;
  const maxFollowups = settings.followupCount ?? 2;

  // ─── SAFE JSONB PARSING ──────────────────────────────────────────────────
  // followupDelays is stored as JSONB. Drizzle may return it as:
  //   - number[] (correct)
  //   - string (if serialized incorrectly, e.g. "[2,4]")
  //   - null/undefined
  // We MUST defensively parse it.
  let delays: number[] = [2, 4]; // fallback default
  const rawDelays = settings.followupDelays;
  if (Array.isArray(rawDelays)) {
    delays = rawDelays;
  } else if (typeof rawDelays === "string") {
    try {
      const parsed = JSON.parse(rawDelays);
      if (Array.isArray(parsed)) {
        delays = parsed;
      }
    } catch {
      console.error(`[AUTOMATION DEBUG] Failed to parse followupDelays string: "${rawDelays}". Using default [2, 4].`);
    }
  } else if (rawDelays != null) {
    console.error(`[AUTOMATION DEBUG] Unexpected followupDelays type: ${typeof rawDelays}. Using default [2, 4].`);
  }

  console.log(`[AUTOMATION DEBUG] Campaign settings for user ${userId}:`);
  console.log(`  maxFollowups=${maxFollowups}`);
  console.log(`  followupDelays=${JSON.stringify(delays)}`);
  console.log(`  dailyLimit=${dailyLimit}, sentToday=${sentToday}, remainingQuota=${remainingQuota}`);
  console.log(`  Total contacts=${contacts.length}`);

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
    if (["replied", "bounced", "stopped", "manual_break", "failed", "rejected"].includes(contact.status || "")) continue;

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

    try {
      // 1. Generate email content
      const userProfile = await storage.getUserProfile(userId);
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
      const result = await sendEmail(
        userId,
        contact.email,
        emailContent.subject,
        emailContent.body,
        previousThreadId,
        previousMessageId,
        attachments
      );
      console.log(`[AUTOMATION] Gmail send success for ${contact.email} (messageId: ${result.messageId})`);

      // ── COMMIT SUCCESS ────────────────────────────────────────────────────
      // ONLY after confirmed Gmail success do we transition state.
      await updateContactAfterSend(contact, targetAction.type, userId);

      // Log the email send record
      await storage.createEmailSend(userId, contact.id, {
        subject: emailContent.subject,
        body: emailContent.body,
        status: "sent",
        followupNumber: targetAction.number,
        sentAt: new Date(),
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
      });

      await storage.createActivityLog(userId, {
        contactName: contact.name,
        action: targetAction.isFollowup ? `Follow-up ${targetAction.number} sent` : "First email sent",
        status: "success",
      });

      processedCount++;
      console.log(`[AUTOMATION] Successfully processed ${sendType} for ${contact.email}. Total this cycle: ${processedCount}`);

      // Strict 60s delay between sends (anti-spam)
      await new Promise((resolve) => setTimeout(resolve, 60000));

    } catch (error: any) {
      // ── ROLLBACK / FAILURE ────────────────────────────────────────────────
      console.error(`[ERROR] Failed to send ${sendType} for ${contact.email}`);
      console.error(`[ERROR] DB before: { status: "${contact.status}", firstEmailDate: ${contact.firstEmailDate}, followup1Date: ${contact.followup1Date}, followup2Date: ${contact.followup2Date} }`);
      console.error(`[ERROR] Error: ${error.message}`);
      console.error(error);

      await storage.updateContact(contact.id, userId, { status: "failed" } as any);

      await storage.createEmailSend(userId, contact.id, {
        status: "failed",
        errorMessage: error.message,
        followupNumber: targetAction.number,
        subject: "Failed Generation",
        body: "Failed",
      });
    }
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
  const last = new Date(dateVal).getTime();
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
  try {
    await syncContactStatusToNotion(userId, contactId, status, dates);
    console.log(`[AUTOMATION] Notion sync complete for contactId=${contactId}`);
  } catch (e: any) {
    // Log error but never let Notion failure block the DB commit
    console.error(`[Notion Sync Error] contactId=${contactId} status=${status}:`, e.message);
  }
}

export function isAutomationRunning(): boolean {
  // sendCycleRunning is true ONLY when a send cycle is actively mid-execution.
  // automationTask !== null just means the cron scheduler is registered (always true
  // after server start), so it is NOT a valid indicator of active processing.
  return sendCycleRunning;
}
