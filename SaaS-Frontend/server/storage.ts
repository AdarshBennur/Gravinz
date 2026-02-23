import { supabaseAdmin } from "./supabase";
import {
  type User,
  type InsertUser,
  type Contact,
  type InsertContact,
  type CampaignSettings,
  type InsertCampaignSettings,
  type Experience,
  type InsertExperience,
  type Project,
  type InsertProject,
  type UserProfile,
  type InsertUserProfile,
  type EmailSend,
  type DailyUsage,
  type Integration,
  type ActivityLogEntry,
} from "../shared/schema.ts";

// ─── camelCase ↔ snake_case helpers ─────────────────────────────
function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function keysToSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toSnake(k)] = v;
  }
  return out;
}
function keysToCamel<T>(obj: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toCamel(k)] = v;
  }
  return out as T;
}
function rowsToCamel<T>(rows: Record<string, any>[]): T[] {
  return rows.map((r) => keysToCamel<T>(r));
}

// ─── Interface ──────────────────────────────────────────────────
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  upsertUserProfile(userId: string, data: InsertUserProfile): Promise<UserProfile>;

  getExperiences(userId: string): Promise<Experience[]>;
  createExperience(userId: string, data: InsertExperience): Promise<Experience>;
  updateExperience(id: string, userId: string, data: Partial<InsertExperience>): Promise<Experience | undefined>;
  deleteExperience(id: string, userId: string): Promise<boolean>;
  setExperiences(userId: string, experiences: InsertExperience[]): Promise<Experience[]>;

  getProjects(userId: string): Promise<Project[]>;
  createProject(userId: string, data: InsertProject): Promise<Project>;
  updateProject(id: string, userId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;
  setProjects(userId: string, projects: InsertProject[]): Promise<Project[]>;

  getContacts(userId: string): Promise<Contact[]>;
  getContact(id: string, userId: string): Promise<Contact | undefined>;
  getContactByEmail(email: string, userId: string): Promise<Contact | undefined>;
  createContact(userId: string, data: InsertContact): Promise<Contact>;
  updateContact(id: string, userId: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string, userId: string): Promise<boolean>;
  clearAllContacts(userId: string): Promise<number>;

  getCampaignSettings(userId: string): Promise<CampaignSettings | undefined>;
  upsertCampaignSettings(userId: string, data: InsertCampaignSettings): Promise<CampaignSettings>;

  getEmailSends(userId: string, limit?: number): Promise<EmailSend[]>;
  getEmailSendsForContact(userId: string, contactId: string): Promise<EmailSend[]>;
  createEmailSend(userId: string, contactId: string, data: Partial<EmailSend>): Promise<EmailSend>;
  updateEmailSend(id: string, data: Partial<EmailSend>): Promise<EmailSend | undefined>;

  getDailyUsage(userId: string, date: string): Promise<DailyUsage | undefined>;
  upsertDailyUsage(userId: string, date: string, data: Partial<DailyUsage>): Promise<DailyUsage>;

  getIntegration(userId: string, type: string): Promise<Integration | undefined>;
  upsertIntegration(userId: string, type: string, data: Partial<Integration>): Promise<Integration>;

  getActivityLog(userId: string, limit?: number): Promise<ActivityLogEntry[]>;
  createActivityLog(userId: string, data: { contactName?: string; action: string; status?: string }): Promise<ActivityLogEntry>;

  getUsersWithActiveAutomation(): Promise<string[]>;

  getDashboardStats(userId: string): Promise<{
    sentToday: number;
    followupsPending: number;
    replies: number;
    dailyLimit: number;
    used: number;
  }>;

  getAnalytics(userId: string, days?: number): Promise<{
    daily: { day: string; sent: number; replies: number }[];
    totalSent: number;
    totalReplies: number;
    replyRate: number;
  }>;

  acquireAutomationLock(contactId: string, userId: string, currentStatus: string, lockStatus: string): Promise<boolean>;
}

// ─── Supabase PostgREST Storage Implementation ─────────────────
export class DatabaseStorage implements IStorage {
  // ─── Users ──────────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const { data } = await supabaseAdmin.from("users").select("*").eq("id", id).single();
    return data ? keysToCamel<User>(data) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data } = await supabaseAdmin.from("users").select("*").eq("username", username).single();
    return data ? keysToCamel<User>(data) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .insert(keysToSnake(insertUser))
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<User>(data);
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ ...keysToSnake(userData), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data ? keysToCamel<User>(data) : undefined;
  }

  // ─── User Profiles ─────────────────────────────────────────

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const { data } = await supabaseAdmin.from("user_profiles").select("*").eq("user_id", userId).single();
    return data ? keysToCamel<UserProfile>(data) : undefined;
  }

  async upsertUserProfile(userId: string, profileData: InsertUserProfile): Promise<UserProfile> {
    const existing = await this.getUserProfile(userId);
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("user_profiles")
        .update({ ...keysToSnake(profileData), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw error;
      return keysToCamel<UserProfile>(data);
    }
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .insert({ ...keysToSnake(profileData), user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<UserProfile>(data);
  }

  // ─── Experiences ────────────────────────────────────────────

  async getExperiences(userId: string): Promise<Experience[]> {
    const { data } = await supabaseAdmin
      .from("experiences")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return data ? rowsToCamel<Experience>(data) : [];
  }

  async createExperience(userId: string, expData: InsertExperience): Promise<Experience> {
    const { data, error } = await supabaseAdmin
      .from("experiences")
      .insert({ ...keysToSnake(expData), user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<Experience>(data);
  }

  async updateExperience(id: string, userId: string, expData: Partial<InsertExperience>): Promise<Experience | undefined> {
    const { data, error } = await supabaseAdmin
      .from("experiences")
      .update(keysToSnake(expData))
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return undefined;
    return data ? keysToCamel<Experience>(data) : undefined;
  }

  async deleteExperience(id: string, userId: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from("experiences")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);
    return !error && (count ?? 0) > 0;
  }

  async setExperiences(userId: string, experiences: InsertExperience[]): Promise<Experience[]> {
    // 1. Delete all existing experiences for user
    const { error: deleteError } = await supabaseAdmin
      .from("experiences")
      .delete()
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    if (experiences.length === 0) return [];

    // 2. Insert new experiences
    // Ensure we don't try to insert 'id' if it's empty/gen_random_uuid related,
    // but usually InsertExperience allows optional id.
    // Ideally we drop ID to let DB generate new ones, OR we keep them if we want to preserve?
    // User wants "Add/Delete", so preserving IDs isn't strictly required unless we want to avoid UI jumps.
    // But since we are replacing ALL, new IDs are fine.

    const toInsert = experiences.map(e => {
      // e is InsertExperience, which omits 'id' by definition
      return { ...keysToSnake(e), user_id: userId };
    });

    const { data, error } = await supabaseAdmin
      .from("experiences")
      .insert(toInsert)
      .select()
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return data ? rowsToCamel<Experience>(data) : [];
  }

  // ─── Projects ───────────────────────────────────────────────

  async getProjects(userId: string): Promise<Project[]> {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return data ? rowsToCamel<Project>(data) : [];
  }

  async createProject(userId: string, projData: InsertProject): Promise<Project> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({ ...keysToSnake(projData), user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<Project>(data);
  }

  async updateProject(id: string, userId: string, projData: Partial<InsertProject>): Promise<Project | undefined> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .update(keysToSnake(projData))
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return undefined;
    return data ? keysToCamel<Project>(data) : undefined;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from("projects")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);
    return !error && (count ?? 0) > 0;
  }

  async setProjects(userId: string, projects: InsertProject[]): Promise<Project[]> {
    const { error: deleteError } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    if (projects.length === 0) return [];

    const toInsert = projects.map(p => {
      // p is InsertProject, which omits 'id' by definition
      return { ...keysToSnake(p), user_id: userId };
    });

    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert(toInsert)
      .select()
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return data ? rowsToCamel<Project>(data) : [];
  }

  // ─── Contacts ───────────────────────────────────────────────

  async getContacts(userId: string): Promise<Contact[]> {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .order("notion_row_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    return data ? rowsToCamel<Contact>(data) : [];
  }

  async getContact(id: string, userId: string): Promise<Contact | undefined> {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    return data ? keysToCamel<Contact>(data) : undefined;
  }

  async getContactByEmail(email: string, userId: string): Promise<Contact | undefined> {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("email", email)
      .eq("user_id", userId)
      .single();
    return data ? keysToCamel<Contact>(data) : undefined;
  }

  async createContact(userId: string, contactData: InsertContact): Promise<Contact> {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .insert({ ...keysToSnake(contactData), user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<Contact>(data);
  }

  async updateContact(id: string, userId: string, contactData: Partial<InsertContact>): Promise<Contact | undefined> {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update({ ...keysToSnake(contactData), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return undefined;
    return data ? keysToCamel<Contact>(data) : undefined;
  }

  async deleteContact(id: string, userId: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from("contacts")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);
    return !error && (count ?? 0) > 0;
  }

  /**
   * Hard-delete ALL contacts for a user from the local database.
   * This is a local purge only — Notion is never called or modified.
   * Returns the number of rows deleted.
   */
  async clearAllContacts(userId: string): Promise<number> {
    const { error, count } = await supabaseAdmin
      .from("contacts")
      .delete({ count: "exact" })
      .eq("user_id", userId);
    if (error) throw new Error(`Failed to clear contacts: ${error.message}`);
    return count ?? 0;
  }

  // ─── Campaign Settings ─────────────────────────────────────

  async getCampaignSettings(userId: string): Promise<CampaignSettings | undefined> {
    const { data } = await supabaseAdmin
      .from("campaign_settings")
      .select("*")
      .eq("user_id", userId)
      .single();
    return data ? keysToCamel<CampaignSettings>(data) : undefined;
  }

  async upsertCampaignSettings(userId: string, settingsData: InsertCampaignSettings): Promise<CampaignSettings> {
    const existing = await this.getCampaignSettings(userId);

    const attemptUpdate = async (payload: Record<string, any>): Promise<{ data: any; error: any }> => {
      return supabaseAdmin
        .from("campaign_settings")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select()
        .single();
    };

    if (existing) {
      const full = keysToSnake(settingsData);
      let { data, error } = await attemptUpdate(full);

      // PGRST204 = column not in schema cache (migration not yet applied).
      // Retry without the new column so other settings still save successfully.
      if (error?.code === "PGRST204") {
        console.warn("[Storage] auto_reject_after_days column missing from DB — retrying without it. Run migration to fix permanently.");
        const { auto_reject_after_days: _drop, ...rest } = full;
        ({ data, error } = await attemptUpdate(rest));
      }

      if (error) throw error;
      return keysToCamel<CampaignSettings>(data);
    }

    const full = keysToSnake(settingsData);
    let { data, error } = await supabaseAdmin
      .from("campaign_settings")
      .insert({ ...full, user_id: userId })
      .select()
      .single();

    if (error?.code === "PGRST204") {
      console.warn("[Storage] auto_reject_after_days column missing from DB — retrying insert without it.");
      const { auto_reject_after_days: _drop, ...rest } = full;
      ({ data, error } = await supabaseAdmin
        .from("campaign_settings")
        .insert({ ...rest, user_id: userId })
        .select()
        .single());
    }

    if (error) throw error;
    return keysToCamel<CampaignSettings>(data);
  }


  // ─── Email Sends ───────────────────────────────────────────

  async getEmailSends(userId: string, limit = 50): Promise<EmailSend[]> {
    const { data } = await supabaseAdmin
      .from("email_sends")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ? rowsToCamel<EmailSend>(data) : [];
  }

  async getEmailSendsForContact(userId: string, contactId: string): Promise<EmailSend[]> {
    const { data } = await supabaseAdmin
      .from("email_sends")
      .select("*")
      .eq("user_id", userId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });
    return data ? rowsToCamel<EmailSend>(data) : [];
  }

  async createEmailSend(userId: string, contactId: string, sendData: Partial<EmailSend>): Promise<EmailSend> {
    const { data, error } = await supabaseAdmin
      .from("email_sends")
      .insert({ ...keysToSnake(sendData), user_id: userId, contact_id: contactId })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<EmailSend>(data);
  }

  async updateEmailSend(id: string, sendData: Partial<EmailSend>): Promise<EmailSend | undefined> {
    const { data, error } = await supabaseAdmin
      .from("email_sends")
      .update(keysToSnake(sendData))
      .eq("id", id)
      .select()
      .single();
    if (error) return undefined;
    return data ? keysToCamel<EmailSend>(data) : undefined;
  }

  // ─── Daily Usage ───────────────────────────────────────────

  async getDailyUsage(userId: string, date: string): Promise<DailyUsage | undefined> {
    const { data } = await supabaseAdmin
      .from("daily_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .single();
    return data ? keysToCamel<DailyUsage>(data) : undefined;
  }

  async upsertDailyUsage(userId: string, date: string, usageData: Partial<DailyUsage>): Promise<DailyUsage> {
    const existing = await this.getDailyUsage(userId, date);
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("daily_usage")
        .update(keysToSnake(usageData))
        .eq("user_id", userId)
        .eq("date", date)
        .select()
        .single();
      if (error) throw error;
      return keysToCamel<DailyUsage>(data);
    }
    const { data, error } = await supabaseAdmin
      .from("daily_usage")
      .insert({ ...keysToSnake(usageData), user_id: userId, date })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<DailyUsage>(data);
  }

  // ─── Integrations ──────────────────────────────────────────

  async getIntegration(userId: string, type: string): Promise<Integration | undefined> {
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("type", type)
      .single();
    return data ? keysToCamel<Integration>(data) : undefined;
  }

  async upsertIntegration(userId: string, type: string, integrationData: Partial<Integration>): Promise<Integration> {
    const existing = await this.getIntegration(userId, type);
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("integrations")
        .update({ ...keysToSnake(integrationData), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("type", type)
        .select()
        .single();
      if (error) throw error;
      return keysToCamel<Integration>(data);
    }
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .insert({ ...keysToSnake(integrationData), user_id: userId, type })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<Integration>(data);
  }

  // ─── Activity Log ──────────────────────────────────────────

  async getActivityLog(userId: string, limit = 20): Promise<ActivityLogEntry[]> {
    const { data } = await supabaseAdmin
      .from("activity_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ? rowsToCamel<ActivityLogEntry>(data) : [];
  }

  async createActivityLog(
    userId: string,
    logData: { contactName?: string; action: string; status?: string }
  ): Promise<ActivityLogEntry> {
    const { data, error } = await supabaseAdmin
      .from("activity_log")
      .insert({
        user_id: userId,
        contact_name: logData.contactName || null,
        action: logData.action,
        status: logData.status || null,
      })
      .select()
      .single();
    if (error) throw error;
    return keysToCamel<ActivityLogEntry>(data);
  }

  // ─── Dashboard & Analytics ─────────────────────────────────

  async getDashboardStats(userId: string) {
    const today = new Date().toISOString().split("T")[0];
    const usage = await this.getDailyUsage(userId, today);
    const settings = await this.getCampaignSettings(userId);

    const sentToday = usage?.emailsSent ?? 0;
    const followupsPending = usage?.followupsSent ?? 0;
    const replies = usage?.repliesReceived ?? 0;
    const dailyLimit = settings?.dailyLimit ?? 80;

    return {
      sentToday,
      followupsPending,
      replies,
      dailyLimit,
      used: sentToday,
    };
  }

  async getAnalytics(userId: string, days = 7) {
    const { data } = await supabaseAdmin
      .from("daily_usage")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(days);

    const results = data ? rowsToCamel<DailyUsage>(data) : [];
    const daily = results.reverse().map((r) => ({
      day: r.date,
      sent: r.emailsSent ?? 0,
      replies: r.repliesReceived ?? 0,
    }));

    const totalSent = daily.reduce((a, d) => a + d.sent, 0);
    const totalReplies = daily.reduce((a, d) => a + d.replies, 0);
    const replyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;

    return { daily, totalSent, totalReplies, replyRate };
  }

  async getUsersWithActiveAutomation(): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from("campaign_settings")
      .select("user_id")
      .eq("automation_status", "running");
    return data ? data.map((r: any) => r.user_id) : [];
  }

  async acquireAutomationLock(contactId: string, userId: string, currentStatus: string, lockStatus: string): Promise<boolean> {
    // Atomically update status only if it matches currentStatus
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update({ status: lockStatus, updated_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("user_id", userId)
      .eq("status", currentStatus)
      .select();

    if (error) {
      console.error("[Storage] Failed to acquire lock:", error);
      return false;
    }

    // If data returned, it means the update happened (we got the lock)
    return data && data.length > 0;
  }
}

export const storage = new DatabaseStorage();
