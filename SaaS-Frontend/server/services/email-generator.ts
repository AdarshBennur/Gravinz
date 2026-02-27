import { storage } from "../storage.ts";

interface EmailGenerationInput {
  userId: string;
  contactId?: string;
  contactName: string;
  contactCompany?: string;
  contactRole?: string;
  appliedRole?: string;    // Notion "Applied" column — job role the sender applied for
  companyType?: string;    // Notion "Company Type" column — e.g. SaaS, Fintech, Startup
  jobLink?: string;        // Notion "Job Link" column — URL of the job posting (optional)
  isFollowup: boolean;
  followupNumber: number;
  resumeUrl?: string;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  fallback?: boolean;
}

async function buildProfileContext(userId: string): Promise<string> {
  const [user, profile, exps, projs] = await Promise.all([
    storage.getUser(userId),
    storage.getUserProfile(userId),
    storage.getExperiences(userId),
    storage.getProjects(userId),
  ]);

  const lines: string[] = [];
  lines.push(`## Sender Profile`);
  lines.push(`Name: ${user?.fullName || user?.username || "User"}`);
  lines.push(`Current Status: ${profile?.currentStatus || "Job Seeker"}`);
  if (profile?.profileDescription) lines.push(`Bio: ${profile.profileDescription}`);
  if ((profile?.skills as string[])?.length) lines.push(`Key Skills: ${(profile!.skills as string[]).join(", ")}`);
  if ((profile?.targetRoles as string[])?.length) lines.push(`Target Roles: ${(profile!.targetRoles as string[]).join(", ")}`);
  lines.push(`Preferred Tone: ${profile?.tone || "professional but conversational"}`);
  if (profile?.customPrompt) lines.push(`\n## Custom User Instructions\n${profile.customPrompt}`);

  // Structured profile links — only include non-empty fields
  const linkLines: string[] = [];
  if ((profile as any)?.linkedinUrl) linkLines.push(`LinkedIn: ${(profile as any).linkedinUrl}`);
  if ((profile as any)?.githubUrl) linkLines.push(`GitHub: ${(profile as any).githubUrl}`);
  if ((profile as any)?.portfolioUrl) linkLines.push(`Portfolio: ${(profile as any).portfolioUrl}`);
  if (linkLines.length > 0) {
    lines.push(`\n## Profile Links (include naturally if relevant — AI decides placement)`);
    lines.push(...linkLines);
  }

  if (profile?.resumeUrl) {
    // In a real scenario, we'd fetch and parse the resume text here.
    // For now, we'll note it's available.
    lines.push(`\n## Resume\n[Resume verified and available]`);
  }

  if (exps.length > 0) {
    lines.push("\n## Experience");
    for (const e of exps) {
      lines.push(`- **${e.role}** at **${e.company}** (${e.duration}): ${e.description || ""}`);
    }
  }

  if (projs.length > 0) {
    lines.push("\n## Key Projects");
    for (const p of projs) {
      lines.push(`- **${p.name}** (${p.tech}): ${p.impact || ""}`);
    }
  }

  return lines.join("\n");
}

async function getPreviousEmails(userId: string, contactId: string): Promise<string> {
  const sends = await storage.getEmailSendsForContact(userId, contactId);
  if (sends.length === 0) return "";

  const lines: string[] = ["\n## Interaction History"];
  for (const send of sends) {
    lines.push(`\n--- Sent on ${send.sentAt ? new Date(send.sentAt).toLocaleDateString() : "Unknown Date"} ---`);
    lines.push(`Subject: ${send.subject}`);
    lines.push(`Body: ${send.body}`);
  }

  return lines.join("\n");
}

export async function generateEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  const { userId, contactId, contactName, contactCompany, contactRole, appliedRole, companyType, jobLink, isFollowup, followupNumber, resumeUrl } = input;

  const profileContext = await buildProfileContext(userId);

  let interactionContext = "";
  if (contactId) {
    interactionContext = await getPreviousEmails(userId, contactId);
  }

  const recipientContext = `
  ## Recipient Details
  Name: ${contactName}
  Role: ${contactRole || "Hiring Manager"}
  Company: ${contactCompany || "Unknown Company"}
  ${companyType ? `Company Type: ${companyType}` : ""}
  ${appliedRole ? `Applied For: ${appliedRole}` : ""}
  Type: ${isFollowup ? `Follow-up #${followupNumber}` : "First Connection"}
  ${interactionContext}
  `;

  // Explicitly note resume attachment in context for AI
  const resumeContext = resumeUrl ? "\nRESUME: A PDF resume is attached to this email. You MUST mention it." : "";

  try {
    const OpenAI = (await import("openai")).default;
    const apiKey = process.env.OPENAI_API_KEY;
    console.log(`[Email Generator] Initializing OpenAI. Key present: ${!!apiKey}`);

    if (!apiKey) {
      throw new Error("OpenAI API key missing");
    }

    const openai = new OpenAI({ apiKey });


    const systemPrompt = `
    You are an expert career outreach assistant processing a job application email.

    ## Your Goal
    Write a highly personalized, human-sounding cold email (or follow-up) from the Sender to the Recipient.

    ## Rules
    1. **Analyze First**: Before writing, reason about how the Sender's experience fits the Recipient's company/role.
    2. **No Templates**: Do not use generic placeholders like "[Company Name]". Use provided data.
    3. **Be Specific**: Reference specific projects or skills from the Sender that matter to *this* Recipient.
    4. **Tone**: Match the Sender's preference.
    5. **Length**: Keep it concise (under 150 words).
    6. **Follow-ups**: If this is a follow-up, acknowledge previous silence politely but pivot to a new value add. Do NOT just say "checking in".
    7. **Resume**: ${resumeUrl ? "You MUST mention that you have attached your resume." : "Do not mention a resume integration logic error."}
    8. **Formatting**: Return JSON with "reasoning", "subject", and "body".
    9. **Structure**: Body must be PLAIN TEXT only. Use \n\n for paragraph breaks. Do NOT use any HTML tags. No markup whatsoever.
    10. **NO CLOSING**: Do NOT write any closing phrase or sign-off. Do NOT write "Best", "Best regards", "Thanks", "Sincerely", "Cheers", or the sender's name. The system appends the signature automatically. Stop the body at the last content sentence.

    ## Applied Role (if provided)
    ${appliedRole
        ? `The sender has already applied for the "${appliedRole}" role at the recipient's company.
         Naturally embed a sentence like: "I recently applied for the ${appliedRole} role at ${contactCompany || "your company"}." early in the email.
         Frame the outreach as a follow-through on that application, not a blind cold email.
         ${jobLink
          ? `The job posting URL is: ${jobLink}
              Include this link naturally in the email body — e.g. in a sentence like
              "I came across the role here: ${jobLink}" or mention it as a reference at the end of the email.
              Do NOT fabricate or alter the URL in any way.`
          : "No job posting link is available — do NOT invent or guess a URL. The role may not be publicly posted yet, which is fine."}`
        : "No specific applied role — write as a general networking/outreach email. Do NOT mention any job link."}

    ## Company Type Guidance (if provided)
    ${companyType ? `The recipient's company is categorized as: "${companyType}".
    Use this to influence your tone and which of the sender's strengths you highlight:
    - SaaS: emphasise scalability, product thinking, fast iteration, API integrations.
    - Fintech: emphasise reliability, security awareness, compliance sensitivity, precision.
    - Startup: emphasise ownership, breadth, velocity, wearing multiple hats, autonomy.
    - IT Services / IT Consulting: emphasise delivery, project management, client-facing skills, on-time execution.
    - Product: emphasise user empathy, roadmap prioritisation, cross-functional collaboration.
    - E-commerce: emphasise conversion, performance, data-driven decisions.
    - For any other type: extract the most relevant signal and match the sender's skills accordingly.` : ""}

    ## Recruiter-Optimised Format (when recipient role contains "Recruiter", "Talent Acquisition", or "HR")
    ${(contactRole || "").match(/recruiter|talent acquisition|hr/i)
        ? `The recipient is a recruiter or HR professional — not a hiring manager.
         Use this compact structure (no exceptions):
         Line 1 (intro): One sentence — who you are and what you do.
         Lines 2-4 (achievements): 2-3 quantified bullet-style achievements (use plain text dashes, not bullet symbols).
         Last line (CTA): One sentence — invite a call, chat, or ask for referral to the right team.
         After CTA line: If GitHub or LinkedIn profile links are available in the Sender Profile, mention them naturally.
         Keep total word count under 100 words.`
        : "Use standard networking/outreach email structure."}

    ## Input Data
    ${profileContext}
    ${recipientContext}
    ${resumeContext}
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate the ${isFollowup ? `Follow-up email #${followupNumber}` : "First cold email"} for ${contactName}${resumeUrl ? " (Resume Attached)" : ""}.` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content generated");

    const parsed = JSON.parse(content);

    // ── BULLETPROOF BODY CLEANING ─────────────────────────────────
    // Using placeholder method: this CANNOT fail regardless of how
    // the AI formats newlines in its JSON response.
    //
    // Step 1: Start with raw body, strip quotes
    let bodyText = (parsed.body || "").replace(/^"|"$/g, "");

    // Step 2: Normalize ALL line endings first
    bodyText = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Step 3: Convert literal \n sequences (backslash + n) to real newlines
    // OpenAI JSON mode sometimes uses \\n in the JSON string value
    bodyText = bodyText.replace(/\\n/g, "\n");

    // Step 4: Strip any HTML tags the AI emitted
    bodyText = bodyText
      .replace(/<p[^>]*>/gi, "")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    // Step 5: Collapse 3+ newlines → exactly 2
    bodyText = bodyText.replace(/\n{3,}/g, "\n\n");

    // Step 6: PLACEHOLDER METHOD — remove ALL single \n inside paragraphs
    // This is the critical step. Protect paragraph breaks, kill everything else.
    const PARA_MARKER = "%%PARA_BREAK%%";
    bodyText = bodyText
      .replace(/\n\n/g, PARA_MARKER)  // protect paragraph breaks
      .replace(/\n/g, " ")            // kill ALL remaining single \n
      .replace(/%%PARA_BREAK%%/g, "\n\n");  // restore paragraph breaks

    // Step 7: Clean up spaces
    bodyText = bodyText.replace(/ {2,}/g, " ");

    // Step 8: Trim each paragraph
    const cleanBody = bodyText
      .split("\n\n")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      .join("\n\n")
      // Strip any AI-generated closing phrases
      .replace(/\n\n(Best\b[^\n]*|Thanks\b[^\n]*|Sincerely\b[^\n]*|Cheers\b[^\n]*|Warm regards\b[^\n]*|Kind regards\b[^\n]*)\n[^\n]*/gi, "")
      .replace(/\n\n(Best\b[^\n]*|Thanks\b[^\n]*|Sincerely\b[^\n]*|Cheers\b[^\n]*|Warm regards\b[^\n]*|Kind regards\b[^\n]*)/gi, "")
      .trim();

    // Retrieve sender's full name for the hard-coded signature.
    // Falls back to username, then empty string — never a hardcoded name.
    const senderUser = await storage.getUser(userId);
    const senderName = senderUser?.fullName?.trim() || senderUser?.username?.trim() || "";

    // Hard-append deterministic signature — AI must never control this.
    // Format: two blank lines → closing phrase → newline → name.
    const bodyWithSignature = `${cleanBody}\n\nBest regards,\n${senderName}`;

    console.log(`[AI Reasoned]: ${parsed.reasoning}`);
    // DIAGNOSTIC: show raw vs clean to identify wrapping source
    console.log(`[RAW AI BODY]:\n${parsed.body}`);
    console.log(`[CLEAN BODY SENT]:\n${bodyWithSignature}`);

    return {
      subject: parsed.subject,
      body: bodyWithSignature,
      fallback: false,
    };

  } catch (error: any) {
    console.error("AI Generation failed:", error.message);
    throw new Error("Failed to generate email via AI (Strict Mode: Fallback Disabled).");
  }
}

function generateFallbackEmail(input: EmailGenerationInput, profileContext: string): GeneratedEmail {
  const { contactName, contactCompany, contactRole, isFollowup, followupNumber } = input;
  const skills = profileContext.match(/Key Skills: (.+)/)?.[1]?.split(", ") || ["technology"];
  const nameLine = profileContext.match(/Name: (.+)/)?.[1] || "User";

  // Clean up name if it captured too much
  const name = nameLine.split("\n")[0].trim();

  if (isFollowup) {
    const followupTemplates = [
      {
        subject: `Re: Quick question about ${contactRole || "the role"} at ${contactCompany || "your company"}`,
        body: `Hi ${contactName || "there"},\n\nJust wanted to follow up on my previous email. I understand you're busy, but I'd love the chance to share how my experience in ${skills[0] || "this field"} could contribute to your team.\n\nWould a brief 10-minute call work this week?`,
      },
      {
        subject: `Re: Following up - ${contactCompany || "opportunity"}`,
        body: `Hi ${contactName || "there"},\n\nCircling back on my earlier note. I've been following ${contactCompany || "your company"}'s recent work and am genuinely excited about the direction you're heading.\n\nI'd appreciate even a brief response — happy to share more about my background if helpful.`,
      },
    ];
    const template = followupTemplates[((followupNumber || 1) - 1) % followupTemplates.length];
    return { ...template, fallback: true };
  }

  const subject = `Quick question about ${contactRole || "the role"} at ${contactCompany || "your company"}`;
  const body = `Hi ${contactName || "there"},\n\nI came across your profile and was impressed by ${contactCompany || "your company"}'s work. I'm a ${skills[0] || "software"} professional with experience in ${skills.slice(0, 3).join(", ") || "technology"}.\n\nWould you be open to a quick chat about opportunities on your team?`;

  return { subject, body, fallback: true };
}
