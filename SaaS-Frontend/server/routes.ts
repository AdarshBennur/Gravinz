import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { storage } from "./storage";
import { requireAuth, getUserId } from "./auth";
import { supabaseAdmin, createAnonClient } from "./supabase";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  insertContactSchema,
  insertCampaignSettingsSchema,
  insertExperienceSchema,
  insertProjectSchema,
  insertUserProfileSchema,
} from "@shared/schema";
import { getGmailAuthUrl, handleGmailCallback, isGmailConfigured } from "./services/gmail";
import { getNotionAuthUrl, handleNotionCallback, listNotionDatabases, importContactsFromNotion, getDatabaseSchema, isNotionConfigured } from "./services/notion";
import { generateEmail } from "./services/email-generator";
import { startAutomationScheduler, stopAutomationScheduler, repairContactDates, isAutomationRunning, runAutomationCycle } from "./services/automation";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

import { campaignSettings } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startAutomationScheduler();


  // ─── Auth Endpoints (Supabase) ───────────────────────────────────────

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, password, email, fullName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Use email for Supabase Auth (fall back to username@placeholder.local)
      const authEmail = email || `${username}@placeholder.local`;

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: fullName || null },
      });

      if (authError) {
        if (authError.message?.includes("already")) {
          return res.status(409).json({ message: "Username or email already taken" });
        }
        console.error("Supabase auth signup error:", authError);
        return res.status(400).json({ message: authError.message });
      }

      // Create user row in our database (using Supabase Auth UID as id)
      const user = await storage.createUser({
        id: authData.user.id,
        username,
        password: "managed-by-supabase",
        email: email || null,
        fullName: fullName || null,
      });

      await storage.upsertUserProfile(user.id, {});
      await storage.upsertCampaignSettings(user.id, {});

      // Sign in to get tokens
      // Sign in to get tokens using a fresh client (to avoid polluting admin client session)
      const supabaseAnon = createAnonClient();
      const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (signInError || !signInData.session) {
        // User was created but sign-in failed — still return user data
        return res.status(201).json({
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
        });
      }

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    } catch (error: any) {
      console.error("Signup error:", error);

      // Handle database constraint violations (e.g., duplicate username)
      if (error.code === '23505') {
        if (error.message?.includes('username')) {
          return res.status(409).json({ message: "Username already taken" });
        }
        if (error.message?.includes('email')) {
          return res.status(409).json({ message: "Email already registered" });
        }
        return res.status(409).json({ message: "Account already exists" });
      }

      res.status(500).json({ message: "Internal server error" });

    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Look up the user in our DB to get their email for Supabase Auth
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const authEmail = user.email || `${username}@placeholder.local`;

      const supabaseAnon = createAnonClient();
      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (error || !data.session) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  app.post("/api/auth/logout", (_req, res) => {
    // Stateless — frontend clears tokens
    res.json({ message: "Logged out" });
  });

  // OAuth user sync endpoint - creates user record for Google OAuth users
  app.post("/api/auth/oauth-sync", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      console.log("[OAuth Sync] User ID from JWT:", userId);

      // Check if user already exists in database
      const existingUser = await storage.getUser(userId);
      if (existingUser) {
        console.log("[OAuth Sync] User already exists:", existingUser.username);
        return res.json({
          message: "User already synced",
          user: {
            id: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            fullName: existingUser.fullName,
            avatarUrl: existingUser.avatarUrl,
          }
        });
      }

      console.log("[OAuth Sync] User not found, creating new user...");

      // Get user data from Supabase Auth
      const { data: { user: supabaseUser }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (userError || !supabaseUser) {
        console.error("[OAuth Sync] Failed to fetch from Supabase Auth:", userError);
        return res.status(400).json({ message: "Could not fetch user from Supabase" });
      }

      // Extract user details from OAuth provider data
      const email = supabaseUser.email || "";
      const fullName = supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        email.split('@')[0];
      const avatarUrl = supabaseUser.user_metadata?.avatar_url ||
        supabaseUser.user_metadata?.picture || null;

      console.log("[OAuth Sync] Supabase user data:", { email, fullName, avatarUrl });

      // Generate username from email or name
      let username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

      // Ensure username is unique
      let uniqueUsername = username;
      let counter = 1;
      while (true) {
        const existing = await storage.getUserByUsername(uniqueUsername);
        if (!existing) break;
        uniqueUsername = `${username}${counter}`;
        counter++;
      }

      console.log("[OAuth Sync] Creating user with username:", uniqueUsername);

      // Create user record using storage (ensures consistency with getUser)
      const newUser = await storage.createUser({
        id: userId,
        username: uniqueUsername,
        email: email,
        password: "", // OAuth users don't have a password
        fullName: fullName,
        avatarUrl: avatarUrl,
      });

      console.log("[OAuth Sync] User created successfully:", newUser.id);

      res.json({
        message: "User synced successfully",
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.fullName,
          avatarUrl: newUser.avatarUrl,
        }
      });
    } catch (error: any) {
      console.error("[OAuth Sync] Error:", error);
      res.status(500).json({ message: "Failed to sync user", error: error.message });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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
    } catch (error: any) {
      console.error("Get me error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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
            resumeOriginalName: profile.resumeOriginalName || null,
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
      const userId = getUserId(req);
      const { skills, roles, tone, status, description, customPrompt, experiences, projects } = req.body;

      const profilePromise = storage.upsertUserProfile(userId, {
        skills: skills ?? undefined,
        targetRoles: roles ?? undefined,
        tone: tone ?? undefined,
        currentStatus: status ?? undefined,
        profileDescription: description ?? undefined,
        customPrompt: customPrompt ?? undefined,
      });

      const experiencesPromise = Array.isArray(experiences)
        ? storage.setExperiences(userId, experiences)
        : Promise.resolve(undefined);

      const projectsPromise = Array.isArray(projects)
        ? storage.setProjects(userId, projects)
        : Promise.resolve(undefined);

      const [profile, updatedExperiences, updatedProjects] = await Promise.all([
        profilePromise,
        experiencesPromise,
        projectsPromise
      ]);

      res.json({
        skills: profile.skills || [],
        roles: profile.targetRoles || [],
        tone: profile.tone || "direct",
        status: profile.currentStatus || "working",
        description: profile.profileDescription || "",
        customPrompt: profile.customPrompt || "",
        resumeUrl: profile.resumeUrl || null,
        resumeOriginalName: profile.resumeOriginalName || null,
        experiences: updatedExperiences,
        projects: updatedProjects,
      });
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/profile/resume", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = getUserId(req);
      const file = req.file;
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // 1. Ensure bucket exists (idempotent)
      try {
        const { data: buckets } = await supabaseAdmin.storage.listBuckets();
        if (!buckets?.find(b => b.name === "resumes")) {
          await supabaseAdmin.storage.createBucket("resumes", {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
          });
          console.log("Created 'resumes' bucket");
        }
      } catch (bucketError: any) {
        // Ignore likely "already exists" or permissions error, let upload try anyway
        console.warn("Bucket creation/check warning:", bucketError.message);
      }

      // 2. Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from("resumes")
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        return res.status(500).json({ message: "Failed to upload file to storage" });
      }

      // 3. Get Public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from("resumes")
        .getPublicUrl(filePath);

      // 4. Update Profile with URL
      await storage.upsertUserProfile(userId, {
        resumeUrl: publicUrl,
        resumeOriginalName: file.originalname,
      });

      res.json({
        url: publicUrl,
        filename: file.originalname
      });
    } catch (error: any) {
      console.error("Resume upload error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/profile/resume", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const userProfile = await storage.getUserProfile(userId);

      if (userProfile?.resumeUrl) {
        // Attempt to extract the path for deletion
        // Public URL format ends with .../resumes/USER_ID/FILENAME
        const urlParts = userProfile.resumeUrl.split("/resumes/");
        if (urlParts.length > 1) {
          const filePath = urlParts[1];
          // Delete from storage
          const { error: deleteError } = await supabaseAdmin.storage
            .from("resumes")
            .remove([filePath]);

          if (deleteError) {
            console.warn("Storage delete error (non-blocking):", deleteError);
          }
        }
      }

      await storage.upsertUserProfile(userId, {
        resumeUrl: null,
        resumeOriginalName: null,
      });

      res.json({ message: "Resume removed" });
    } catch (error: any) {
      console.error("Resume remove error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/experiences", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const exps = await storage.getExperiences(userId);
      res.json(exps);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/experiences", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const exp = await storage.createExperience(userId, req.body);
      res.status(201).json(exp);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const exp = await storage.updateExperience(req.params.id as string, userId, req.body);
      if (!exp) return res.status(404).json({ message: "Not found" });
      res.json(exp);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const deleted = await storage.deleteExperience(req.params.id as string, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const projs = await storage.getProjects(userId);
      res.json(projs);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const proj = await storage.createProject(userId, req.body);
      res.status(201).json(proj);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const proj = await storage.updateProject(req.params.id as string, userId, req.body);
      if (!proj) return res.status(404).json({ message: "Not found" });
      res.json(proj);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const deleted = await storage.deleteProject(req.params.id as string, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const list = await storage.getContacts(userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const contact = await storage.createContact(userId, req.body);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Clear All Contacts (local DB only — Notion is never touched) ─────
  // IMPORTANT: This route MUST be registered before /api/contacts/:id
  // so Express does not match "clear" as a contact ID param.
  app.delete("/api/contacts/clear", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);

      // Safety: check the DB automationStatus for THIS user.
      // The DB is the single source of truth — if the user paused automation
      // in the UI, the DB reflects that immediately.
      // We do NOT use the in-memory sendCycleRunning flag because it is
      // shared across all users and can be briefly true during a 5-min cron tick.
      const settings = await storage.getCampaignSettings(userId);
      if (settings?.automationStatus === "running") {
        return res.status(409).json({
          message:
            "Automation is currently running. Please pause it before clearing contacts.",
        });
      }

      // Hard-delete all contacts for this user from local DB only.
      // This does NOT call Notion, archive Notion pages, or modify Notion in any way.
      const deleted = await storage.clearAllContacts(userId);

      res.json({ deleted, message: "All contacts cleared from application." });
    } catch (error: any) {
      console.error("[contacts/clear] Error:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);

      // ─── STRICT: Strip all automation-managed fields ──────────────────────────
      // These fields are ONLY written by the automation state machine.
      // A user-facing PUT must NEVER overwrite status, date timestamps, or
      // Notion metadata — doing so would corrupt the state machine invariants.
      const {
        status,
        firstEmailDate,
        followup1Date,
        followup2Date,
        lastSentAt,
        notionPageId,
        createdAt,
        updatedAt,
        id,
        userId: _uid,
        ...userEditableFields
      } = req.body;

      const contact = await storage.updateContact(req.params.id as string, userId, userEditableFields);
      if (!contact) return res.status(404).json({ message: "Not found" });
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const deleted = await storage.deleteContact(req.params.id as string, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts/import-csv", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const userId = getUserId(req);

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
      const userId = getUserId(req);
      let settings = await storage.getCampaignSettings(userId);
      if (!settings) {
        settings = await storage.upsertCampaignSettings(userId, {});
      }
      // autoRejectAfterDays is encoded as followupDelays[2] (no extra DB column needed)
      const rawDelays: number[] = Array.isArray(settings.followupDelays) ? settings.followupDelays : [];
      const clientDelays = rawDelays.slice(0, 2);
      const autoRejectAfterDays = rawDelays[2] !== undefined ? rawDelays[2] : 7;
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: clientDelays,
        autoRejectAfterDays,
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
      const userId = getUserId(req);
      const { dailyLimit, followups, delays, priority, balanced, startTime, timezone, autoRejectAfterDays } = req.body;
      // Pack autoRejectAfterDays as delays[2] so it persists in the existing followup_delays column.
      const packedDelays: number[] = Array.isArray(delays) ? [...delays] : [];
      const rejection = autoRejectAfterDays !== undefined ? Number(autoRejectAfterDays) : 7;
      packedDelays[2] = rejection; // slot 2 is our autoRejectAfterDays store
      const settings = await storage.upsertCampaignSettings(userId, {
        dailyLimit: dailyLimit ?? undefined,
        followupCount: followups ?? undefined,
        followupDelays: packedDelays,
        priorityMode: priority ?? undefined,
        balancedRatio: balanced ?? undefined,
        startTime: startTime ?? undefined,
        timezone: timezone ?? undefined,
      });
      // Decode for response
      const savedDelays: number[] = Array.isArray(settings.followupDelays) ? settings.followupDelays : [];
      res.json({
        dailyLimit: settings.dailyLimit,
        followups: settings.followupCount,
        delays: savedDelays.slice(0, 2),
        autoRejectAfterDays: savedDelays[2] !== undefined ? savedDelays[2] : 7,
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
      const userId = getUserId(req);

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

      // Kick off a cycle immediately — don't make the user wait up to 5 min for cron.
      // Fire-and-forget; errors are caught inside runAutomationCycle.
      setImmediate(() => {
        runAutomationCycle().catch((err: any) =>
          console.error("[Automation] Immediate start cycle error:", err.message)
        );
      });
    } catch (error: any) {
      console.error("Start automation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/automation/pause", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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

  app.post("/api/automation/stop", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.upsertCampaignSettings(userId, {
        automationStatus: "stopped",
      });
      await storage.createActivityLog(userId, {
        action: "Automation stopped",
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
      console.error("Stop automation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // ─── AUTOMATION DEBUG ENDPOINT ─────────────────────────────────────────────
  // Returns full diagnostic state: settings, Gmail, contacts, cycle result.
  app.get("/api/automation/debug-run", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.getCampaignSettings(userId);
      const gmailIntegration = await storage.getIntegration(userId, "gmail");
      const contacts = await storage.getContacts(userId);
      const today = new Date().toISOString().split("T")[0];
      const usage = await storage.getDailyUsage(userId, today);

      // Run startTime check manually
      let isAfterStart = true;
      let startCheckDetail = "";
      if (settings) {
        const startTime = settings.startTime || "09:00";
        const tz = settings.timezone || "America/New_York";
        try {
          const now = new Date();
          const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
          const parts = formatter.formatToParts(now);
          const currentHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
          const currentMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
          const [startHour, startMinute] = startTime.split(":").map(Number);
          const currentMins = currentHour * 60 + currentMinute;
          const startMins = startHour * 60 + startMinute;
          isAfterStart = currentMins >= startMins;
          startCheckDetail = `currentTime=${currentHour}:${String(currentMinute).padStart(2, "0")} (${tz}), startTime=${startTime}, currentMins=${currentMins}, startMins=${startMins}`;
        } catch (e: any) { startCheckDetail = `ERROR: ${e.message}`; }
      }

      const diag = {
        userId,
        serverTime: new Date().toISOString(),
        settings: settings ? {
          automationStatus: settings.automationStatus,
          startTime: settings.startTime,
          timezone: settings.timezone,
          dailyLimit: settings.dailyLimit,
          followupCount: settings.followupCount,
          followupDelays: settings.followupDelays,
        } : null,
        isAfterStartTime: isAfterStart,
        startTimeCheck: startCheckDetail,
        gmail: { connected: gmailIntegration?.connected ?? false },
        dailyUsage: { today, sentToday: usage?.emailsSent ?? 0, limit: settings?.dailyLimit ?? 80 },
        contacts: contacts.map(c => ({ id: c.id, email: c.email, status: c.status, firstEmailDate: c.firstEmailDate })),
        contactCount: contacts.length,
        contactStatusBreakdown: contacts.reduce((acc: Record<string, number>, c) => {
          const s = c.status || "null";
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {}),
      };

      // Now actually run the cycle
      let cycleError: string | null = null;
      try {
        await runAutomationCycle();
      } catch (e: any) { cycleError = e.message; }

      res.json({ diag, cycleError, message: "Cycle triggered. Check server terminal for [AUTOMATION DEBUG] logs." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── DATA REPAIR ENDPOINT ──────────────────────────────────────────────────
  // Fixes corrupted contacts from Notion imports where status is set but dates are NULL.
  // Call this once to repair existing data inconsistencies.
  app.post("/api/automation/repair-dates", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      console.log(`[Data Repair] Starting repair for user: ${userId}`);
      const result = await repairContactDates(userId);
      res.json({
        message: `Repaired ${result.repaired} contacts`,
        repaired: result.repaired,
        details: result.details,
      });
    } catch (error: any) {
      console.error("Repair dates error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {

    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 7;
      const analytics = await storage.getAnalytics(userId, days);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/activity", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await storage.getActivityLog(userId, limit);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);

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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);

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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const databases = await listNotionDatabases(userId);
      res.json(databases);
    } catch (error: any) {
      console.error("List Notion databases error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get Notion database schema (columns) for mapping
  app.get("/api/integrations/notion/schema/:databaseId", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const databaseId = Array.isArray(req.params.databaseId) ? req.params.databaseId[0] : req.params.databaseId;

      if (!databaseId) {
        return res.status(400).json({ message: "Database ID is required" });
      }

      const schema = await getDatabaseSchema(userId, databaseId);
      res.json(schema);
    } catch (error: any) {
      console.error("Get Notion schema error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/notion/import", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { databaseId, columnMapping } = req.body;

      if (!databaseId) {
        return res.status(400).json({ message: "Database ID is required" });
      }

      // Import with column mapping if provided
      const result = await importContactsFromNotion(userId, databaseId, columnMapping);

      // Store both database ID and column mapping
      await storage.upsertIntegration(userId, "notion", {
        metadata: {
          databaseId,
          columnMapping: columnMapping || null
        },
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

  // Sync endpoint - re-imports from the stored Notion database
  app.post("/api/integrations/notion/sync", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);

      // Get the stored database ID from integration metadata
      const integration = await storage.getIntegration(userId, "notion");

      if (!integration || !integration.metadata?.databaseId) {
        return res.status(400).json({ message: "No Notion database configured. Please import a database first." });
      }

      const databaseId = integration.metadata.databaseId;
      const columnMapping = integration.metadata.columnMapping || undefined;

      console.log(`[Notion Sync] Syncing database ${databaseId} for user ${userId}`);
      if (columnMapping) {
        console.log(`[Notion Sync] Using stored column mapping:`, columnMapping);
      }

      const result = await importContactsFromNotion(userId, databaseId, columnMapping);

      await storage.createActivityLog(userId, {
        action: `Synced ${result.imported} contacts from Notion`,
        status: "system",
      });

      res.json(result);
    } catch (error: any) {
      console.error("Notion sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/generate-email", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const stats = await storage.getDashboardStats(userId);

      try {
        const OpenAI = (await import("openai" as any)).default;
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

  app.get("/api/inbox/threads", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const search = (req.query.search as string || "").toLowerCase();
      const allContacts = await storage.getContacts(userId);
      const allSends = await storage.getEmailSends(userId, 10000);

      const sendsByContact = new Map<string, typeof allSends>();
      for (const send of allSends) {
        const arr = sendsByContact.get(send.contactId) || [];
        arr.push(send);
        sendsByContact.set(send.contactId, arr);
      }

      const threads = allContacts
        .filter((c) => {
          if (!search) return true;
          return (
            c.name?.toLowerCase().includes(search) ||
            c.email?.toLowerCase().includes(search) ||
            c.company?.toLowerCase().includes(search)
          );
        })
        .map((contact) => {
          const sends = sendsByContact.get(contact.id) || [];
          const latestSend = sends.length > 0 ? sends[sends.length - 1] : null;
          const hasReply = sends.some((s) => s.status === "replied" || s.repliedAt);
          const delivered = sends.filter((s) => s.status === "sent" || s.status === "delivered" || s.status === "opened" || s.status === "replied").length;
          const opened = sends.filter((s) => s.status === "opened" || s.status === "replied" || s.openedAt).length;
          const replied = sends.filter((s) => s.status === "replied" || s.repliedAt).length;

          // STRICT SINGLE SOURCE OF TRUTH:
          // For Notion contacts: display the raw Notion status from notionData
          // (this matches what the Contacts page renders via dynamic columns)
          // For non-Notion contacts: use contact.status from the database
          const notionData = (contact as any).notionData as Record<string, any> | null;
          let displayStatus = contact.status;
          if (contact.source === "notion" && notionData) {
            const statusKey = Object.keys(notionData).find(k => k.toLowerCase() === "status")
              || Object.keys(notionData).find(k => k.toLowerCase() === "state");
            if (statusKey && notionData[statusKey]) {
              displayStatus = notionData[statusKey];
            }
          }

          const threadObj = {
            contactId: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            role: contact.role,
            status: displayStatus, // Notion value or DB value
            source: contact.source,
            notionRowOrder: (contact as any).notionRowOrder ?? null, // Sl No. value — used for sort
            lastMessage: latestSend
              ? {
                subject: latestSend.subject,
                bodyPreview: (latestSend.body || "").substring(0, 100),
                sentAt: latestSend.sentAt,
                status: latestSend.status,
                followupNumber: latestSend.followupNumber,
              }
              : null,
            unread: hasReply && contact.status === "replied",
            messageCount: sends.length,
            analytics: { delivered, opened, replied },
          };

          return threadObj;
        })
        // Sort by Sl No. (notionRowOrder) ASC — exact Notion-controlled order.
        // Contacts without a Sl No. (manually added) are placed last.
        .sort((a, b) => {
          const aOrder = a.notionRowOrder;
          const bOrder = b.notionRowOrder;
          if (aOrder === null && bOrder === null) return 0;
          if (aOrder === null) return 1;   // nulls last
          if (bOrder === null) return -1;  // nulls last
          return aOrder - bOrder;
        });

      // Log sorted order for verification — visible in server terminal
      console.log(`[Inbox] ${threads.length} threads ordered by Sl No.:`,
        threads.map(t => `${t.notionRowOrder ?? 'manual'}→${t.email}`).join(', '));

      res.json(threads);
    } catch (error: any) {
      console.error("Inbox threads error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox/threads/:contactId", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const contactId = req.params.contactId as string;
      const contact = await storage.getContact(contactId, userId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const sends = await storage.getEmailSendsForContact(userId, contactId as string);
      const delivered = sends.filter((s) => s.status === "sent" || s.status === "delivered" || s.status === "opened" || s.status === "replied").length;
      const opened = sends.filter((s) => s.status === "opened" || s.status === "replied" || s.openedAt).length;
      const replied = sends.filter((s) => s.status === "replied" || s.repliedAt).length;

      const thread = sends.map((s) => ({
        id: s.id,
        subject: s.subject,
        body: s.body,
        status: s.status,
        followupNumber: s.followupNumber,
        sentAt: s.sentAt,
        openedAt: s.openedAt,
        repliedAt: s.repliedAt,
        gmailThreadId: s.gmailThreadId,
        direction: "outbound" as const,
      }));

      // Use raw Notion status if available (matches Contacts page display)
      const detailNotionData = (contact as any).notionData as Record<string, any> | null;
      let detailDisplayStatus = contact.status;
      if (contact.source === "notion" && detailNotionData) {
        const statusKey = Object.keys(detailNotionData).find(k => k.toLowerCase() === "status")
          || Object.keys(detailNotionData).find(k => k.toLowerCase() === "state");
        if (statusKey && detailNotionData[statusKey]) {
          detailDisplayStatus = detailNotionData[statusKey];
        }
      }

      res.json({
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          company: contact.company,
          role: contact.role,
          status: detailDisplayStatus,
          source: contact.source,
          followupsSent: contact.followupsSent,
          lastSentAt: contact.lastSentAt,
          createdAt: contact.createdAt,
        },
        thread,
        analytics: { delivered, opened, replied, total: sends.length },
      });
    } catch (error: any) {
      console.error("Inbox thread detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/email-sends", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const sends = await storage.getEmailSends(userId, limit);
      res.json(sends);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/email-sends/contact/:contactId", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sends = await storage.getEmailSendsForContact(userId, req.params.contactId as string);
      res.json(sends);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });


  return httpServer;
}
