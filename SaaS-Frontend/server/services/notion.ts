import { Client } from "@notionhq/client";
import { storage } from "../storage";
import { encryptToken, decryptToken } from "./encryption";

function getNotionOAuthConfig() {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const port = process.env.PORT || "5000";
  const redirectUri = process.env.NOTION_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${port}`}/api/integrations/notion/callback`;

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

  // Encrypt access token before storage
  const encryptedAccessToken = encryptToken(data.access_token);

  await storage.upsertIntegration(userId, "notion", {
    connected: true,
    accessToken: encryptedAccessToken,
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

  // Decrypt access token from storage
  const accessToken = decryptToken(integration.accessToken);

  return new Client({ auth: accessToken });
}

export async function listNotionDatabases(userId: string): Promise<Array<{ id: string; title: string }>> {
  const notion = await getNotionClient(userId);

  // @ts-ignore - Notion client types don't perfectly match runtime API
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

export async function getDatabaseSchema(
  userId: string,
  databaseId: string
): Promise<{ properties: Array<{ id: string; name: string; type: string }> }> {
  const notion = await getNotionClient(userId);

  // @ts-ignore - Notion client types don't perfectly match runtime API
  const database = await notion.databases.retrieve({
    database_id: databaseId,
  });

  const columns = Object.entries((database as any).properties).map(([key, prop]: [string, any]) => ({
    id: key,
    name: key,
    type: prop.type,
  }));

  return { properties: columns };
}

export interface ColumnMapping {
  email: string; // Required
  name?: string; // Optional
  company?: string; // Optional
  role?: string; // Optional
  status?: string; // NEW - Optional
  firstEmailDate?: string; // NEW - Optional
  followup1Date?: string; // NEW - Optional
  followup2Date?: string; // NEW - Optional
  jobLink?: string; // NEW - Optional
}

export async function importContactsFromNotion(
  userId: string,
  databaseId: string,
  columnMapping?: ColumnMapping
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const notion = await getNotionClient(userId);
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  let rowNumber = 0;

  console.log(`[Notion Import] Starting import from database ${databaseId} for user ${userId}`);

  // STEP 1: Fetch database schema to get EXACT column order from Notion
  // @ts-ignore
  const database = await notion.databases.retrieve({ database_id: databaseId });

  // LOG: Raw properties keys to verify order from API
  const rawProps = (database as any).properties;
  console.log(`[Notion Debug] Raw database.properties keys:`, Object.keys(rawProps));

  // Extract column names using Object.entries as requested, BUT prioritize 'Title' type
  const entries = Object.entries(rawProps);
  const titleEntry = entries.find(([_, prop]: any) => prop.type === "title");
  const otherEntries = entries.filter(([_, prop]: any) => prop.type !== "title");

  // Force Title to index 0, then follow schema order for the rest
  const columnOrder = titleEntry
    ? [titleEntry[0], ...otherEntries.map(([key]) => key)]
    : entries.map(([key]) => key);

  console.log(`[Notion Debug] Final columnOrder used for import (Title first):`, columnOrder);

  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    // @ts-ignore - Notion client types don't perfectly match runtime API
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: startCursor,
      page_size: 100,
      // DO NOT SORT - preserve Notion's natural order
    });

    console.log(`[Notion Import] Fetched ${response.results.length} pages from Notion`);

    // LOG: Row IDs in order
    console.log(`[Notion Debug] Page IDs in this batch:`, response.results.map(p => p.id));

    for (const page of response.results) {
      rowNumber++;
      try {
        const props = (page as any).properties;

        // DYNAMIC EXTRACTION: Extract properties in EXACT schema order
        const notionData: Record<string, any> = {};
        for (const colName of columnOrder) {
          if (props[colName]) {
            notionData[colName] = extractNotionValue(props[colName] as any);
          } else {
            notionData[colName] = null; // Column exists in schema but not in this row
          }
        }

        console.log(`[Notion Import] Row ${rowNumber} - Extracted ${columnOrder.length} columns in schema order`);

        // Extract email for duplicate checking (if column mapping exists, use it; otherwise auto-detect)
        let email: string | null = null;
        if (columnMapping?.email) {
          email = notionData[columnMapping.email] || null;
        } else {
          // Auto-detect email from common column names
          const emailCandidates = ["Email", "email", "E-mail", "Contact Email", "Email Address"];
          for (const candidate of emailCandidates) {
            if (notionData[candidate]) {
              email = notionData[candidate];
              break;
            }
          }
        }

        // STRICT VALIDATION: Skip row if no email found
        if (!email) {
          skipped++;
          const errorMsg = `Row ${rowNumber}: Skipped - No email found`;
          errors.push(errorMsg);
          console.log(`[Notion Import] ${errorMsg}`);
          continue;
        }

        // ONLY SKIP IF: Email already exists for this user (duplicate check)
        if (email) {
          const existingContact = await storage.getContactByEmail(email, userId);
          if (existingContact) {
            skipped++;
            const errorMsg = `Row ${rowNumber}: Duplicate email "${email}" - already exists`;
            errors.push(errorMsg);
            console.log(`[Notion Import] SKIPPED - ${errorMsg}`);
            continue;
          }
        }

        // Extract name for display purposes (optional, falls back to email or "Unknown")
        let name: string | null = null;
        if (columnMapping?.name) {
          name = notionData[columnMapping.name] || null;
        } else {
          const nameCandidates = ["Name", "name", "Full Name", "Contact", "Contacted Person", "Contact Name", "Person"];
          for (const candidate of nameCandidates) {
            if (notionData[candidate]) {
              name = notionData[candidate];
              break;
            }
          }
        }

        // Default name to email username or "Unknown" (for display only)
        const contactName = name || (email ? email.split('@')[0] : "Unknown");

        // Store complete Notion row with ALL columns + preserve order
        const newContact = await storage.createContact(userId, {
          name: contactName,
          email: email, // Validated as not null above
          company: null, // Not using fixed columns for Notion imports anymore
          role: null,
          status: null, // Not using status column for Notion imports
          source: "notion",
          notionPageId: page.id,
          notionData: notionData, // Complete Notion row (all columns)
          notionRowOrder: rowNumber, // Preserve original row order
          notionColumnOrder: columnOrder, // Preserve original column order
          firstEmailDate: null,
          followup1Date: null,
          followup2Date: null,
          jobLink: null,
        } as any);

        console.log(`[Notion Import] Row ${rowNumber} - IMPORTED successfully: ${email}`);
        imported++;
      } catch (e: any) {
        const errorMsg = `Row ${rowNumber}: Error - ${e.message}`;
        errors.push(errorMsg);
        console.error(`[Notion Import] ERROR -`, errorMsg, e);
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`[Notion Import] COMPLETE - Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { imported, skipped, errors };
}

function extractNotionProperty(properties: Record<string, any>, possibleNames: string[]): string | null {
  // Try exact match first
  for (const name of possibleNames) {
    const prop = properties[name];
    if (prop) {
      const value = extractNotionValue(prop);
      if (value) return value;
    }
  }

  // Try case-insensitive match as fallback
  const lowerProps: Record<string, any> = {};
  for (const key in properties) {
    lowerProps[key.toLowerCase()] = properties[key];
  }

  for (const name of possibleNames) {
    const prop = lowerProps[name.toLowerCase()];
    if (prop) {
      const value = extractNotionValue(prop);
      if (value) return value;
    }
  }

  return null;
}

function extractNotionValue(prop: any): string | null {
  if (!prop || !prop.type) return null;

  let value: string | null = null;

  switch (prop.type) {
    case "title":
      value = prop.title?.[0]?.plain_text || null;
      break;
    case "rich_text":
      value = prop.rich_text?.[0]?.plain_text || null;
      break;
    case "email":
      value = prop.email || null;
      break;
    case "phone_number":
      value = prop.phone_number || null;
      break;
    case "select":
      // Store selected option name as plain text
      value = prop.select?.name || null;
      break;
    case "multi_select":
      // Store multiple options as comma-separated string
      value = prop.multi_select?.map((opt: any) => opt.name).join(", ") || null;
      break;
    case "url":
      value = prop.url || null;
      break;
    case "date":
      // Extract ISO date string
      value = prop.date?.start || null;
      break;
    default:
      value = null;
  }

  // Trim and ensure no null/undefined
  return value ? value.trim() : null;
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
