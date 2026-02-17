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

export async function processUserAutomation(userId: string) {
  console.log(`[Automation Debug] Starting processUserAutomation for user: ${userId}`);
  const settings = await storage.getCampaignSettings(userId);
  if (!settings || settings.automationStatus !== "running") {
    // console.log(`[Automation Debug] User ${userId}: Automation not running.`);
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

  // Sort by priority or random to avoid stuck queues, but for now simple iteration is fine
  // logic: find candidates first

  let processedCount = 0;
  const maxFollowups = settings.followupCount ?? 2;
  const delays = (settings.followupDelays as number[]) || [2, 4];

  for (const contact of contacts) {
    if (processedCount >= remainingQuota) break;

    // Terminal states - skipped implicitly by switch default or explicit check
    if (["replied", "bounced", "stopped", "manual_break"].includes(contact.status || "")) continue;

    let targetAction: { isFollowup: boolean; number: number; lockStatus: string; finalStatus: string; delayDays?: number; requiredDate?: Date | string | null } | null = null;

    // --- STATE MACHINE ---
    switch (contact.status) {
      case "not-sent":
        targetAction = {
          isFollowup: false,
          number: 0,
          lockStatus: "sending_first",
          finalStatus: "sent",
          requiredDate: null // active immediately
        };
        break;

      case "sent": // Eligible for Follow-up 1
        if (maxFollowups >= 1) {
          targetAction = {
            isFollowup: true,
            number: 1,
            lockStatus: "sending_f1",
            finalStatus: "followup-1",
            delayDays: delays[0] ?? 2,
            requiredDate: contact.firstEmailDate || contact.lastSentAt // Fallback strictly to documented fields
          };
        }
        break;

      case "followup-1": // Eligible for Follow-up 2
        if (maxFollowups >= 2) {
          targetAction = {
            isFollowup: true,
            number: 2,
            lockStatus: "sending_f2",
            finalStatus: "followup-2",
            delayDays: delays[1] ?? 4,
            requiredDate: contact.followup1Date || contact.lastSentAt
          };
        }
        break;
    }

    if (!targetAction) continue;

    // --- DATE CHECK ---
    if (targetAction.isFollowup) {
      if (!targetAction.requiredDate) {
        // SAFETY: If we are in 'sent' but have no date, DO NOT send immediately.
        // This prevents the "immediate followup" bug. 
        // We log a warning and skip. User must fix data manually or we need a specific policy.
        console.warn(`[Automation Warning] Contact ${contact.email} is in status ${contact.status} but has no timestamp. Skipping safety check.`);
        continue;
      }

      const daysPassed = daysSince(targetAction.requiredDate);
      if (daysPassed < (targetAction.delayDays || 999)) {
        // Not time yet
        continue;
      }
    }

    // --- CONCURRENCY LOCK ---
    const locked = await storage.acquireAutomationLock(contact.id, userId, contact.status!, targetAction.lockStatus);
    if (!locked) {
      console.log(`[Automation] Could not acquire lock for ${contact.email}, skipping.`);
      continue;
    }

    // --- EXECUTE SEND ---
    try {
      console.log(`[Automation] Processing ${contact.email} (${targetAction.isFollowup ? `Follow-up ${targetAction.number}` : "First Email"})`);

      // 1. Generate
      const userProfile = await storage.getUserProfile(userId);
      const emailContent = await generateEmail({
        userId,
        contactId: contact.id,
        contactName: contact.name,
        contactCompany: contact.company || undefined,
        contactRole: contact.role || undefined,
        isFollowup: targetAction.isFollowup,
        followupNumber: targetAction.number,
        resumeUrl: userProfile?.resumeUrl || undefined
      });

      // 2. Threading
      let previousThreadId = undefined;
      let previousMessageId = undefined;
      if (targetAction.isFollowup) {
        const history = await storage.getEmailSendsForContact(userId, contact.id);
        const lastSend = history[history.length - 1]; // Simplified: getting last send
        if (lastSend) {
          previousThreadId = lastSend.gmailThreadId || undefined;
          previousMessageId = lastSend.gmailMessageId || undefined;
        }
      }

      // 3. Attachments
      let attachments: { filename: string, content: Buffer, contentType: string }[] = [];
      if (userProfile?.resumeUrl) {
        try {
          const resumeRes = await fetch(userProfile.resumeUrl);
          if (resumeRes.ok) {
            const arrayBuffer = await resumeRes.arrayBuffer();
            attachments.push({
              filename: "Resume.pdf",
              content: Buffer.from(arrayBuffer),
              contentType: "application/pdf"
            });
          }
        } catch (e) { console.error("Resume fetch failed", e); }
      }

      // 4. Send via Gmail
      const result = await sendEmail(
        userId,
        contact.email,
        emailContent.subject,
        emailContent.body,
        previousThreadId,
        previousMessageId,
        attachments
      );

      // --- COMMIT SUCCESS ---
      // Update specific date column based on stage
      const dateUpdates: any = {
        lastSentAt: new Date(),
        status: targetAction.finalStatus,
        followupsSent: targetAction.number
      };

      if (!targetAction.isFollowup) {
        dateUpdates.firstEmailDate = new Date();
      } else if (targetAction.number === 1) {
        dateUpdates.followup1Date = new Date();
      } else if (targetAction.number === 2) {
        dateUpdates.followup2Date = new Date();
      }

      // Atomic update final state
      await storage.updateContact(contact.id, userId, dateUpdates);

      // Log send
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
      await tryNotionSync(userId, contact.id, targetAction.finalStatus);

      // Strict 60s delay per contact
      await new Promise((resolve) => setTimeout(resolve, 60000));

    } catch (error: any) {
      console.error(`[Automation] Failed to send to ${contact.email}:`, error.message);

      // Rollback status to original (or failed state)
      // If prompt generation failed, we might want to retry later, so reverting to original status is risky ('not-sent' again?)
      // Safe approach: 'failed' or 'manual_break' so user intervention is needed.
      // But for transient errors, reverting allows retry next cycle. 
      // Let's set to 'failed' to be safe and avoid infinite loops.
      await storage.updateContact(contact.id, userId, { status: "failed" } as any);

      await storage.createEmailSend(userId, contact.id, {
        status: "failed",
        errorMessage: error.message,
        followupNumber: targetAction.number,
        subject: "Failed Generation",
        body: "Failed"
      });
    }
  }

  if (processedCount > 0) {
    const freshStart = await storage.getDailyUsage(userId, today);
    await storage.upsertDailyUsage(userId, today, {
      emailsSent: (freshStart?.emailsSent ?? 0) + processedCount,
    });
    console.log(`[Automation] User ${userId}: Processed ${processedCount} emails`);
  }
}

function daysSince(dateVal: Date | string | null | undefined): number {
  if (!dateVal) return -1; // Negative implies never happened or valid date missing
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
      // ... (existing reply check logic kept mostly same, omitting for brevity of rewrite if unchanged, but I will include full function to be safe)
      try {
        const gmailIntegration = await storage.getIntegration(userId, "gmail");
        if (!gmailIntegration?.connected) continue;

        const replies = await checkForReplies(userId);
        const contacts = await storage.getContacts(userId);

        for (const reply of replies) {
          const contact = contacts.find(c => c.email.toLowerCase() === reply.contactEmail);
          if (!contact || contact.status === "replied") continue;

          // Check threading
          const emailSends = await storage.getEmailSendsForContact(userId, contact.id);
          const matchingThread = emailSends.find(es => es.gmailThreadId === reply.threadId);

          if (matchingThread) {
            console.log(`[Automation] Reply detected from ${contact.email}`);
            await storage.updateContact(contact.id, userId, { status: "replied" } as any);
            await storage.createActivityLog(userId, {
              contactName: contact.name,
              action: "Reply received",
              status: "replied"
            });
            // Update usage too...
            const today = new Date().toISOString().split("T")[0];
            const usage = await storage.getDailyUsage(userId, today);
            await storage.upsertDailyUsage(userId, today, {
              repliesReceived: (usage?.repliesReceived ?? 0) + 1
            });
            await tryNotionSync(userId, contact.id, "replied");
          }
        }
      } catch (e) {
        console.error(`[Automation Debug] Reply check error user ${userId}`, e);
      }
    }
  } finally {
    replyCheckRunning = false;
  }
}

async function tryNotionSync(userId: string, contactId: string, status: string) {
  try {
    await syncContactStatusToNotion(userId, contactId, status);
  } catch (e) { }
}

export function isAutomationRunning(): boolean {
  return automationTask !== null;
}
