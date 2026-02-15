import { Client } from "@notionhq/client";
import { storage } from "../storage";

function getNotionOAuthConfig() {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000"}/api/integrations/notion/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Notion OAuth credentials not configured");
  }

  return { clientId, clientSecret, redirectUri };
}

export function getNotionAuthUrl(userId: string): string {
  const { clientId, redirectUri } = getNotionOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
    state: userId,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

export async function handleNotionCallback(code: string, userId: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getNotionOAuthConfig();

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion OAuth failed: ${err}`);
  }

  const data = await response.json() as any;

  await storage.upsertIntegration(userId, "notion", {
    connected: true,
    accessToken: data.access_token,
    metadata: {
      workspaceName: data.workspace_name,
      workspaceId: data.workspace_id,
      botId: data.bot_id,
    },
  });
}

async function getNotionClient(userId: string): Promise<Client> {
  const integration = await storage.getIntegration(userId, "notion");
  if (!integration || !integration.connected || !integration.accessToken) {
    throw new Error("Notion not connected");
  }

  return new Client({ auth: integration.accessToken });
}

export async function listNotionDatabases(userId: string): Promise<Array<{ id: string; title: string }>> {
  const notion = await getNotionClient(userId);

  const response = await notion.search({
    filter: { value: "database", property: "object" },
    page_size: 20,
  });

  return response.results
    .filter((r: any) => r.object === "database")
    .map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Untitled",
    }));
}

export async function importContactsFromNotion(
  userId: string,
  databaseId: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const notion = await getNotionClient(userId);
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: startCursor,
      page_size: 100,
    });

    for (const page of response.results) {
      try {
        const props = (page as any).properties;

        const name = extractNotionProperty(props, ["Name", "name", "Full Name", "Contact"]);
        const email = extractNotionProperty(props, ["Email", "email", "E-mail"]);
        const company = extractNotionProperty(props, ["Company", "company", "Organization"]);
        const role = extractNotionProperty(props, ["Role", "role", "Title", "Position", "Job Title"]);

        if (!name || !email) {
          skipped++;
          errors.push(`Skipped row: missing name or email (page ${page.id})`);
          continue;
        }

        if (!isValidEmail(email)) {
          skipped++;
          errors.push(`Skipped row: invalid email "${email}" (page ${page.id})`);
          continue;
        }

        const existingContacts = await storage.getContacts(userId);
        const duplicate = existingContacts.find(
          (c) => c.email.toLowerCase() === email.toLowerCase()
        );

        if (duplicate) {
          skipped++;
          continue;
        }

        await storage.createContact(userId, {
          name,
          email,
          company: company || null,
          role: role || null,
          source: "notion",
          notionPageId: page.id,
          status: "not-sent",
        } as any);

        imported++;
      } catch (e: any) {
        errors.push(`Error importing page ${page.id}: ${e.message}`);
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  return { imported, skipped, errors };
}

function extractNotionProperty(properties: Record<string, any>, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    const prop = properties[name];
    if (!prop) continue;

    switch (prop.type) {
      case "title":
        return prop.title?.[0]?.plain_text || null;
      case "rich_text":
        return prop.rich_text?.[0]?.plain_text || null;
      case "email":
        return prop.email || null;
      case "phone_number":
        return prop.phone_number || null;
      case "select":
        return prop.select?.name || null;
      case "url":
        return prop.url || null;
      default:
        return null;
    }
  }
  return null;
}

export async function syncContactStatusToNotion(
  userId: string,
  contactId: string,
  status: string
): Promise<void> {
  const contact = await storage.getContact(contactId, userId);
  if (!contact || !contact.notionPageId) return;

  try {
    const notion = await getNotionClient(userId);

    await notion.pages.update({
      page_id: contact.notionPageId,
      properties: {
        Status: {
          select: { name: statusToNotionLabel(status) },
        },
      },
    });
  } catch (e: any) {
    console.error(`Failed to sync status to Notion for contact ${contactId}:`, e.message);
  }
}

function statusToNotionLabel(status: string): string {
  const map: Record<string, string> = {
    "not-sent": "Not Applied",
    sent: "First Email Sent",
    "followup-1": "Follow-Up 1",
    "followup-2": "Follow-Up 2",
    followup: "Follow-Up",
    replied: "Replied",
    bounced: "Bounced",
    paused: "Paused",
  };
  return map[status] || status;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isNotionConfigured(): boolean {
  return !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
}
