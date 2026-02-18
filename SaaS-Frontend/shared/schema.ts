import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const contactStatusEnum = pgEnum("contact_status", [
  "not-sent",
  "sent",
  "followup",
  "followup-1",
  "followup-2",
  "replied",
  "bounced",
  "paused",
]);

export const automationStatusEnum = pgEnum("automation_status", [
  "running",
  "paused",
  "stopped",
]);

export const priorityModeEnum = pgEnum("priority_mode", [
  "followups",
  "fresh",
  "balanced",
  "all",
]);

export const emailStatusEnum = pgEnum("email_status", [
  "queued",
  "sent",
  "delivered",
  "opened",
  "replied",
  "bounced",
  "failed",
]);

export const toneEnum = pgEnum("tone_type", [
  "formal",
  "casual",
  "direct",
]);

export const currentStatusEnum = pgEnum("current_status", [
  "student",
  "working",
  "switcher",
  "freelancer",
  "other",
]);

export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  profileDescription: text("profile_description"),
  skills: jsonb("skills").$type<string[]>().default([]),
  targetRoles: jsonb("target_roles").$type<string[]>().default([]),
  tone: toneEnum("tone").default("direct"),
  currentStatus: currentStatusEnum("current_status").default("working"),
  customPrompt: text("custom_prompt"),
  resumeUrl: text("resume_url"),
  resumeOriginalName: text("resume_original_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const experiences = pgTable("experiences", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  company: text("company").notNull(),
  duration: text("duration").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tech: text("tech").notNull(),
  impact: text("impact"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  role: text("role"),
  status: text("status").default("not-sent"), // Changed from enum to text for flexibility
  lastSentAt: timestamp("last_sent_at"),
  notionPageId: text("notion_page_id"),
  source: text("source").default("manual"),
  followupsSent: integer("followups_sent").default(0),
  notes: text("notes"),
  // New columns for Notion import
  firstEmailDate: timestamp("first_email_date"),
  followup1Date: timestamp("followup1_date"),
  followup2Date: timestamp("followup2_date"),
  jobLink: text("job_link"),
  // Dynamic Notion data storage
  notionData: jsonb("notion_data"), // Stores complete Notion row (all columns)
  notionRowOrder: integer("notion_row_order"), // Preserves original Notion row order
  notionColumnOrder: jsonb("notion_column_order"), // Preserves original Notion column order (array of column names)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaignSettings = pgTable("campaign_settings", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  dailyLimit: integer("daily_limit").default(80),
  followupCount: integer("followup_count").default(2),
  followupDelays: jsonb("followup_delays").$type<number[]>().default([2, 4]),
  priorityMode: priorityModeEnum("priority_mode").default("balanced"),
  balancedRatio: integer("balanced_ratio").default(60),
  automationStatus: automationStatusEnum("automation_status").default("paused"),
  startTime: text("start_time").default("09:00"),
  timezone: text("timezone").default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emailSends = pgTable("email_sends", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id", { length: 255 })
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body"),
  status: emailStatusEnum("status").default("queued"),
  followupNumber: integer("followup_number").default(0),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  repliedAt: timestamp("replied_at"),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyUsage = pgTable("daily_usage", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  emailsSent: integer("emails_sent").default(0),
  followupsSent: integer("followups_sent").default(0),
  repliesReceived: integer("replies_received").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  connected: boolean("connected").default(false),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityLog = pgTable("activity_log", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactName: text("contact_name"),
  action: text("action").notNull(),
  status: text("status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  username: true,
  password: true,
  email: true,
  fullName: true,
  avatarUrl: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignSettingsSchema = createInsertSchema(campaignSettings).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExperienceSchema = createInsertSchema(experiences).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type CampaignSettings = typeof campaignSettings.$inferSelect;
export type InsertCampaignSettings = z.infer<typeof insertCampaignSettingsSchema>;
export type Experience = typeof experiences.$inferSelect;
export type InsertExperience = z.infer<typeof insertExperienceSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type EmailSend = typeof emailSends.$inferSelect;
export type DailyUsage = typeof dailyUsage.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
