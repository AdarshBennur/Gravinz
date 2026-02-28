import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Zod-based input validation middleware factory.
 * Validates req.body against the provided schema before the route handler runs.
 * Returns 400 with structured errors on validation failure.
 */
export function validate(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join("."),
                message: e.message,
            }));
            return res.status(400).json({ message: "Validation failed", errors });
        }
        // Replace req.body with parsed + coerced data
        req.body = result.data;
        next();
    };
}

// ────────────────────────────────────────────────────────────────────────────
// SHARED SCHEMAS
// ────────────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
});

export const signupSchema = z.object({
    username: z.string().min(2).max(50),
    password: z.string().min(8).max(200),
    email: z.string().email().max(254).optional().or(z.literal("")),
    fullName: z.string().max(200).optional().or(z.literal("")),
});

export const profileUpdateSchema = z.object({
    skills: z.array(z.string().max(100)).max(50).optional(),
    roles: z.array(z.string().max(100)).max(20).optional(),
    tone: z.string().max(50).optional(),
    status: z.string().max(50).optional(),
    description: z.string().max(5000).optional(),
    promptOverride: z.string().max(10000).optional(),
    linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
    githubUrl: z.string().url().max(500).optional().or(z.literal("")),
    portfolioUrl: z.string().url().max(500).optional().or(z.literal("")),
    experiences: z.array(z.object({
        id: z.string().optional(),
        company: z.string().max(200).optional(),
        role: z.string().max(200).optional(),
        duration: z.string().max(100).optional(),
        highlights: z.string().max(5000).optional(),
    })).max(20).optional(),
    projects: z.array(z.object({
        id: z.string().optional(),
        name: z.string().max(200).optional(),
        description: z.string().max(5000).optional(),
        techStack: z.string().max(500).optional(),
        url: z.string().max(500).optional(),
    })).max(20).optional(),
});

export const campaignSettingsSchema = z.object({
    dailyLimit: z.number().int().min(1).max(500).optional(),
    followups: z.number().int().min(0).max(10).optional(),
    delays: z.array(z.number().int().min(0).max(365)).max(10).optional(),
    autoRejectAfterDays: z.number().int().min(0).max(365).optional().nullable(),
    priority: z.string().max(50).optional(),
    balanced: z.number().min(0).max(1).optional(),
    startTime: z.string().max(10).optional(),
    timezone: z.string().max(100).optional(),
});

export const contactSchema = z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(254),
    company: z.string().max(200).nullable().optional(),
    role: z.string().max(200).nullable().optional(),
    source: z.string().max(50).optional(),
    jobLink: z.string().max(1000).nullable().optional(),
});

export const generateEmailSchema = z.object({
    contactId: z.string().min(1).max(100),
    contactName: z.string().min(1).max(200),
    contactCompany: z.string().max(200).optional(),
    contactRole: z.string().max(200).optional(),
    isFollowup: z.boolean().optional(),
    followupNumber: z.number().int().min(0).max(10).optional(),
});

export const emailTestSendSchema = z.object({
    to: z.string().email().max(254),
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(50000),
});

export const notionImportSchema = z.object({
    databaseId: z.string().min(1).max(200),
    columnMapping: z.record(z.string().max(200)).optional(),
});
