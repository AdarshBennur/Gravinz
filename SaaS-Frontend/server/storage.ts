import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  userProfiles,
  experiences,
  projects,
  contacts,
  campaignSettings,
  emailSends,
  dailyUsage,
  integrations,
  activityLog,
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
} from "@shared/schema";
import { randomUUID } from "crypto";

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

  getProjects(userId: string): Promise<Project[]>;
  createProject(userId: string, data: InsertProject): Promise<Project>;
  updateProject(id: string, userId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;

  getContacts(userId: string): Promise<Contact[]>;
  getContact(id: string, userId: string): Promise<Contact | undefined>;
  createContact(userId: string, data: InsertContact): Promise<Contact>;
  updateContact(id: string, userId: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string, userId: string): Promise<boolean>;

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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async upsertUserProfile(userId: string, data: InsertUserProfile): Promise<UserProfile> {
    const existing = await this.getUserProfile(userId);
    if (existing) {
      const [updated] = await db
        .update(userProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userProfiles.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(userProfiles)
      .values({ ...data, userId })
      .returning();
    return created;
  }

  async getExperiences(userId: string): Promise<Experience[]> {
    return db.select().from(experiences).where(eq(experiences.userId, userId)).orderBy(experiences.sortOrder);
  }

  async createExperience(userId: string, data: InsertExperience): Promise<Experience> {
    const [exp] = await db.insert(experiences).values({ ...data, userId }).returning();
    return exp;
  }

  async updateExperience(id: string, userId: string, data: Partial<InsertExperience>): Promise<Experience | undefined> {
    const [exp] = await db
      .update(experiences)
      .set(data)
      .where(and(eq(experiences.id, id), eq(experiences.userId, userId)))
      .returning();
    return exp;
  }

  async deleteExperience(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(experiences)
      .where(and(eq(experiences.id, id), eq(experiences.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getProjects(userId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.sortOrder);
  }

  async createProject(userId: string, data: InsertProject): Promise<Project> {
    const [proj] = await db.insert(projects).values({ ...data, userId }).returning();
    return proj;
  }

  async updateProject(id: string, userId: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [proj] = await db
      .update(projects)
      .set(data)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return proj;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getContacts(userId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: string, userId: string): Promise<Contact | undefined> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
    return contact;
  }

  async createContact(userId: string, data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values({ ...data, userId }).returning();
    return contact;
  }

  async updateContact(id: string, userId: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    return contact;
  }

  async deleteContact(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getCampaignSettings(userId: string): Promise<CampaignSettings | undefined> {
    const [settings] = await db
      .select()
      .from(campaignSettings)
      .where(eq(campaignSettings.userId, userId));
    return settings;
  }

  async upsertCampaignSettings(userId: string, data: InsertCampaignSettings): Promise<CampaignSettings> {
    const existing = await this.getCampaignSettings(userId);
    if (existing) {
      const [updated] = await db
        .update(campaignSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(campaignSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(campaignSettings)
      .values({ ...data, userId })
      .returning();
    return created;
  }

  async getEmailSends(userId: string, limit = 50): Promise<EmailSend[]> {
    return db
      .select()
      .from(emailSends)
      .where(eq(emailSends.userId, userId))
      .orderBy(desc(emailSends.createdAt))
      .limit(limit);
  }

  async getEmailSendsForContact(userId: string, contactId: string): Promise<EmailSend[]> {
    return db
      .select()
      .from(emailSends)
      .where(and(eq(emailSends.userId, userId), eq(emailSends.contactId, contactId)))
      .orderBy(emailSends.createdAt);
  }

  async createEmailSend(userId: string, contactId: string, data: Partial<EmailSend>): Promise<EmailSend> {
    const [send] = await db
      .insert(emailSends)
      .values({ ...data, userId, contactId } as any)
      .returning();
    return send;
  }

  async updateEmailSend(id: string, data: Partial<EmailSend>): Promise<EmailSend | undefined> {
    const [send] = await db
      .update(emailSends)
      .set(data)
      .where(eq(emailSends.id, id))
      .returning();
    return send;
  }

  async getDailyUsage(userId: string, date: string): Promise<DailyUsage | undefined> {
    const [usage] = await db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)));
    return usage;
  }

  async upsertDailyUsage(userId: string, date: string, data: Partial<DailyUsage>): Promise<DailyUsage> {
    const existing = await this.getDailyUsage(userId, date);
    if (existing) {
      const [updated] = await db
        .update(dailyUsage)
        .set(data)
        .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(dailyUsage)
      .values({ ...data, userId, date } as any)
      .returning();
    return created;
  }

  async getIntegration(userId: string, type: string): Promise<Integration | undefined> {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.type, type)));
    return integration;
  }

  async upsertIntegration(userId: string, type: string, data: Partial<Integration>): Promise<Integration> {
    const existing = await this.getIntegration(userId, type);
    if (existing) {
      const [updated] = await db
        .update(integrations)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(integrations.userId, userId), eq(integrations.type, type)))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(integrations)
      .values({ ...data, userId, type } as any)
      .returning();
    return created;
  }

  async getActivityLog(userId: string, limit = 20): Promise<ActivityLogEntry[]> {
    return db
      .select()
      .from(activityLog)
      .where(eq(activityLog.userId, userId))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);
  }

  async createActivityLog(
    userId: string,
    data: { contactName?: string; action: string; status?: string }
  ): Promise<ActivityLogEntry> {
    const [entry] = await db
      .insert(activityLog)
      .values({ ...data, userId })
      .returning();
    return entry;
  }

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
    const results = await db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.userId, userId))
      .orderBy(desc(dailyUsage.date))
      .limit(days);

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
    const results = await db
      .select({ userId: campaignSettings.userId })
      .from(campaignSettings)
      .where(eq(campaignSettings.automationStatus, "running"));
    return results.map((r) => r.userId);
  }
}

export const storage = new DatabaseStorage();
