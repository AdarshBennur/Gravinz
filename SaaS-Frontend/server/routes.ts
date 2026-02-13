import type { Express } from "express";
import { type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hashPassword, comparePassword, requireAuth, getSessionUserId } from "./auth";
import {
  insertContactSchema,
  insertCampaignSettingsSchema,
  insertExperienceSchema,
  insertProjectSchema,
  insertUserProfileSchema,
} from "@shared/schema";
import memorystore from "memorystore";

const MemoryStore = memorystore(session);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "outbound-ai-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

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
      profile: profile || {},
      experiences: exps,
      projects: projs,
    });
  });

  app.put("/api/profile", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const data = req.body;
    const profile = await storage.upsertUserProfile(userId, data);
    res.json(profile);
  });

  app.get("/api/experiences", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const exps = await storage.getExperiences(userId);
    res.json(exps);
  });

  app.post("/api/experiences", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const exp = await storage.createExperience(userId, req.body);
    res.status(201).json(exp);
  });

  app.put("/api/experiences/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const exp = await storage.updateExperience(req.params.id, userId, req.body);
    if (!exp) return res.status(404).json({ message: "Not found" });
    res.json(exp);
  });

  app.delete("/api/experiences/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const deleted = await storage.deleteExperience(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  });

  app.get("/api/projects", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const projs = await storage.getProjects(userId);
    res.json(projs);
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const proj = await storage.createProject(userId, req.body);
    res.status(201).json(proj);
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const proj = await storage.updateProject(req.params.id, userId, req.body);
    if (!proj) return res.status(404).json({ message: "Not found" });
    res.json(proj);
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const deleted = await storage.deleteProject(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  });

  app.get("/api/contacts", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const list = await storage.getContacts(userId);
    res.json(list);
  });

  app.post("/api/contacts", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const contact = await storage.createContact(userId, req.body);
    res.status(201).json(contact);
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const contact = await storage.updateContact(req.params.id, userId, req.body);
    if (!contact) return res.status(404).json({ message: "Not found" });
    res.json(contact);
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const deleted = await storage.deleteContact(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  });

  app.post("/api/contacts/import-csv", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const { contacts: csvContacts } = req.body;
    if (!Array.isArray(csvContacts)) {
      return res.status(400).json({ message: "contacts must be an array" });
    }

    const created = [];
    for (const c of csvContacts) {
      const contact = await storage.createContact(userId, {
        name: c.name,
        email: c.email,
        company: c.company || null,
        role: c.role || null,
      });
      created.push(contact);
    }

    res.status(201).json({ imported: created.length, contacts: created });
  });

  app.get("/api/campaign-settings", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    let settings = await storage.getCampaignSettings(userId);
    if (!settings) {
      settings = await storage.upsertCampaignSettings(userId, {});
    }
    res.json(settings);
  });

  app.put("/api/campaign-settings", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const settings = await storage.upsertCampaignSettings(userId, req.body);
    res.json(settings);
  });

  app.post("/api/automation/start", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const settings = await storage.upsertCampaignSettings(userId, {
      automationStatus: "running",
    });
    await storage.createActivityLog(userId, {
      action: "Automation started",
      status: "system",
    });
    res.json(settings);
  });

  app.post("/api/automation/pause", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const settings = await storage.upsertCampaignSettings(userId, {
      automationStatus: "paused",
    });
    await storage.createActivityLog(userId, {
      action: "Automation paused",
      status: "system",
    });
    res.json(settings);
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const [stats, activity, settings] = await Promise.all([
      storage.getDashboardStats(userId),
      storage.getActivityLog(userId, 10),
      storage.getCampaignSettings(userId),
    ]);
    res.json({
      stats,
      activity,
      automationStatus: settings?.automationStatus || "paused",
    });
  });

  app.get("/api/analytics", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const days = parseInt(req.query.days as string) || 7;
    const analytics = await storage.getAnalytics(userId, days);
    res.json(analytics);
  });

  app.get("/api/activity", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const limit = parseInt(req.query.limit as string) || 20;
    const activity = await storage.getActivityLog(userId, limit);
    res.json(activity);
  });

  app.get("/api/integrations", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const [gmail, notion] = await Promise.all([
      storage.getIntegration(userId, "gmail"),
      storage.getIntegration(userId, "notion"),
    ]);
    res.json({
      gmail: gmail || { connected: false, type: "gmail" },
      notion: notion || { connected: false, type: "notion" },
    });
  });

  app.post("/api/integrations/gmail/connect", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const integration = await storage.upsertIntegration(userId, "gmail", {
      connected: true,
    });
    await storage.createActivityLog(userId, {
      action: "Gmail connected",
      status: "system",
    });
    res.json(integration);
  });

  app.post("/api/integrations/gmail/disconnect", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const integration = await storage.upsertIntegration(userId, "gmail", {
      connected: false,
      accessToken: null,
      refreshToken: null,
    });
    res.json(integration);
  });

  app.post("/api/integrations/notion/connect", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const { databaseId } = req.body;
    const integration = await storage.upsertIntegration(userId, "notion", {
      connected: true,
      metadata: { databaseId },
    });
    await storage.createActivityLog(userId, {
      action: "Notion connected",
      status: "system",
    });
    res.json(integration);
  });

  app.post("/api/integrations/notion/disconnect", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const integration = await storage.upsertIntegration(userId, "notion", {
      connected: false,
      metadata: {},
    });
    res.json(integration);
  });

  app.post("/api/ai/generate-email", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const { contactId, contactName, contactCompany, contactRole } = req.body;

    const [profile, exps, projs] = await Promise.all([
      storage.getUserProfile(userId),
      storage.getExperiences(userId),
      storage.getProjects(userId),
    ]);
    const user = await storage.getUser(userId);

    const profileContext = `
Name: ${user?.fullName || user?.username || "User"}
Status: ${profile?.currentStatus || "working professional"}
Profile: ${profile?.profileDescription || ""}
Skills: ${(profile?.skills as string[])?.join(", ") || ""}
Target Roles: ${(profile?.targetRoles as string[])?.join(", ") || ""}
Tone: ${profile?.tone || "direct"}

Experience:
${exps.map((e) => `- ${e.role} at ${e.company} (${e.duration}): ${e.description || ""}`).join("\n")}

Projects:
${projs.map((p) => `- ${p.name} (${p.tech}): ${p.impact || ""}`).join("\n")}
`.trim();

    const customPrompt = profile?.customPrompt || "";

    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();

      const systemPrompt = customPrompt
        ? `You are an AI cold email assistant. Use this custom instruction: ${customPrompt}\n\nSender profile:\n${profileContext}`
        : `You are an AI cold email assistant that helps job seekers write personalized, professional cold emails to hiring managers and recruiters. Write short, compelling emails that feel human. Never be salesy or spammy. Match the sender's tone preference.\n\nSender profile:\n${profileContext}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Write a cold email to ${contactName || "a hiring manager"}${contactRole ? ` who is a ${contactRole}` : ""}${contactCompany ? ` at ${contactCompany}` : ""}. Include a subject line on the first line prefixed with "Subject: ", then a blank line, then the email body. Keep it under 150 words.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });

      const response = completion.choices[0]?.message?.content || "";
      const lines = response.split("\n");
      const subjectLine = lines[0]?.replace(/^Subject:\s*/i, "") || "Quick intro";
      const body = lines.slice(1).join("\n").trim();

      res.json({ subject: subjectLine, body, raw: response });
    } catch (error: any) {
      console.error("AI generation error:", error);
      const subject = `Quick question about ${contactRole || "the role"} at ${contactCompany || "your company"}`;
      const body = `Hi ${contactName || "there"},\n\nI came across your profile and was impressed by ${contactCompany || "your company"}'s work. I'm a ${(profile?.skills as string[])?.[0] || "software"} professional with experience in ${(profile?.skills as string[])?.slice(0, 3).join(", ") || "technology"}.\n\nWould you be open to a quick chat about opportunities on your team?\n\nBest,\n${user?.fullName || user?.username || ""}`;
      res.json({ subject, body, fallback: true });
    }
  });

  app.post("/api/ai/generate-next-steps", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const stats = await storage.getDashboardStats(userId);

    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();

      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
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
    } catch (error: any) {
      console.error("AI next steps error:", error);
      res.json({
        steps: [
          "Tighten target roles",
          "Refresh 2 subject lines",
          "Queue follow-ups for warm leads",
        ],
        fallback: true,
      });
    }
  });

  app.get("/api/email-sends", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const limit = parseInt(req.query.limit as string) || 50;
    const sends = await storage.getEmailSends(userId, limit);
    res.json(sends);
  });

  return httpServer;
}
