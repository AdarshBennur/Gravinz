import { google } from "googleapis";
import { storage } from "../storage";
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

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: integration.tokenExpiresAt?.getTime(),
  });

  if (integration.tokenExpiresAt && new Date() >= integration.tokenExpiresAt) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Encrypt new tokens before storage
      const newAccessToken = credentials.access_token ? encryptToken(credentials.access_token) : integration.accessToken;
      const newRefreshToken = credentials.refresh_token ? encryptToken(credentials.refresh_token) : integration.refreshToken;

      await storage.upsertIntegration(userId, "gmail", {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : integration.tokenExpiresAt,
      });
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      console.error("Token refresh failed:", err);
      throw new Error("Gmail token expired and refresh failed. Please reconnect Gmail.");
    }
  }

  return oauth2Client;
}

function createRawEmail(to: string, from: string, subject: string, body: string, threadId?: string, messageId?: string): string {
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];

  if (messageId) {
    headers.push(`In-Reply-To: ${messageId}`);
    headers.push(`References: ${messageId}`);
  }

  const email = headers.join("\r\n") + "\r\n\r\n" + body;
  return Buffer.from(email).toString("base64url");
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  inReplyToMessageId?: string
): Promise<{ messageId: string; threadId: string }> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const integration = await storage.getIntegration(userId, "gmail");
  const fromEmail = (integration?.metadata as any)?.email || "me";

  const raw = createRawEmail(to, fromEmail, subject, body, threadId, inReplyToMessageId);

  const sendParams: any = {
    userId: "me",
    requestBody: { raw },
  };

  if (threadId) {
    sendParams.requestBody.threadId = threadId;
  }

  const result = await gmail.users.messages.send(sendParams);

  return {
    messageId: result.data.id || "",
    threadId: result.data.threadId || "",
  };
}

export async function checkForReplies(userId: string): Promise<Array<{
  contactEmail: string;
  threadId: string;
  messageId: string;
  snippet: string;
}>> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const replies: Array<{
    contactEmail: string;
    threadId: string;
    messageId: string;
    snippet: string;
  }> = [];

  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "is:inbox newer_than:1d",
      maxResults: 50,
    });

    const messages = response.data.messages || [];

    for (const msg of messages) {
      if (!msg.id) continue;

      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "In-Reply-To"],
        });

        const headers = detail.data.payload?.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "";
        const emailMatch = from.match(/<(.+?)>/) || [null, from];
        const senderEmail = (emailMatch[1] || from).toLowerCase().trim();
        const threadId = detail.data.threadId || "";

        replies.push({
          contactEmail: senderEmail,
          threadId,
          messageId: msg.id,
          snippet: detail.data.snippet || "",
        });
      } catch (e) {
        console.error(`Failed to get message ${msg.id}:`, e);
      }
    }
  } catch (e) {
    console.error("Failed to list messages:", e);
  }

  return replies;
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
