import { google } from "googleapis";
import { storage } from "../storage.ts";
import { encryptToken, decryptToken } from "./encryption";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const port = process.env.PORT || "5000";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${port}`}/api/integrations/gmail/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGmailAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: userId,
    prompt: "consent",
  });
}

export async function handleGmailCallback(code: string, userId: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Encrypt tokens before storage
  const encryptedAccessToken = tokens.access_token ? encryptToken(tokens.access_token) : null;
  const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

  await storage.upsertIntegration(userId, "gmail", {
    connected: true,
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    metadata: {
      email: null,
      scope: tokens.scope,
    },
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  oauth2Client.setCredentials(tokens);
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    await storage.upsertIntegration(userId, "gmail", {
      metadata: {
        email: profile.data.emailAddress,
        scope: tokens.scope,
      },
    });
  } catch (e) {
    console.error("Failed to fetch Gmail profile:", e);
  }
}

async function getAuthenticatedClient(userId: string) {
  const integration = await storage.getIntegration(userId, "gmail");
  if (!integration || !integration.connected || !integration.accessToken) {
    throw new Error("Gmail not connected");
  }

  // Decrypt tokens from storage
  const accessToken = decryptToken(integration.accessToken);
  const refreshToken = integration.refreshToken ? decryptToken(integration.refreshToken) : null;

  // Ensure tokenExpiresAt is a Date object
  let expiryDate = integration.tokenExpiresAt;
  if (expiryDate && typeof expiryDate === 'string') {
    expiryDate = new Date(expiryDate);
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate?.getTime(),
  });

  if (expiryDate && new Date() >= expiryDate) {
    console.log(`[Gmail Debug] Token expired at ${expiryDate.toISOString()}, refreshing...`);
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Encrypt new tokens before storage
      const newAccessToken = credentials.access_token ? encryptToken(credentials.access_token) : integration.accessToken;
      const newRefreshToken = credentials.refresh_token ? encryptToken(credentials.refresh_token) : integration.refreshToken;

      await storage.upsertIntegration(userId, "gmail", {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : expiryDate,
      });
      oauth2Client.setCredentials(credentials);
      console.log(`[Gmail Debug] Token refreshed successfully.`);
    } catch (err) {
      console.error("Token refresh failed:", err);
      throw new Error("Gmail token expired and refresh failed. Please reconnect Gmail.");
    }
  }

  return oauth2Client;
}

interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

function createRawEmail(to: string, from: string, subject: string, body: string, threadId?: string, messageId?: string, attachments: Attachment[] = []): string {
  const boundary = "foo_bar_baz_" + Date.now().toString(16);

  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  if (messageId) {
    headers.push(`In-Reply-To: ${messageId}`);
    headers.push(`References: ${messageId}`);
  }

  let email = headers.join("\r\n") + "\r\n\r\n";

  // Body Part
  email += `--${boundary}\r\n`;
  email += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
  email += body + "\r\n\r\n";

  // Attachments
  for (const attachment of attachments) {
    email += `--${boundary}\r\n`;
    email += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n`;
    email += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n\r\n`;
    email += attachment.content.toString("base64") + "\r\n\r\n";
  }

  email += `--${boundary}--`;

  return Buffer.from(email).toString("base64url");
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  inReplyToMessageId?: string,
  attachments: Attachment[] = []
): Promise<{ messageId: string; threadId: string }> {
  if (process.env.MOCK_GMAIL === "true") {
    console.log(`[Gmail Mock] Sending email to ${to} (Subject: ${subject})`);
    return {
      messageId: "mock_msg_" + Date.now(),
      threadId: threadId || "mock_thread_" + Date.now(),
    };
  }
  console.log(`[Gmail Debug] Preparing to send email to: ${to}, Subject: ${subject}`);

  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    console.log(`[Gmail Debug] OAuth2 Client obtained. ClientId: ${oauth2Client._clientId}`);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const integration = await storage.getIntegration(userId, "gmail");
    const fromEmail = (integration?.metadata as any)?.email || "me";

    // Build display-name From header using user's full name from profile.
    // Falls back to plain email if fullName is not set.
    const user = await storage.getUser(userId);
    const displayName = user?.fullName?.trim();
    const fromHeader = displayName
      ? `"${displayName}" <${fromEmail}>`
      : fromEmail;
    console.log(`[Gmail Debug] Sending as: ${fromHeader}`);

    const raw = createRawEmail(to, fromHeader, subject, body, threadId, inReplyToMessageId, attachments);
    console.log(`[Gmail Debug] Raw email constructed. Length: ${raw.length} chars`);

    const sendParams: any = {
      userId: "me",
      requestBody: { raw },
    };

    if (threadId) {
      sendParams.requestBody.threadId = threadId;
      console.log(`[Gmail Debug] Threading enabled. Thread ID: ${threadId}`);
    }

    console.log(`[Gmail Debug] Sending payload to Gmail API...`);
    const result = await gmail.users.messages.send(sendParams);

    console.log(`[Gmail Debug] Gmail API Response Status: ${result.status}`);
    console.log(`[Gmail Debug] Sent Message ID: ${result.data.id}, Thread ID: ${result.data.threadId}`);

    return {
      messageId: result.data.id || "",
      threadId: result.data.threadId || "",
    };
  } catch (error: any) {
    console.error("[Gmail Debug] CRITICAL SEND FAILURE:", error);
    if (error.response) {
      console.error("[Gmail Debug] API Error Response:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THREAD-SPECIFIC REPLY DETECTION
// Queries only the Gmail threads we actually sent campaign emails in.
// Never scans the global inbox — eliminates all false positives from
// unrelated emails the contact may have sent independently.
//
// For each campaign thread:
//   1. Fetch the full thread via threads.get (not inbox scan)
//   2. Find any message NOT from the user's own address
//   3. Confirm the message arrived AFTER our send time
//   4. If found → genuine reply. Otherwise → no reply.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkForReplies(
  userId: string,
  campaignThreads: Array<{
    contactId: string;
    contactEmail: string;
    threadId: string;
    sentAt: Date; // timestamp of OUR first outbound message in this thread
  }>
): Promise<Array<{
  contactId: string;
  contactEmail: string;
  threadId: string;
  repliedAt: Date;
}>> {
  if (process.env.MOCK_GMAIL === "true") {
    console.log("[Gmail Mock] Checking for replies... (mocking no replies)");
    return [];
  }

  if (campaignThreads.length === 0) return [];

  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Determine our own Gmail address so we can exclude our outbound messages
  const integration = await storage.getIntegration(userId, "gmail");
  const ownEmail = ((integration?.metadata as any)?.email || "").toLowerCase();

  const replies: Array<{
    contactId: string;
    contactEmail: string;
    threadId: string;
    repliedAt: Date;
  }> = [];

  for (const thread of campaignThreads) {
    try {
      console.log(`[Reply Check] Fetching thread ${thread.threadId} for contact ${thread.contactEmail}`);

      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: thread.threadId,
        format: "metadata",
        metadataHeaders: ["From", "Date"],
      });

      const messages = threadData.data.messages || [];
      let foundReply = false;

      for (const msg of messages) {
        const headers = msg.payload?.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "";
        const emailMatch = from.match(/<(.+?)>/) || [null, from];
        const senderEmail = (emailMatch[1] || from).toLowerCase().trim();

        // Skip our own outbound messages
        if (senderEmail === ownEmail) continue;

        // Parse timestamp — internalDate is ms since epoch
        const internalDate = parseInt(msg.internalDate || "0", 10);
        const msgDate = new Date(internalDate);

        // Only count as reply if it arrived AFTER we sent the campaign email
        if (msgDate <= thread.sentAt) {
          console.log(`[Reply Check] Skipping pre-campaign message in thread ${thread.threadId} from ${senderEmail} (${msgDate.toISOString()} <= sent ${thread.sentAt.toISOString()})`);
          continue;
        }

        console.log(`[Reply Check] ✅ Thread-specific reply from ${senderEmail} in thread ${thread.threadId} at ${msgDate.toISOString()}`);
        replies.push({
          contactId: thread.contactId,
          contactEmail: thread.contactEmail,
          threadId: thread.threadId,
          repliedAt: msgDate,
        });
        foundReply = true;
        break; // one confirmed reply per thread is enough
      }

      if (!foundReply) {
        console.log(`[Reply Check] No reply yet in thread ${thread.threadId} for ${thread.contactEmail}`);
      }
    } catch (e: any) {
      console.error(`[Reply Check] Failed to fetch thread ${thread.threadId} for ${thread.contactEmail}:`, e.message);
    }
  }

  return replies;
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
