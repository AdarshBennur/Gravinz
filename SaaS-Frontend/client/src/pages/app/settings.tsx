import { useEffect, useState } from "react";
import { UploadCloud, X, Plus, Trash2, Briefcase, Rocket } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPut, apiPost, apiDelete, getAccessToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function TagInput({
  label,
  placeholder,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (tags: string[]) => void;
  testId: string;
}) {
  const [text, setText] = useState("");

  return (
    <div className="grid gap-2">
      <Label data-testid={`label-${testId}`}>{label}</Label>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-background/60 p-2" data-testid={`input-${testId}`}>
        {value.map((t) => (
          <Badge
            key={t}
            variant="secondary"
            className="rounded-full gap-1"
            data-testid={`tag-${testId}-${t}`}
          >
            {t}
            <button
              className="ml-1 inline-flex rounded-full p-0.5 hover:bg-background"
              onClick={() => onChange(value.filter((x) => x !== t))}
              data-testid={`button-remove-${testId}-${t}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-[160px] flex-1 bg-transparent px-2 py-1 text-sm outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const next = text
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (next.length) onChange([...value, ...next]);
              setText("");
            }
            if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          data-testid={`input-${testId}-text`}
        />
      </div>
      <div className="text-xs text-muted-foreground" data-testid={`help-${testId}`}>
        Press Enter to add a tag
      </div>
    </div>
  );
}

interface Experience {
  id: string;
  role: string;
  company: string;
  duration: string;
  description: string;
}

interface Project {
  id: string;
  name: string;
  tech: string;
  impact: string;
}

interface ProfileData {
  user: any;
  profile: {
    skills?: string[];
    roles?: string[];
    tone?: string;
    status?: string;
    description?: string;
    promptOverride?: string;
    resumeUrl?: string;
  } | null;
  experiences: Experience[];
  projects: Project[];
}

export default function ProfileSettingsPage() {
  const { toast } = useToast();
  const [skills, setSkills] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [tone, setTone] = useState("direct");
  const [status, setStatus] = useState("working");
  const [profileDesc, setProfileDesc] = useState("");
  const [promptOverride, setPromptOverride] = useState("");

  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/profile"],
    queryFn: () => apiGet<ProfileData>("/api/profile"),
  });

  useEffect(() => {
    if (data) {
      const p = data.profile;
      setSkills(p?.skills ?? []);
      setRoles(p?.roles ?? []);
      setTone(p?.tone ?? "direct");
      setStatus(p?.status ?? "working");
      setProfileDesc(p?.description ?? "");
      setPromptOverride(p?.promptOverride ?? "");
      setExperiences(data.experiences ?? []);
      setProjects(data.projects ?? []);
      if (p?.resumeUrl) {
        // Extract filename from URL or show default
        const name = p.resumeUrl.split('/').pop();
        setFileName(name || "Uploaded Resume");
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut("/api/profile", {
        skills,
        roles,
        tone,
        status,
        description: profileDesc,
        promptOverride,
        experiences,
        projects,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Saved", description: "All settings saved successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Client-side validation
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch('/api/profile/resume', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const json = await res.json();
      setFileName(file.name);
      toast({ title: "Resume Uploaded", description: "Your resume has been successfully saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    } catch (error) {
      console.error(error);
      toast({ title: "Upload Failed", description: "Could not upload resume.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const addExperience = () => {
    setExperiences([
      ...experiences,
      {
        id: Math.random().toString(36).substr(2, 9),
        role: "",
        company: "",
        duration: "",
        description: "",
      },
    ]);
  };

  const updateExperience = (id: string, field: keyof Experience, val: string) => {
    setExperiences(experiences.map((exp) => (exp.id === id ? { ...exp, [field]: val } : exp)));
  };

  const removeExperience = (id: string) => {
    setExperiences(experiences.filter((exp) => exp.id !== id));
  };

  const updateProject = (id: string, field: keyof Project, val: string) => {
    setProjects(projects.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const addProject = () => {
    if (projects.length >= 3) {
      toast({ title: "Limit Reached", description: "You can only add up to 3 highlight projects.", variant: "destructive" });
      return;
    }
    setProjects([
      ...projects,
      {
        id: Math.random().toString(36).substr(2, 9),
        name: "",
        tech: "",
        impact: "",
      },
    ]);
  };

  const removeProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
  };

  if (isLoading) {
    return (
      <AppShell title="Profile & AI Settings" subtitle="Give the AI context so it can write in your voice.">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass p-6">
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          </div>
          <div>
            <Card className="glass p-6">
              <Skeleton className="h-40 w-full" />
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile & AI Settings" subtitle="Give the AI context so it can write in your voice.">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass p-6" data-testid="card-profile">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label data-testid="label-status">Current Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full" data-testid="select-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="working">Working Professional</SelectItem>
                    <SelectItem value="switcher">Career Switcher</SelectItem>
                    <SelectItem value="freelancer">Freelancer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile" data-testid="label-profile">Full profile description</Label>
                <Textarea
                  id="profile"
                  value={profileDesc}
                  onChange={(e) => setProfileDesc(e.target.value)}
                  className="min-h-40"
                  placeholder="Describe yourself, your experience, and what you're looking for..."
                  data-testid="textarea-profile"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TagInput
                  label="Skills"
                  placeholder="Add a skill…"
                  value={skills}
                  onChange={setSkills}
                  testId="skills"
                />
                <TagInput
                  label="Target roles"
                  placeholder="Add a role…"
                  value={roles}
                  onChange={setRoles}
                  testId="roles"
                />
              </div>

              <div className="grid gap-2">
                <Label data-testid="label-tone">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="w-full" data-testid="select-tone">
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal" data-testid="option-tone-formal">Formal</SelectItem>
                    <SelectItem value="casual" data-testid="option-tone-casual">Casual</SelectItem>
                    <SelectItem value="direct" data-testid="option-tone-direct">Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-experience">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Professional Experience</h2>
              </div>
              <Button onClick={addExperience} size="sm" variant="secondary">
                <Plus className="h-4 w-4 mr-2" /> Add Experience
              </Button>
            </div>

            <div className="space-y-4">
              {experiences.map((exp) => (
                <Card key={exp.id} className="p-4 bg-background/40 relative group">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeExperience(exp.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Role / Job Title</Label>
                        <Input
                          value={exp.role}
                          onChange={(e) => updateExperience(exp.id, "role", e.target.value)}
                          placeholder="e.g. Software Engineer"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Company Name</Label>
                        <Input
                          value={exp.company}
                          onChange={(e) => updateExperience(exp.id, "company", e.target.value)}
                          placeholder="e.g. Acme Inc"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Duration</Label>
                      <Input
                        value={exp.duration}
                        onChange={(e) => updateExperience(exp.id, "duration", e.target.value)}
                        placeholder="e.g. Jan 2020 - Present"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Description</Label>
                      <Textarea
                        value={exp.description}
                        onChange={(e) => updateExperience(exp.id, "description", e.target.value)}
                        placeholder="Short description of your impact..."
                        className="min-h-[100px]"
                      />
                    </div>
                  </div>
                </Card>
              ))}
              {experiences.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                  No experience added yet.
                </div>
              )}
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-projects">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Top 3 Highlight Projects</h2>
              </div>
              <Button onClick={addProject} size="sm" variant="secondary" disabled={projects.length >= 3}>
                <Plus className="h-4 w-4 mr-2" /> Add Project
              </Button>
            </div>
            <div className="grid gap-4">
              {projects.map((p) => (
                <Card key={p.id} className="p-4 bg-background/40 relative group">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeProject(p.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Project Name</Label>
                        <Input
                          value={p.name}
                          onChange={(e) => updateProject(p.id, "name", e.target.value)}
                          placeholder="Project name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Tech Stack</Label>
                        <Input
                          value={p.tech}
                          onChange={(e) => updateProject(p.id, "tech", e.target.value)}
                          placeholder="React, Node.js..."
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Impact Description</Label>
                      <Textarea
                        value={p.impact}
                        onChange={(e) => updateProject(p.id, "impact", e.target.value)}
                        placeholder="1-2 line impact description"
                        className="min-h-[100px]"
                      />
                    </div>
                  </div>
                </Card>
              ))}
              {projects.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                  No projects added yet.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass p-6" data-testid="card-resume">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold" data-testid="text-resume-title">Resume upload</div>
                <div className="text-xs text-muted-foreground" data-testid="text-resume-sub">
                  Drag & drop
                </div>
              </div>
              {fileName ? (
                <Badge variant="secondary" className="rounded-full">Added</Badge>
              ) : (
                <Badge variant="secondary" className="rounded-full">Optional</Badge>
              )}
            </div>

            <div
              className={
                "mt-5 grid place-items-center rounded-xl border bg-background/60 p-6 text-center transition-colors " +
                (dragOver ? "bg-primary/5 border-primary/40" : "")
              }
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              data-testid="dropzone-resume"
            >
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <div className="mt-2 text-sm font-medium">Drop your resume here</div>
              <div className="mt-1 text-xs text-muted-foreground">PDF, DOCX</div>

              <div className="mt-4 flex w-full flex-col gap-2">
                <div className="relative w-full">
                  <Button
                    variant="secondary"
                    disabled={uploading}
                    className="w-full relative"
                    onClick={() => document.getElementById('resume-upload')?.click()}
                  >
                    {uploading ? "Uploading..." : "Choose file"}
                  </Button>
                  <input
                    type="file"
                    id="resume-upload"
                    className="hidden"
                    accept=".pdf,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
                {fileName && (
                  <Button variant="ghost" className="w-full" onClick={() => setFileName(null)}>Remove</Button>
                )}
                {fileName && <div className="text-xs text-muted-foreground break-all">{fileName}</div>}
              </div>
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-ai-override">
            <div className="grid gap-2">
              <Label htmlFor="prompt" data-testid="label-prompt">Custom prompt override</Label>
              <Textarea
                id="prompt"
                className="min-h-32"
                value={promptOverride}
                onChange={(e) => setPromptOverride(e.target.value)}
                placeholder="Optional: override system prompt for generation…"
                data-testid="textarea-prompt"
              />
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              className="w-full shadow-lg shadow-primary/20"
              size="lg"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-all"
            >
              {saveMutation.isPending ? "Saving…" : "Save All Changes"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              onClick={() => {
                if (data) {
                  const p = data.profile;
                  setSkills(p?.skills ?? []);
                  setRoles(p?.roles ?? []);
                  setTone(p?.tone ?? "direct");
                  setStatus(p?.status ?? "working");
                  setProfileDesc(p?.description ?? "");
                  setPromptOverride(p?.promptOverride ?? "");
                  setExperiences(data.experiences ?? []);
                  setProjects(data.projects ?? []);
                }
                toast({ title: "Reset", description: "Changes discarded." });
              }}
            >
              Discard Changes
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
