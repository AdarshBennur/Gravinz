import type { Express } from "express";
import { type Server } from "http";
import session from "express-session";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { storage } from "./storage";
import { hashPassword, comparePassword, requireAuth, getSessionUserId } from "./auth";
import {
  insertContactSchema,
  insertCampaignSettingsSchema,
  insertExperienceSchema,
  insertProjectSchema,
  insertUserProfileSchema,
} from "@shared/schema";
import { getGmailAuthUrl, handleGmailCallback, isGmailConfigured } from "./services/gmail";
import { getNotionAuthUrl, handleNotionCallback, listNotionDatabases, importContactsFromNotion, isNotionConfigured } from "./services/notion";
import { generateEmail } from "./services/email-generator";
import { startAutomationScheduler, stopAutomationScheduler } from "./services/automation";
import memorystore from "memorystore";

const MemoryStore = memorystore(session);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";
  app.use(
    session({
      secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

  startAutomationScheduler();

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, password, email, fullName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email: email || null,
        fullName: fullName || null,
      });

      await storage.upsertUserProfile(user.id, {});
      await storage.upsertCampaignSettings(user.id, {});

      req.session.userId = user.id;
      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
    });
  });

  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const [profile, exps, projs] = await Promise.all([
        storage.getUserProfile(userId),
        storage.getExperiences(userId),
        storage.getProjects(userId),
      ]);
      const user = await storage.getUser(userId);
      res.json({
        user: user
          ? { id: user.id, username: user.username, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl }
          : null,
        profile: profile
          ? {
              skills: profile.skills || [],
              roles: profile.targetRoles || [],
              tone: profile.tone || "direct",
              status: profile.currentStatus || "working",
              description: profile.profileDescription || "",
              customPrompt: profile.customPrompt || "",
              resumeUrl: profile.resumeUrl || null,
            }
          : null,
        experiences: exps,
        projects: projs,
      });
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const { skills, roles, tone, status, description, customPrompt } = req.body;
      const profile = await storage.upsertUserProfile(userId, {
        skills: skills ?? undefined,
        targetRoles: roles ?? undefined,
        tone: tone ?? undefined,
        currentStatus: status ?? undefined,
        profileDescription: description ?? undefined,
        customPrompt: customPrompt ?? undefined,
      });
      res.json({
        skills: profile.skills || [],
        roles: profile.targetRoles || [],
        tone: profile.tone || "direct",
        status: profile.currentStatus || "working",
        description: profile.profileDescription || "",
        customPrompt: profile.customPrompt || "",
      });
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/experiences", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const exps = await storage.getExperiences(userId);
      res.json(exps);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/experiences", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const exp = await storage.createExperience(userId, req.body);
      res.status(201).json(exp);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const exp = await storage.updateExperience(req.params.id, userId, req.body);
      if (!exp) return res.status(404).json({ message: "Not found" });
      res.json(exp);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const deleted = await storage.deleteExperience(req.params.id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const projs = await storage.getProjects(userId);
      res.json(projs);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const proj = await storage.createProject(userId, req.body);
      res.status(201).json(proj);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const proj = await storage.updateProject(req.params.id, userId, req.body);
      if (!proj) return res.status(404).json({ message: "Not found" });
      res.json(proj);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const deleted = await storage.deleteProject(req.params.id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const list = await storage.getContacts(userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const contact = await storage.createContact(userId, req.body);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const contact = await storage.updateContact(req.params.id, userId, req.body);
      if (!contact) return res.status(404).json({ message: "Not found" });
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const deleted = await storage.deleteContact(req.params.id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts/import-csv", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;

      if (req.body.contacts && Array.isArray(req.body.contacts)) {
        const csvContacts = req.body.contacts;
        const created = [];
        const errors: string[] = [];

        for (let i = 0; i < csvContacts.length; i++) {
          const c = csvContacts[i];
          try {
            if (!c.name || !c.email) {
              errors.push(`Row ${i + 1}: Missing name or email`);
              continue;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
              errors.push(`Row ${i + 1}: Invalid email "${c.email}"`);
              continue;
            }
            const contact = await storage.createContact(userId, {
              name: c.name,
              email: c.email,
              company: c.company || null,
              role: c.role || null,
              source: "csv",
            } as any);
            created.push(contact);
          } catch (e: any) {
            errors.push(`Row ${i + 1}: ${e.message}`);
          }
        }

        return res.status(201).json({ imported: created.length, errors, contacts: created });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const csvText = req.file.buffer.toString("utf-8");
      let records: any[];

      try {
        records = parse(csvText, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        });
      } catch (e: any) {
        return res.status(400).json({ message: `CSV parse error: ${e.message}` });
      }

      const created = [];
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const name = row.Name || row.name || row["Full Name"] || row.fullName || "";
          const email = row.Email || row.email || row["E-mail"] || "";
          const company = row.Company || row.company || row.Organization || "";
          const role = row.Role || row.role || row.Title || row.Position || row["Job Title"] || "";

          if (!name.trim() || !email.trim()) {
            errors.push(`Row ${i + 2}: Missing name or email`);
            continue;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errors.push(`Row ${i + 2}: Invalid email "${email}"`);
            continue;
          }

          const existingContacts = await storage.getContacts(userId);
          const duplicate = existingContacts.find(
            (c) => c.email.toLowerCase() === email.toLowerCase().trim()
          );
          if (duplicate) {
            errors.push(`Row ${i + 2}: Duplicate email "${email}" - skipped`);
            continue;
          }

          const contact = await storage.createContact(userId, {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            company: company.trim() || null,
            role: role.trim() || null,
            source: "csv",
          } as any);
          created.push(contact);
        } catch (e: any) {
          errors.push(`Row ${i + 2}: ${e.message}`);
        }
      }

      await storage.createActivityLog(userId, {
        action: `Imported ${created.length} contacts from CSV`,
        status: "system",
      });

      res.status(201).json({
        imported: created.length,
        total: records.length,
        skipped: records.length - created.length,
        errors,
        contacts: created,
      });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to import CSV" });
    }
  });

  app.get("/api/campaign-settings", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      let settings = await storage.getCampaignSettings(userId);
      if (!settings) {
        settings = await storage.upsertCampaignSettings(userId, {});
      }
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: settings.followupDelays,
        priority: settings.priorityMode,
        balanced: settings.balancedRatio,
        automationStatus: settings.automationStatus,
        startTime: settings.startTime ?? "09:00",
        timezone: settings.timezone ?? "America/New_York",
      });
    } catch (error: any) {
      console.error("Get campaign settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/campaign-settings", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const { dailyLimit, followups, delays, priority, balanced, startTime, timezone } = req.body;
      const settings = await storage.upsertCampaignSettings(userId, {
        dailyLimit: dailyLimit ?? undefined,
        followupCount: followups ?? undefined,
        followupDelays: delays ?? undefined,
        priorityMode: priority ?? undefined,
        balancedRatio: balanced ?? undefined,
        startTime: startTime ?? undefined,
        timezone: timezone ?? undefined,
      });
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: settings.followupDelays,
        priority: settings.priorityMode,
        balanced: settings.balancedRatio,
        automationStatus: settings.automationStatus,
        startTime: settings.startTime ?? "09:00",
        timezone: settings.timezone ?? "America/New_York",
      });
    } catch (error: any) {
      console.error("Update campaign settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/automation/start", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;

      const gmailIntegration = await storage.getIntegration(userId, "gmail");
      if (!gmailIntegration?.connected) {
        return res.status(400).json({ message: "Please connect Gmail before starting automation" });
      }

      const settings = await storage.upsertCampaignSettings(userId, {
        automationStatus: "running",
      });
      await storage.createActivityLog(userId, {
        action: "Automation started",
        status: "system",
      });
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: settings.followupDelays,
        priority: settings.priorityMode,
        balanced: settings.balancedRatio,
        automationStatus: settings.automationStatus,
      });
    } catch (error: any) {
      console.error("Start automation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/automation/pause", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const settings = await storage.upsertCampaignSettings(userId, {
        automationStatus: "paused",
      });
      await storage.createActivityLog(userId, {
        action: "Automation paused",
        status: "system",
      });
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: settings.followupDelays,
        priority: settings.priorityMode,
        balanced: settings.balancedRatio,
        automationStatus: settings.automationStatus,
      });
    } catch (error: any) {
      console.error("Pause automation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const [stats, activity, settings] = await Promise.all([
        storage.getDashboardStats(userId),
        storage.getActivityLog(userId, 10),
        storage.getCampaignSettings(userId),
      ]);
      res.json({
        stats,
        activity: activity.map((a) => ({
          contact: a.contactName || "System",
          action: a.action,
          createdAt: a.createdAt,
          status: a.status || "",
        })),
        automationStatus: settings?.automationStatus || "paused",
      });
    } catch (error: any) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const days = parseInt(req.query.days as string) || 7;
      const analytics = await storage.getAnalytics(userId, days);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/activity", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await storage.getActivityLog(userId, limit);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const [gmail, notion] = await Promise.all([
        storage.getIntegration(userId, "gmail"),
        storage.getIntegration(userId, "notion"),
      ]);
      res.json({
        gmail: {
          connected: gmail?.connected ?? false,
          email: (gmail?.metadata as any)?.email || null,
          configured: isGmailConfigured(),
        },
        notion: {
          connected: notion?.connected ?? false,
          metadata: notion?.metadata || {},
          configured: isNotionConfigured(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations/gmail/auth-url", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      if (!isGmailConfigured()) {
        return res.status(400).json({ message: "Gmail OAuth not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
      }
      const url = getGmailAuthUrl(userId);
      res.json({ url });
    } catch (error: any) {
      console.error("Gmail auth URL error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/gmail/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        return res.status(400).send("Missing authorization code or state");
      }

      await handleGmailCallback(code, state);

      await storage.createActivityLog(state, {
        action: "Gmail connected via OAuth",
        status: "system",
      });

      res.redirect("/app/integrations?gmail=connected");
    } catch (error: any) {
      console.error("Gmail callback error:", error);
      res.redirect("/app/integrations?gmail=error&message=" + encodeURIComponent(error.message));
    }
  });

  app.post("/api/integrations/gmail/connect", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;

      if (isGmailConfigured()) {
        const url = getGmailAuthUrl(userId);
        return res.json({ authUrl: url, oauth: true });
      }

      const integration = await storage.upsertIntegration(userId, "gmail", {
        connected: true,
      });
      await storage.createActivityLog(userId, {
        action: "Gmail connected",
        status: "system",
      });
      res.json({ connected: true, oauth: false });
    } catch (error: any) {
      console.error("Gmail connect error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/gmail/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      await storage.upsertIntegration(userId, "gmail", {
        connected: false,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      });
      await storage.createActivityLog(userId, {
        action: "Gmail disconnected",
        status: "system",
      });
      res.json({ connected: false });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations/notion/auth-url", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      if (!isNotionConfigured()) {
        return res.status(400).json({ message: "Notion OAuth not configured. Please add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET." });
      }
      const url = getNotionAuthUrl(userId);
      res.json({ url });
    } catch (error: any) {
      console.error("Notion auth URL error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/notion/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        return res.status(400).send("Missing authorization code or state");
      }

      await handleNotionCallback(code, state);

      await storage.createActivityLog(state, {
        action: "Notion connected via OAuth",
        status: "system",
      });

      res.redirect("/app/integrations?notion=connected");
    } catch (error: any) {
      console.error("Notion callback error:", error);
      res.redirect("/app/integrations?notion=error&message=" + encodeURIComponent(error.message));
    }
  });

  app.post("/api/integrations/notion/connect", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;

      if (isNotionConfigured()) {
        const url = getNotionAuthUrl(userId);
        return res.json({ authUrl: url, oauth: true });
      }

      const { databaseId } = req.body;
      const integration = await storage.upsertIntegration(userId, "notion", {
        connected: true,
        metadata: { databaseId },
      });
      await storage.createActivityLog(userId, {
        action: "Notion connected",
        status: "system",
      });
      res.json({ connected: true, oauth: false });
    } catch (error: any) {
      console.error("Notion connect error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/notion/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      await storage.upsertIntegration(userId, "notion", {
        connected: false,
        accessToken: null,
        metadata: {},
      });
      await storage.createActivityLog(userId, {
        action: "Notion disconnected",
        status: "system",
      });
      res.json({ connected: false });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations/notion/databases", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const databases = await listNotionDatabases(userId);
      res.json(databases);
    } catch (error: any) {
      console.error("List Notion databases error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/notion/databases", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const databases = await listNotionDatabases(userId);
      res.json(databases);
    } catch (error: any) {
      console.error("List Notion databases error:", error);
      res.status(500).json({ message: error.message || "Failed to list databases" });
    }
  });

  app.post("/api/integrations/notion/import", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const { databaseId } = req.body;

      if (!databaseId) {
        return res.status(400).json({ message: "Database ID is required" });
      }

      const result = await importContactsFromNotion(userId, databaseId);

      await storage.upsertIntegration(userId, "notion", {
        metadata: { databaseId },
      });

      await storage.createActivityLog(userId, {
        action: `Imported ${result.imported} contacts from Notion`,
        status: "system",
      });

      res.json(result);
    } catch (error: any) {
      console.error("Notion import error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/generate-email", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const { contactId, contactName, contactCompany, contactRole, isFollowup, followupNumber } = req.body;

      const result = await generateEmail({
        userId,
        contactId,
        contactName,
        contactCompany,
        contactRole,
        isFollowup,
        followupNumber,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Email generation error:", error);
      res.status(500).json({ message: "Failed to generate email" });
    }
  });

  app.post("/api/ai/generate-next-steps", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const stats = await storage.getDashboardStats(userId);

      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI();

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an AI cold email advisor. Given the user's current outreach stats, provide 3 brief, actionable next steps to improve their reply rate. Keep each step under 15 words. Return as a JSON array of strings.",
            },
            {
              role: "user",
              content: `Stats: ${stats.sentToday} emails sent today, ${stats.replies} replies, ${stats.followupsPending} follow-ups pending, ${stats.used}/${stats.dailyLimit} daily limit used.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 200,
        });

        const text = completion.choices[0]?.message?.content || "[]";
        let steps: string[];
        try {
          steps = JSON.parse(text);
        } catch {
          steps = ["Tighten target roles", "Refresh subject lines", "Queue follow-ups for warm leads"];
        }

        res.json({ steps });
      } catch (aiError: any) {
        console.error("AI next steps error:", aiError.message);
        res.json({
          steps: [
            "Tighten target roles",
            "Refresh 2 subject lines",
            "Queue follow-ups for warm leads",
          ],
          fallback: true,
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/email-sends", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const limit = parseInt(req.query.limit as string) || 50;
      const sends = await storage.getEmailSends(userId, limit);
      res.json(sends);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/email-sends/contact/:contactId", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const sends = await storage.getEmailSendsForContact(userId, req.params.contactId);
      res.json(sends);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
