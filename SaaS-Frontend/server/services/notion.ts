import { Client } from "@notionhq/client";
import { storage } from "../storage.ts";
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
        // DIAGNOSTIC: Log exact property keys from this Notion page
        console.log(`[COLUMN KEYS] Row ${rowNumber}: ${JSON.stringify(Object.keys(props))}`);

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

        // Extract well-known fields for top-level columns (Company, Role, Status)
        // We prioritise the user's mapped columns, then fall back to common names.

        let company: string | null = null;
        if (columnMapping?.company) {
          company = notionData[columnMapping.company] || null;
        } else {
          company = extractNotionProperty(notionData, ["Company", "Organization", "Business"]);
        }

        let role: string | null = null;
        if (columnMapping?.role) {
          role = notionData[columnMapping.role] || null;
        } else {
          role = extractNotionProperty(notionData, ["Role", "Job Title", "Position", "Title"]);
        }

        let status: string | null = null;
        if (columnMapping?.status) {
          const rawStatus = notionData[columnMapping.status];
          if (rawStatus) status = mapNotionStatusToInternal(rawStatus);
        } else {
          const rawStatus = extractNotionProperty(notionData, ["Status", "State", "Stage"]);
          if (rawStatus) status = mapNotionStatusToInternal(rawStatus);
        }

        // ─── EXTRACT DATE FIELDS FROM NOTION ─────────────────────────────────
        // These MUST be populated when status implies they should exist.
        let firstEmailDate: Date | null = null;
        let followup1Date: Date | null = null;
        let followup2Date: Date | null = null;

        const firstEmailDateKey = columnMapping?.firstEmailDate || "First Email Date";
        const followup1DateKey = columnMapping?.followup1Date || "Follow-up 1 Date";
        const followup2DateKey = columnMapping?.followup2Date || "Follow-up 2 Date";

        // ─── DATE DIAGNOSTIC: Log raw Notion property type + value ───────────
        for (const dKey of [firstEmailDateKey, followup1DateKey, followup2DateKey]) {
          const rawProp = props[dKey];
          if (rawProp) {
            console.log(`[DATE DIAGNOSTIC] Row ${rowNumber} (${email}): Column "${dKey}" → type="${rawProp.type}", raw=${JSON.stringify(rawProp).substring(0, 200)}`);
          } else {
            console.warn(`[DATE DIAGNOSTIC] Row ${rowNumber} (${email}): Column "${dKey}" → NOT FOUND in props. Available keys: ${JSON.stringify(Object.keys(props))}`);
          }
          console.log(`[DATE DIAGNOSTIC] notionData["${dKey}"] = ${JSON.stringify(notionData[dKey])}`);
        }

        // Step 1: Try extracting from notionData (already processed by extractNotionValue)
        // Step 2: If null, try extracting directly from raw Notion property (fallback)
        firstEmailDate = safeParseDateValue(notionData[firstEmailDateKey]) || extractDateFromRawProperty(props[firstEmailDateKey]);
        followup1Date = safeParseDateValue(notionData[followup1DateKey]) || extractDateFromRawProperty(props[followup1DateKey]);
        followup2Date = safeParseDateValue(notionData[followup2DateKey]) || extractDateFromRawProperty(props[followup2DateKey]);

        console.log(`[DATE EXTRACTION RESULT] Row ${rowNumber} (${email}): firstEmailDate=${firstEmailDate?.toISOString() || "NULL"}, followup1Date=${followup1Date?.toISOString() || "NULL"}, followup2Date=${followup2Date?.toISOString() || "NULL"}`);

        // ─── DATA CONSISTENCY VALIDATION ─────────────────────────────────────
        // STATUS IS NEVER DOWNGRADED. If dates are missing, we log loudly
        // but preserve the original status from Notion. The import layer
        // must NEVER silently alter status due to extraction failure.
        const effectiveStatus = status || "not-sent";
        const validatedStatus = effectiveStatus; // PRESERVED — no mutation

        if (effectiveStatus === "sent" && !firstEmailDate) {
          console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="sent" but firstEmailDate extraction FAILED. STATUS PRESERVED as "sent". Check column name "${firstEmailDateKey}" and property type.`);
        } else if (effectiveStatus === "followup-1") {
          if (!firstEmailDate) {
            console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="followup-1" but firstEmailDate extraction FAILED. STATUS PRESERVED. Check column "${firstEmailDateKey}".`);
          }
          if (!followup1Date) {
            console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="followup-1" but followup1Date extraction FAILED. STATUS PRESERVED. Check column "${followup1DateKey}".`);
          }
        } else if (effectiveStatus === "followup-2") {
          if (!firstEmailDate) {
            console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="followup-2" but firstEmailDate extraction FAILED. STATUS PRESERVED. Check column "${firstEmailDateKey}".`);
          }
          if (!followup1Date) {
            console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="followup-2" but followup1Date extraction FAILED. STATUS PRESERVED. Check column "${followup1DateKey}".`);
          }
          if (!followup2Date) {
            console.error(`[IMPORT FAILURE] Row ${rowNumber} (${email}): status="followup-2" but followup2Date extraction FAILED. STATUS PRESERVED. Check column "${followup2DateKey}".`);
          }
        }

        // Extract jobLink
        let jobLink: string | null = null;
        if (columnMapping?.jobLink) {
          jobLink = notionData[columnMapping.jobLink] || null;
        }

        // Store complete Notion row with ALL columns + preserve order
        const newContact = await storage.createContact(userId, {
          name: contactName,
          email: email,
          company: company,
          role: role,
          status: validatedStatus,
          source: "notion",
          notionPageId: page.id,
          notionData: notionData,
          notionRowOrder: rowNumber,
          notionColumnOrder: columnOrder,
          firstEmailDate: firstEmailDate,
          followup1Date: followup1Date,
          followup2Date: followup2Date,
          jobLink: jobLink,
        } as any);

        console.log(`[Notion Import] Row ${rowNumber} - IMPORTED successfully: ${email} (status="${validatedStatus}")`);
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
      value = prop.select?.name || null;
      break;
    case "multi_select":
      value = prop.multi_select?.map((opt: any) => opt.name).join(", ") || null;
      break;
    case "url":
      value = prop.url || null;
      break;
    case "date":
      // ISO date string, timezone-safe
      value = prop.date?.start || null;
      break;
    case "formula":
      // Formulas can return date, string, number, or boolean
      if (prop.formula?.type === "date") value = prop.formula.date?.start || null;
      else if (prop.formula?.type === "string") value = prop.formula.string || null;
      else if (prop.formula?.type === "number") value = prop.formula.number?.toString() || null;
      else if (prop.formula?.type === "boolean") value = prop.formula.boolean?.toString() || null;
      break;
    case "rollup":
      // Rollups contain arrays; extract first element
      if (prop.rollup?.type === "array" && prop.rollup.array?.length > 0) {
        const first = prop.rollup.array[0];
        if (first?.type === "date") value = first.date?.start || null;
        else value = extractNotionValue(first);
      } else if (prop.rollup?.type === "number") {
        value = prop.rollup.number?.toString() || null;
      } else if (prop.rollup?.type === "date") {
        value = prop.rollup.date?.start || null;
      }
      break;
    case "created_time":
      // ISO 8601 timestamp with timezone (e.g. "2026-02-18T09:00:00.000Z")
      value = prop.created_time || null;
      break;
    case "last_edited_time":
      value = prop.last_edited_time || null;
      break;
    case "number":
      value = prop.number != null ? prop.number.toString() : null;
      break;
    case "checkbox":
      value = prop.checkbox != null ? prop.checkbox.toString() : null;
      break;
    case "status":
      // Notion's native Status property type
      value = prop.status?.name || null;
      break;
    case "people":
      value = prop.people?.map((p: any) => p.name || p.id).join(", ") || null;
      break;
    case "files":
      value = prop.files?.[0]?.file?.url || prop.files?.[0]?.external?.url || null;
      break;
    case "relation":
      value = prop.relation?.map((r: any) => r.id).join(", ") || null;
      break;
    default:
      console.warn(`[extractNotionValue] Unhandled property type: "${prop.type}". Returning null.`);
      value = null;
  }

  // Trim strings, preserve null
  return value ? value.trim() : null;
}

/**
 * Parse a string or Date value into a Date object, timezone-safe.
 * Returns null if parsing fails. Always stores as UTC.
 */
function safeParseDateValue(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "string") {
    // Handle date-only strings ("2026-02-18") by treating as UTC midnight
    const dateOnlyMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateOnlyMatch) {
      const d = new Date(raw + "T00:00:00.000Z");
      return isNaN(d.getTime()) ? null : d;
    }
    // Full ISO string — parse directly
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Fallback: extract a Date directly from a raw Notion property object.
 * Handles all property types that can contain a date.
 * Used when extractNotionValue() + notionData lookup both fail.
 */
function extractDateFromRawProperty(prop: any): Date | null {
  if (!prop || !prop.type) return null;

  let isoString: string | null = null;

  switch (prop.type) {
    case "date":
      isoString = prop.date?.start || null;
      break;
    case "formula":
      if (prop.formula?.type === "date") isoString = prop.formula.date?.start || null;
      else if (prop.formula?.type === "string") isoString = prop.formula.string || null;
      break;
    case "rollup":
      if (prop.rollup?.type === "array" && prop.rollup.array?.length > 0) {
        const first = prop.rollup.array[0];
        if (first?.type === "date") isoString = first.date?.start || null;
      } else if (prop.rollup?.type === "date") {
        isoString = prop.rollup.date?.start || null;
      }
      break;
    case "created_time":
      isoString = prop.created_time || null;
      break;
    case "last_edited_time":
      isoString = prop.last_edited_time || null;
      break;
    case "rich_text":
      // Sometimes dates stored as text
      isoString = prop.rich_text?.[0]?.plain_text || null;
      break;
    default:
      return null;
  }

  return safeParseDateValue(isoString);
}

function mapNotionStatusToInternal(notionStatus: string): string {
  const s = notionStatus.toLowerCase().trim();
  if (s === "not applied" || s === "to apply" || s === "new") return "not-sent";
  if (s === "applied" || s === "first email sent" || s === "sent") return "sent"; // Schema uses 'sent' for first email
  if (s === "follow-up 1" || s === "follow-up 1 sent") return "followup-1"; // Schema uses 'followup-1'
  if (s === "follow-up 2" || s === "follow-up 2 sent") return "followup-2"; // Schema uses 'followup-2'
  if (s === "replied" || s === "interview") return "replied";
  if (s === "rejected" || s === "bounced") return "bounced";
  return "not-sent"; // Default safe fallback
}

function extractNotionProperty(data: Record<string, any>, candidates: string[]): string | null {
  // Try exact match first
  for (const c of candidates) {
    if (data[c]) return data[c];
  }

  // Try case-insensitive match
  const lowerData: Record<string, any> = {};
  for (const key in data) {
    if (data[key]) lowerData[key.toLowerCase()] = data[key];
  }

  for (const c of candidates) {
    const val = lowerData[c.toLowerCase()];
    if (val) return val;
  }

  return null;
}

export async function syncContactStatusToNotion(
  userId: string,
  contactId: string,
  status: string,
  dates: {
    firstEmailDate?: Date | null;
    followup1Date?: Date | null;
    followup2Date?: Date | null;
  } = {}
): Promise<void> {
  const contact = await storage.getContact(contactId, userId);
  if (!contact || !contact.notionPageId) {
    console.log(`[Notion Sync] Skipping — contact ${contactId} has no Notion page ID`);
    return;
  }

  const notion = await getNotionClient(userId);

  // Build properties patch — only include fields that have values
  const properties: Record<string, any> = {
    Status: { select: { name: statusToNotionLabel(status) } },
  };

  if (dates.firstEmailDate) {
    properties["First Email Date"] = {
      date: { start: new Date(dates.firstEmailDate).toISOString().split("T")[0] },
    };
  }
  if (dates.followup1Date) {
    properties["Follow-up 1 Date"] = {
      date: { start: new Date(dates.followup1Date).toISOString().split("T")[0] },
    };
  }
  if (dates.followup2Date) {
    properties["Follow-up 2 Date"] = {
      date: { start: new Date(dates.followup2Date).toISOString().split("T")[0] },
    };
  }

  console.log(`[Notion Sync] Patching page ${contact.notionPageId} — status="${statusToNotionLabel(status)}", dates:`, {
    firstEmailDate: dates.firstEmailDate ?? null,
    followup1Date: dates.followup1Date ?? null,
    followup2Date: dates.followup2Date ?? null,
  });

  // Throws on failure — caller (tryNotionSync) handles and logs the error
  await notion.pages.update({
    page_id: contact.notionPageId,
    properties,
  });

  console.log(`[Notion Sync] Page ${contact.notionPageId} updated successfully`);
}

function statusToNotionLabel(status: string): string {
  const map: Record<string, string> = {
    "not-sent": "Not Applied",
    "sent": "First Email Sent",
    "followup-1": "Follow-Up 1",
    "followup-2": "Follow-Up 2",
    "followup": "Follow-Up",
    "replied": "Replied",
    "bounced": "Bounced",
    "paused": "Paused",
    "failed": "Failed",
    "stopped": "Stopped",
    "manual_break": "Manual Break",
  };
  return map[status] || status;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isNotionConfigured(): boolean {
  return !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
}
