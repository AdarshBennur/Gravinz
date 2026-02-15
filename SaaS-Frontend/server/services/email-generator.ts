import { storage } from "../storage";

interface EmailGenerationInput {
  userId: string;
  contactId?: string;
  contactName: string;
  contactCompany?: string;
  contactRole?: string;
  isFollowup?: boolean;
  followupNumber?: number;
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
  lines.push(`Name: ${user?.fullName || user?.username || "User"}`);
  lines.push(`Status: ${profile?.currentStatus || "working professional"}`);
  if (profile?.profileDescription) lines.push(`Profile: ${profile.profileDescription}`);
  if ((profile?.skills as string[])?.length) lines.push(`Skills: ${(profile!.skills as string[]).join(", ")}`);
  if ((profile?.targetRoles as string[])?.length) lines.push(`Target Roles: ${(profile!.targetRoles as string[]).join(", ")}`);
  lines.push(`Tone: ${profile?.tone || "direct"}`);

  if (exps.length > 0) {
    lines.push("\nExperience:");
    for (const e of exps) {
      lines.push(`- ${e.role} at ${e.company} (${e.duration}): ${e.description || ""}`);
    }
  }

  if (projs.length > 0) {
    lines.push("\nProjects:");
    for (const p of projs) {
      lines.push(`- ${p.name} (${p.tech}): ${p.impact || ""}`);
    }
  }

  return lines.join("\n");
}

async function getPreviousEmails(userId: string, contactId: string): Promise<string> {
  const sends = await storage.getEmailSendsForContact(userId, contactId);
  if (sends.length === 0) return "";

  const lines: string[] = ["Previous emails sent to this contact:"];
  for (const send of sends) {
    lines.push(`\n--- Email ${send.followupNumber === 0 ? "(Initial)" : `(Follow-up ${send.followupNumber})`} ---`);
    lines.push(`Subject: ${send.subject}`);
    lines.push(`Body: ${send.body}`);
    if (send.sentAt) lines.push(`Sent: ${new Date(send.sentAt).toLocaleDateString()}`);
  }

  return lines.join("\n");
}

export async function generateEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  const { userId, contactId, contactName, contactCompany, contactRole, isFollowup, followupNumber } = input;

  const profileContext = await buildProfileContext(userId);
  const profile = await storage.getUserProfile(userId);
  const customPrompt = profile?.customPrompt || "";

  let previousEmailContext = "";
  if (contactId) {
    previousEmailContext = await getPreviousEmails(userId, contactId);
  }

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI();

    let systemPrompt: string;
    let userPrompt: string;

    if (isFollowup && previousEmailContext) {
      systemPrompt = customPrompt
        ? `You are an AI cold email assistant. Custom instruction: ${customPrompt}\n\nSender profile:\n${profileContext}`
        : `You are an AI cold email assistant that helps job seekers write follow-up emails. Write short, natural follow-ups that reference the previous conversation. Never repeat the original email. Add new value or ask a different question. Match the sender's tone preference.\n\nSender profile:\n${profileContext}`;

      userPrompt = `Write follow-up #${followupNumber || 1} to ${contactName || "the recipient"}${contactRole ? ` (${contactRole})` : ""}${contactCompany ? ` at ${contactCompany}` : ""}.

${previousEmailContext}

Write a brief, natural follow-up that:
1. References the previous email without repeating it
2. Adds a new angle or insight
3. Keeps it under 80 words
4. Feels human, not automated

Include a subject line on the first line prefixed with "Subject: ", then a blank line, then the email body. The subject should be a reply (start with "Re: ") to maintain the thread.`;
    } else {
      systemPrompt = customPrompt
        ? `You are an AI cold email assistant. Custom instruction: ${customPrompt}\n\nSender profile:\n${profileContext}`
        : `You are an AI cold email assistant that helps job seekers write personalized, professional cold emails to hiring managers and recruiters. Write short, compelling emails that feel human. Never be salesy or spammy. Match the sender's tone preference.\n\nSender profile:\n${profileContext}`;

      userPrompt = `Write a cold email to ${contactName || "a hiring manager"}${contactRole ? ` who is a ${contactRole}` : ""}${contactCompany ? ` at ${contactCompany}` : ""}. Include a subject line on the first line prefixed with "Subject: ", then a blank line, then the email body. Keep it under 150 words.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || "";
    const lines = response.split("\n");
    const subjectLine = lines[0]?.replace(/^Subject:\s*/i, "") || "Quick intro";
    const body = lines.slice(1).join("\n").trim();

    return { subject: subjectLine, body };
  } catch (error: any) {
    console.error("AI generation error, using fallback:", error.message);
    return generateFallbackEmail(input, profileContext);
  }
}

function generateFallbackEmail(input: EmailGenerationInput, profileContext: string): GeneratedEmail {
  const { contactName, contactCompany, contactRole, isFollowup, followupNumber } = input;
  const skills = profileContext.match(/Skills: (.+)/)?.[1]?.split(", ") || ["technology"];
  const name = profileContext.match(/Name: (.+)/)?.[1] || "there";

  if (isFollowup) {
    const followupTemplates = [
      {
        subject: `Re: Quick question about ${contactRole || "the role"} at ${contactCompany || "your company"}`,
        body: `Hi ${contactName || "there"},\n\nJust wanted to follow up on my previous email. I understand you're busy, but I'd love the chance to share how my experience in ${skills[0] || "this field"} could contribute to your team.\n\nWould a brief 10-minute call work this week?\n\nBest,\n${name}`,
      },
      {
        subject: `Re: Following up - ${contactCompany || "opportunity"}`,
        body: `Hi ${contactName || "there"},\n\nCircling back on my earlier note. I've been following ${contactCompany || "your company"}'s recent work and am genuinely excited about the direction you're heading.\n\nI'd appreciate even a brief response — happy to share more about my background if helpful.\n\nThanks,\n${name}`,
      },
    ];
    const template = followupTemplates[(followupNumber || 1) % followupTemplates.length];
    return { ...template, fallback: true };
  }

  const subject = `Quick question about ${contactRole || "the role"} at ${contactCompany || "your company"}`;
  const body = `Hi ${contactName || "there"},\n\nI came across your profile and was impressed by ${contactCompany || "your company"}'s work. I'm a ${skills[0] || "software"} professional with experience in ${skills.slice(0, 3).join(", ") || "technology"}.\n\nWould you be open to a quick chat about opportunities on your team?\n\nBest,\n${name}`;

  return { subject, body, fallback: true };
}
