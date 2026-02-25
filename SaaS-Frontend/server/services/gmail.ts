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
  const outerBoundary = "outer_" + Date.now().toString(16);
  const altBoundary = "alt_" + Date.now().toString(16);

  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
  ];

  if (messageId) {
    headers.push(`In-Reply-To: ${messageId}`);
    headers.push(`References: ${messageId}`);
  }

  // ── Plain-text body (authoritative copy) ─────────────────────
  // Normalise the body: strip any residual HTML tags, then use raw \n\n.
  const plainBody = body
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // ── Minimal HTML body (no <p>, no margins) ───────────────────
  // Convert double-newlines → <br><br>, single-newlines → <br>.
  // Wrap in the simplest possible container to avoid default margins.
  const htmlBody =
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.5;margin:0;padding:0;">` +
    plainBody
      .split("\n\n")
      .map((para) => para.split("\n").join("<br>"))
      .join("<br><br>") +
    `</div>`;

  // ── Build MIME structure ──────────────────────────────────────
  let email = headers.join("\r\n") + "\r\n\r\n";

  // Outer: multipart/mixed (holds the message + any attachments)
  email += `--${outerBoundary}\r\n`;
  email += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

  // Alt part 1: text/plain
  email += `--${altBoundary}\r\n`;
  email += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
  email += plainBody + "\r\n\r\n";

  // Alt part 2: text/html (minimal, no <p> margins)
  email += `--${altBoundary}\r\n`;
  email += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
  email += htmlBody + "\r\n\r\n";

  email += `--${altBoundary}--\r\n\r\n`;

  // Attachments
  for (const attachment of attachments) {
    email += `--${outerBoundary}\r\n`;
    email += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n`;
    email += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n\r\n`;
    email += attachment.content.toString("base64") + "\r\n\r\n";
  }

  email += `--${outerBoundary}--`;

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

// ─────────────────────────────────────────────────────────────────────────────
// FULL THREAD CONVERSATION FETCH
// Retrieves every message in a Gmail thread (outbound + inbound) and returns
// them in chronological order with direction determined by the sender address.
// Used by the Inbox conversation view to show a WhatsApp-style thread.
// ─────────────────────────────────────────────────────────────────────────────

export interface GmailThreadMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  direction: "outbound" | "inbound";
  from: string;         // raw From header value
  senderEmail: string;  // parsed email address of sender
  senderName: string;   // display name extracted from From
  subject: string;
  body: string;         // plain text, HTML tags stripped
  sentAt: string;       // ISO-8601
  internalDate: number; // ms epoch — used for sort
}

function extractHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBody(part: any): string {
  // Walk MIME parts recursively to find text/plain or text/html body
  if (!part) return "";

  if (part.body?.data) {
    // base64url → utf-8 string
    const decoded = Buffer.from(part.body.data, "base64url").toString("utf-8");
    if (part.mimeType === "text/plain") return decoded;
    if (part.mimeType === "text/html") {
      // Strip HTML tags to plain text
      return decoded
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  }

  // Multipart: prefer text/plain, fall back to text/html
  if (part.parts && Array.isArray(part.parts)) {
    const plainPart = part.parts.find((p: any) => p.mimeType === "text/plain");
    if (plainPart) {
      const result = decodeBody(plainPart);
      if (result) return result;
    }
    for (const subPart of part.parts) {
      const result = decodeBody(subPart);
      if (result) return result;
    }
  }

  return "";
}

function extractSenderName(fromHeader: string): string {
  // "Display Name <email@example.com>" → "Display Name"
  // "email@example.com" → "email@example.com"
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return fromHeader;
}

export async function getGmailThreadMessages(
  userId: string,
  threadId: string
): Promise<GmailThreadMessage[]> {
  console.log(`[Inbox Thread Fetch] ── START ──────────────────────────────────`);
  console.log(`[Inbox Thread Fetch] threadId: ${threadId}, userId: ${userId}`);

  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Determine user's own email so we can classify outbound vs inbound
  const integration = await storage.getIntegration(userId, "gmail");
  const ownEmail = ((integration?.metadata as any)?.email || "").toLowerCase();
  console.log(`[Inbox Thread Fetch] ownEmail: "${ownEmail}"`);

  const threadData = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full", // need full bodies, not just metadata
  });

  const messages = threadData.data.messages || [];
  console.log(`[Inbox Thread Fetch] Gmail API returned ${messages.length} raw messages`);

  // ── RAW DIAGNOSTIC: print every message before any filtering ────────────
  messages.forEach((msg: any, i: number) => {
    const headers = msg.payload?.headers || [];
    const from = extractHeader(headers, "From");
    const subject = extractHeader(headers, "Subject");
    const date = extractHeader(headers, "Date");
    const emailMatch = from.match(/<(.+?)>/) || [null, from];
    const senderEmail = (emailMatch[1] || from).toLowerCase().trim();
    const isOutbound = senderEmail === ownEmail;
    console.log(`[Inbox Thread Fetch] [${i + 1}/${messages.length}] RAW MESSAGE:`);
    console.log(`  messageId    : ${msg.id}`);
    console.log(`  from         : "${from}"`);
    console.log(`  senderEmail  : "${senderEmail}"`);
    console.log(`  ownEmail     : "${ownEmail}"`);
    console.log(`  direction    : ${isOutbound ? "OUTBOUND" : "INBOUND"}`);
    console.log(`  subject      : "${subject}"`);
    console.log(`  date         : "${date}"`);
    console.log(`  internalDate : ${msg.internalDate} (${new Date(parseInt(msg.internalDate || "0", 10)).toISOString()})`);
  });
  // ────────────────────────────────────────────────────────────────────────

  const result: GmailThreadMessage[] = messages.map((msg: any) => {
    const headers = msg.payload?.headers || [];
    const from = extractHeader(headers, "From");
    const subject = extractHeader(headers, "Subject");

    // Direction: inbound = any message where sender != ownEmail (no exact-match tricks)
    const emailMatch = from.match(/<(.+?)>/) || [null, from];
    const senderEmail = (emailMatch[1] || from).toLowerCase().trim();
    const direction: "outbound" | "inbound" = senderEmail === ownEmail ? "outbound" : "inbound";

    const internalDate = parseInt(msg.internalDate || "0", 10);
    const body = decodeBody(msg.payload);

    return {
      gmailMessageId: msg.id || "",
      gmailThreadId: threadId,
      direction,
      from,
      senderEmail,
      senderName: extractSenderName(from),
      subject,
      body: body || "(no body)",
      sentAt: new Date(internalDate).toISOString(),
      internalDate,
    };
  });

  // Ensure chronological order (Gmail usually returns them in order, but be safe)
  result.sort((a, b) => a.internalDate - b.internalDate);

  const outboundCount = result.filter(m => m.direction === "outbound").length;
  const inboundCount = result.filter(m => m.direction === "inbound").length;
  console.log(`[Inbox Thread Fetch] ── RESULT: ${result.length} messages (${outboundCount} outbound, ${inboundCount} inbound) ──`);

  return result;
}
