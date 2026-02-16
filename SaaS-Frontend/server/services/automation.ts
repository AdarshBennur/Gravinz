import cron from "node-cron";
import { storage } from "../storage";
import { generateEmail } from "./email-generator";
import { sendEmail, checkForReplies, isGmailConfigured } from "./gmail";
import { syncContactStatusToNotion } from "./notion";
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

  automationTask = cron.schedule("*/5 * * * *", async () => {
    console.log("[Automation] Running send cycle...");
    await runAutomationCycle();
  });

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

async function processUserAutomation(userId: string) {
  const settings = await storage.getCampaignSettings(userId);
  if (!settings || settings.automationStatus !== "running") return;

  if (!isAfterStartTime(settings)) {
    console.log(`[Automation] User ${userId}: Before start time (${settings.startTime || "09:00"}), skipping`);
    return;
  }

  const gmailIntegration = await storage.getIntegration(userId, "gmail");
  if (!gmailIntegration?.connected) {
    console.log(`[Automation] User ${userId}: Gmail not connected, skipping`);
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const usage = await storage.getDailyUsage(userId, today);
  const sentToday = usage?.emailsSent ?? 0;
  const dailyLimit = settings.dailyLimit ?? 80;

  if (sentToday >= dailyLimit) {
    console.log(`[Automation] User ${userId}: Daily limit reached (${sentToday}/${dailyLimit})`);
    return;
  }

  const remainingQuota = dailyLimit - sentToday;
  const contacts = await storage.getContacts(userId);

  // Sort contacts by lastSentAt to prioritize those waiting longest (fair queueing)
  // Logic: 
  // 1. "not-sent" contacts (new)
  // 2. "first_email_sent" (waiting for followup 1)
  // 3. "followup_1_sent" (waiting for followup 2)
  // We process them in a simple loop until quota fills.

  let processedCount = 0;
  const maxFollowups = settings.followupCount ?? 2;
  const delays = (settings.followupDelays as number[]) || [2, 4];

  for (const contact of contacts) {
    if (processedCount >= remainingQuota) break;

    // Skip terminal states
    if (["replied", "bounced", "stopped", "manual_break"].includes(contact.status || "")) continue;

    let shouldSend = false;
    let isFollowup = false;
    let nextFollowupNumber = 0;

    switch (contact.status) {
      case "not-sent":
        shouldSend = true;
        isFollowup = false;
        nextFollowupNumber = 0;
        break;

      case "first_email_sent": // Waiting for Follow-up 1
        if (maxFollowups >= 1) {
          const daysSince = daysSinceLastSent(contact.lastSentAt);
          const requiredDelay = delays[0] ?? 2;
          if (daysSince >= requiredDelay) {
            shouldSend = true;
            isFollowup = true;
            nextFollowupNumber = 1;
          }
        }
        break;

      case "followup_1_sent": // Waiting for Follow-up 2
        if (maxFollowups >= 2) {
          const daysSince = daysSinceLastSent(contact.lastSentAt);
          const requiredDelay = delays[1] ?? 4;
          if (daysSince >= requiredDelay) {
            shouldSend = true;
            isFollowup = true;
            nextFollowupNumber = 2;
          }
        }
        break;

      // Add more cases here if we support > 2 followups dynamically
    }

    if (!shouldSend) continue;

    // --- ACTION: SEND EMAIL ---
    try {
      console.log(`[Automation] Processing ${contact.email} (${isFollowup ? `Follow-up ${nextFollowupNumber}` : "First Email"})`);

      const emailContent = await generateEmail({
        userId,
        contactId: contact.id,
        contactName: contact.name,
        contactCompany: contact.company || undefined,
        contactRole: contact.role || undefined,
        isFollowup,
        followupNumber: nextFollowupNumber,
      });

      // Get Thread ID for threading if followup
      let previousThreadId = undefined;
      let previousMessageId = undefined;

      if (isFollowup) {
        const history = await storage.getEmailSendsForContact(userId, contact.id);
        const lastSend = history[history.length - 1];
        if (lastSend) {
          previousThreadId = lastSend.gmailThreadId || undefined;
          previousMessageId = lastSend.gmailMessageId || undefined;
        }
      }

      // REAL SEND via Gmail API
      const result = await sendEmail(
        userId,
        contact.email,
        emailContent.subject,
        emailContent.body,
        previousThreadId,
        previousMessageId
      );

      // --- ON SUCCESS ONLY ---
      const newStatus = isFollowup ? `followup_${nextFollowupNumber}_sent` : "first_email_sent";

      await storage.createEmailSend(userId, contact.id, {
        subject: emailContent.subject,
        body: emailContent.body,
        status: "sent",
        followupNumber: nextFollowupNumber,
        sentAt: new Date(),
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
      } as any);

      await storage.updateContact(contact.id, userId, {
        status: newStatus,
        lastSentAt: new Date(),
        followupsSent: nextFollowupNumber,
      } as any);

      await storage.createActivityLog(userId, {
        contactName: contact.name,
        action: isFollowup ? `Follow-up ${nextFollowupNumber} sent` : "First email sent",
        status: "success",
      });

      await tryNotionSync(userId, contact.id, newStatus);

      processedCount++;

      // Random delay to mimic human behavior
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));

    } catch (error: any) {
      console.error(`[Automation] Failed to send to ${contact.email}:`, error.message);

      await storage.createEmailSend(userId, contact.id, {
        status: "failed",
        errorMessage: error.message,
        followupNumber: nextFollowupNumber,
        subject: "Failed Generation",
        body: "Failed Generation"
      } as any);

      if (error.message?.includes("bounced") || error.message?.includes("not found")) {
        await storage.updateContact(contact.id, userId, { status: "bounced" } as any);
        await tryNotionSync(userId, contact.id, "bounced");
      }
    }
  }

  // Update daily stats
  if (processedCount > 0) {
    const freshStart = await storage.getDailyUsage(userId, today);
    await storage.upsertDailyUsage(userId, today, {
      emailsSent: (freshStart?.emailsSent ?? 0) + processedCount,
    });
    console.log(`[Automation] User ${userId}: Processed ${processedCount} emails`);
  }
}

function daysSinceLastSent(dateVal: Date | string | null): number {
  if (!dateVal) return 999;
  const last = new Date(dateVal).getTime();
  const now = Date.now();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}


async function runReplyCheck() {
  if (replyCheckRunning) {
    console.log("[Automation] Reply check already running, skipping");
    return;
  }
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
          const contact = contacts.find(
            (c) => c.email.toLowerCase() === reply.contactEmail
          );

          if (!contact) continue;
          if (contact.status === "replied") continue;

          const emailSends = await storage.getEmailSendsForContact(userId, contact.id);
          const matchingThread = emailSends.find(
            (es) => es.gmailThreadId === reply.threadId
          );

          if (!matchingThread) continue;

          await storage.updateContact(contact.id, userId, {
            status: "replied",
          } as any);

          await storage.createActivityLog(userId, {
            contactName: contact.name,
            action: "Reply received - follow-ups stopped",
            status: "replied",
          });

          const today = new Date().toISOString().split("T")[0];
          const usage = await storage.getDailyUsage(userId, today);
          await storage.upsertDailyUsage(userId, today, {
            repliesReceived: (usage?.repliesReceived ?? 0) + 1,
          });

          await tryNotionSync(userId, contact.id, "replied");

          console.log(`[Automation] Reply detected from ${contact.email}`);
        }
      } catch (err: any) {
        console.error(`[Automation] Reply check error for user ${userId}:`, err.message);
      }
    }
  } finally {
    replyCheckRunning = false;
  }
}

async function tryNotionSync(userId: string, contactId: string, status: string) {
  try {
    await syncContactStatusToNotion(userId, contactId, status);
  } catch (e) {
  }
}

export function isAutomationRunning(): boolean {
  return automationTask !== null;
}
