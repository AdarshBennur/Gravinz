import cron from "node-cron";
import { storage } from "../storage";
import { generateEmail } from "./email-generator";
import { sendEmail, checkForReplies, isGmailConfigured } from "./gmail";
import { syncContactStatusToNotion } from "./notion";
import { eq, and, desc } from "drizzle-orm";

let automationTask: cron.ScheduledTask | null = null;
let replyCheckTask: cron.ScheduledTask | null = null;
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

  const remaining = dailyLimit - sentToday;
  const contacts = await storage.getContacts(userId);

  const followupContacts = contacts.filter((c) => {
    if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return false;
    if (c.status === "replied" || c.status === "bounced" || c.status === "paused") return false;
    if (c.status === "not-sent") return false;

    const maxFollowups = settings.followupCount ?? 2;
    if ((c.followupsSent ?? 0) >= maxFollowups) return false;

    if (c.lastSentAt) {
      const delays = (settings.followupDelays as number[]) || [2, 4];
      const currentFollowup = c.followupsSent ?? 0;
      const delayDays = delays[currentFollowup] ?? delays[delays.length - 1] ?? 3;
      const daysSinceLastSent = Math.floor((Date.now() - new Date(c.lastSentAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastSent < delayDays) return false;
    }

    return true;
  });

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const freshContacts = contacts.filter((c) => c.status === "not-sent" && c.email && isValidEmail(c.email));

  let toProcess: Array<{ contact: typeof contacts[0]; type: "followup" | "fresh" }> = [];

  const priority = settings.priorityMode || "balanced";

  if (priority === "followups") {
    toProcess = [
      ...followupContacts.map((c) => ({ contact: c, type: "followup" as const })),
      ...freshContacts.map((c) => ({ contact: c, type: "fresh" as const })),
    ];
  } else if (priority === "fresh") {
    toProcess = [
      ...freshContacts.map((c) => ({ contact: c, type: "fresh" as const })),
      ...followupContacts.map((c) => ({ contact: c, type: "followup" as const })),
    ];
  } else {
    const ratio = (settings.balancedRatio ?? 60) / 100;
    const followupSlots = Math.floor(remaining * ratio);
    const freshSlots = remaining - followupSlots;

    toProcess = [
      ...followupContacts.slice(0, followupSlots).map((c) => ({ contact: c, type: "followup" as const })),
      ...freshContacts.slice(0, freshSlots).map((c) => ({ contact: c, type: "fresh" as const })),
    ];
  }

  toProcess = toProcess.slice(0, remaining);

  let sentCount = 0;
  let followupCount = 0;

  for (const { contact, type } of toProcess) {
    try {
      const isFollowup = type === "followup";
      const followupNumber = isFollowup ? (contact.followupsSent ?? 0) + 1 : 0;

      const emailContent = await generateEmail({
        userId,
        contactId: contact.id,
        contactName: contact.name,
        contactCompany: contact.company || undefined,
        contactRole: contact.role || undefined,
        isFollowup,
        followupNumber,
      });

      let previousSend = null;
      if (isFollowup) {
        const previousSends = await storage.getEmailSendsForContact(userId, contact.id);
        previousSend = previousSends[previousSends.length - 1] || null;
      }

      let gmailResult: { messageId: string; threadId: string };

      try {
        gmailResult = await sendEmail(
          userId,
          contact.email,
          emailContent.subject,
          emailContent.body,
          previousSend?.gmailThreadId || undefined,
          previousSend?.gmailMessageId || undefined
        );
      } catch (sendErr: any) {
        console.error(`[Automation] Send failed for ${contact.email}:`, sendErr.message);

        await storage.createEmailSend(userId, contact.id, {
          subject: emailContent.subject,
          body: emailContent.body,
          status: "failed",
          followupNumber,
          errorMessage: sendErr.message,
        } as any);

        if (sendErr.message?.includes("bounced") || sendErr.message?.includes("invalid")) {
          await storage.updateContact(contact.id, userId, { status: "bounced" } as any);
          await tryNotionSync(userId, contact.id, "bounced");
        }

        continue;
      }

      const emailSend = await storage.createEmailSend(userId, contact.id, {
        subject: emailContent.subject,
        body: emailContent.body,
        status: "sent",
        followupNumber,
        sentAt: new Date(),
        gmailMessageId: gmailResult.messageId,
        gmailThreadId: gmailResult.threadId,
      } as any);

      let newStatus: string;
      if (isFollowup) {
        newStatus = followupNumber <= 2 ? `followup-${followupNumber}` : "followup";
        followupCount++;
      } else {
        newStatus = "sent";
        sentCount++;
      }

      await storage.updateContact(contact.id, userId, {
        status: newStatus,
        lastSentAt: new Date(),
        followupsSent: followupNumber,
      } as any);

      await storage.createActivityLog(userId, {
        contactName: contact.name,
        action: isFollowup ? `Follow-up ${followupNumber} sent` : "First email sent",
        status: newStatus,
      });

      await tryNotionSync(userId, contact.id, newStatus);

      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
    } catch (err: any) {
      console.error(`[Automation] Error processing contact ${contact.id}:`, err.message);
    }
  }

  if (sentCount > 0 || followupCount > 0) {
    const currentUsage = await storage.getDailyUsage(userId, today);
    await storage.upsertDailyUsage(userId, today, {
      emailsSent: (currentUsage?.emailsSent ?? 0) + sentCount + followupCount,
      followupsSent: (currentUsage?.followupsSent ?? 0) + followupCount,
    });

    console.log(`[Automation] User ${userId}: Sent ${sentCount} fresh + ${followupCount} follow-ups`);
  }
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
