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

  const now = new Date();
  const dateUpdates: Record<string, any> = {
    status: finalStatus,
    lastSentAt: now,
  };

  // IDEMPOTENCY GUARD 3: Only set date if not already populated (preserve original timestamp)
  if (type === "first") {
    if (!fresh.firstEmailDate) {
      dateUpdates.firstEmailDate = now;
      console.log(`[AUTOMATION] Setting firstEmailDate = ${now.toISOString()}`);
    } else {
      console.log(`[AUTOMATION] firstEmailDate already set (${fresh.firstEmailDate}) — preserving original`);
    }
  } else if (type === "followup1") {
    if (!fresh.followup1Date) {
      dateUpdates.followup1Date = now;
      console.log(`[AUTOMATION] Setting followup1Date = ${now.toISOString()}`);
    } else {
      console.log(`[AUTOMATION] followup1Date already set (${fresh.followup1Date}) — preserving original`);
    }
  } else if (type === "followup2") {
    if (!fresh.followup2Date) {
      dateUpdates.followup2Date = now;
      console.log(`[AUTOMATION] Setting followup2Date = ${now.toISOString()}`);
    } else {
      console.log(`[AUTOMATION] followup2Date already set (${fresh.followup2Date}) — preserving original`);
    }
  }

  // DB UPDATE — status + date in a single call (atomic at the storage layer)
  console.log(`[AUTOMATION] Updating DB status -> "${finalStatus}" for ${contact.email}`);
  await storage.updateContact(contact.id, userId, dateUpdates);
  console.log(`[AUTOMATION] DB update complete for ${contact.email}`);

  // NOTION SYNC — best-effort, logged on error (never blocks the DB commit)
  console.log(`[AUTOMATION] Updating Notion page -> "${finalStatus}" for ${contact.email}`);
  await tryNotionSync(userId, contact.id, finalStatus, {
    firstEmailDate: dateUpdates.firstEmailDate ?? fresh.firstEmailDate ?? null,
    followup1Date: dateUpdates.followup1Date ?? fresh.followup1Date ?? null,
    followup2Date: dateUpdates.followup2Date ?? fresh.followup2Date ?? null,
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
  const delays = (settings.followupDelays as number[]) || [2, 4];

  for (const contact of contacts) {
    if (processedCount >= remainingQuota) break;

    // Terminal states — skip permanently
    if (["replied", "bounced", "stopped", "manual_break", "failed"].includes(contact.status || "")) continue;

    let targetAction: {
      type: "first" | "followup1" | "followup2";
      isFollowup: boolean;
      number: number;
      lockStatus: string;
      delayDays?: number;
      requiredDate?: Date | string | null;
    } | null = null;

    // ─── STATE MACHINE ───────────────────────────────────────────────────────
    // Status strings are UNCHANGED from existing DB values.
    // not-sent → sent → followup-1 → followup-2 → replied (terminal)
    // ─────────────────────────────────────────────────────────────────────────
    switch (contact.status) {
      case "not-sent":
        targetAction = {
          type: "first",
          isFollowup: false,
          number: 0,
          lockStatus: "sending_first",
          requiredDate: null, // eligible immediately
        };
        break;

      case "sent": // Eligible for Follow-up 1
        if (maxFollowups >= 1) {
          targetAction = {
            type: "followup1",
            isFollowup: true,
            number: 1,
            lockStatus: "sending_f1",
            delayDays: delays[0] ?? 2,
            requiredDate: contact.firstEmailDate || contact.lastSentAt,
          };
        }
        break;

      case "followup-1": // Eligible for Follow-up 2
        if (maxFollowups >= 2) {
          targetAction = {
            type: "followup2",
            isFollowup: true,
            number: 2,
            lockStatus: "sending_f2",
            delayDays: delays[1] ?? 4,
            requiredDate: contact.followup1Date || contact.lastSentAt,
          };
        }
        break;
    }

    if (!targetAction) continue;

    // ─── DATE ELIGIBILITY CHECK ───────────────────────────────────────────────
    if (targetAction.isFollowup) {
      if (!targetAction.requiredDate) {
        // SAFETY: Contact is in follow-up eligible state but has no reference date.
        // DO NOT send — log warning and skip. Prevents immediate accidental follow-ups.
        console.warn(`[Automation Warning] Contact ${contact.email} is in status "${contact.status}" but has no reference date. Skipping.`);
        continue;
      }

      const daysPassed = daysSince(targetAction.requiredDate);
      if (daysPassed < (targetAction.delayDays || 999)) {
        // Not time yet — silent skip
        continue;
      }
    }

    // ─── CONCURRENCY LOCK ─────────────────────────────────────────────────────
    // Prevents double-send if two workers run simultaneously
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
              filename: "Resume.pdf",
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
      // updateContactAfterSend is idempotent — safe on retry.
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

      // Strict 60s delay between sends (anti-spam)
      await new Promise((resolve) => setTimeout(resolve, 60000));

    } catch (error: any) {
      // ── ROLLBACK / FAILURE ────────────────────────────────────────────────
      // Log full diagnostic context for transport-layer debugging
      console.error(`[ERROR] Failed to sync status after send for ${contact.email}`);
      console.error(`[ERROR] DB before: { status: "${contact.status}", firstEmailDate: ${contact.firstEmailDate}, followup1Date: ${contact.followup1Date}, followup2Date: ${contact.followup2Date} }`);
      console.error(`[ERROR] Error: ${error.message}`);
      console.error(error);

      // Mark as failed so the contact doesn't loop infinitely
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
  }
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
  return automationTask !== null;
}
