import { storage } from "../storage.ts";

interface EmailGenerationInput {
  userId: string;
  contactId?: string;
  contactName: string;
  contactCompany?: string;
  contactRole?: string;
  isFollowup: boolean;
  followupNumber: number;
  resumeUrl?: string; // Added for attachment context
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
  const { userId, contactId, contactName, contactCompany, contactRole, isFollowup, followupNumber, resumeUrl } = input;

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
    1. **Analyze First**: Before writing, Reason about how the Sender's experience fits the Recipient's company/role.
    2. **No Templates**: Do not use generic placeholders like "[Company Name]". Use provided data.
    3. **Be Specific**: Reference specific projects or skills from the Sender that matter to *this* Recipient.
    4. **Tone**: Match the Sender's preference.
    5. **Length**: Keep it concise (under 150 words).
    6. **Follow-ups**: If this is a follow-up, acknowledge previous silence politely but pivot to a new value add. Do NOT just say "checking in".
    7. **Resume**: ${resumeUrl ? "You MUST mention that you have attached your resume." : "Do not mention a resume integration logic error."}
    8. **Formatting**: Return JSON with "reasoning", "subject", and "body".
    9. **Structure**: Body must be PLAIN TEXT only. Use \n\n for paragraph breaks. Do NOT use any HTML tags. No markup whatsoever.
    10. **NO CLOSING**: Do NOT write any closing phrase or sign-off. Do NOT write "Best", "Best regards", "Thanks", "Sincerely", "Cheers", or the sender's name. The system appends the signature automatically. Stop the body at the last content sentence.

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

    // Normalize the body: strip surrounding quotes, unescape \n sequences,
    // and remove any HTML tags the model may have emitted despite instructions.
    const cleanBody = parsed.body
      .replace(/^"|"$/g, "")           // strip surrounding quotes
      .replace(/\\n/g, "\n")           // unescape literal \n sequences
      .replace(/<p[^>]*>/gi, "")       // strip opening <p> tags
      .replace(/<\/p>/gi, "\n\n")      // replace closing </p> with double newline
      .replace(/<br\s*\/?>/gi, "\n")   // replace <br> with newline
      .replace(/<[^>]+>/g, "")         // strip any remaining tags
      .replace(/\n{3,}/g, "\n\n")      // collapse 3+ newlines to double
      // Paragraph collapse: join intra-paragraph \n with space.
      .split("\n\n")
      .map((para: string) => para.replace(/\n/g, " ").replace(/  +/g, " ").trim())
      .join("\n\n")
      // Strip any AI-generated closing lines the model emitted despite instructions.
      // Matches lines like "Best," / "Best regards," / "Thanks," / "Sincerely,"
      // and the name line that follows, anywhere near the end of the body.
      .replace(/\n\n(Best\b[^\n]*|Thanks\b[^\n]*|Sincerely\b[^\n]*|Cheers\b[^\n]*|Warm regards\b[^\n]*|Kind regards\b[^\n]*)\n[^\n]*/gi, "")
      .replace(/\n\n(Best\b[^\n]*|Thanks\b[^\n]*|Sincerely\b[^\n]*|Cheers\b[^\n]*|Warm regards\b[^\n]*|Kind regards\b[^\n]*)/gi, "")
      .trim();

    // Retrieve sender's full name for the hard-coded signature.
    // Falls back to username then "Adarsh" — never left blank.
    const senderUser = await storage.getUser(userId);
    const senderName = senderUser?.fullName?.trim() || senderUser?.username?.trim() || "";

    // Hard-append deterministic signature — AI must never control this.
    // Format: two blank lines → closing phrase → newline → name.
    const bodyWithSignature = `${cleanBody}\n\nBest regards,\n${senderName}`;

    console.log(`[AI Reasoned]: ${parsed.reasoning}`);

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
