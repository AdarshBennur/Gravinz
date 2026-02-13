import { Briefcase, Rocket, Mail, Download, Edit2, User } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface ProfileData {
  user: {
    id: string;
    username: string;
    email: string | null;
    fullName: string | null;
  };
  profile: {
    skills?: string[];
    roles?: string[];
    tone?: string;
    status?: string;
    description?: string;
  } | null;
  experiences: Array<{
    id: string;
    role: string;
    company: string;
    duration: string;
    description: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    tech: string;
    impact: string;
  }>;
}

export default function ProfilePage() {
  const { user: authUser } = useAuth();

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/profile"],
    queryFn: () => apiGet<ProfileData>("/api/profile"),
  });

  const user = data?.user;
  const profile = data?.profile;
  const experiences = data?.experiences ?? [];
  const projects = data?.projects ?? [];
  const skills = profile?.skills ?? [];
  const roles = profile?.roles ?? [];
  const tone = profile?.tone ?? "direct";
  const status = profile?.status ?? "working";
  const displayName = user?.fullName || user?.username || authUser?.fullName || authUser?.username || "User";
  const displayEmail = user?.email || authUser?.email || "";

  const statusLabels: Record<string, string> = {
    student: "Student",
    working: "Working Professional",
    switcher: "Career Switcher",
    freelancer: "Freelancer",
    other: "Other",
  };

  if (isLoading) {
    return (
      <AppShell title="Profile" subtitle="View your professional profile as the AI sees it.">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <Card className="glass p-6">
              <div className="space-y-4 flex flex-col items-center">
                <Skeleton className="h-24 w-24 rounded-full" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            </Card>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass p-6">
              <Skeleton className="h-40 w-full" />
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile" subtitle="View your professional profile as the AI sees it.">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="glass p-6 text-center" data-testid="card-profile-header">
            <div className="flex justify-center mb-4">
              <Avatar className="h-24 w-24 ring-4 ring-primary/10" data-testid="avatar-profile">
                <AvatarFallback className="bg-primary/5 text-primary text-2xl">
                  <User className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
            </div>
            <h2 className="text-xl font-bold" data-testid="text-profile-name">{displayName}</h2>
            {displayEmail && (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <Mail className="h-3.5 w-3.5" />
                {displayEmail}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Badge variant="secondary" className="rounded-full">{statusLabels[status] || status}</Badge>
            </div>
            
            <Separator className="my-6" />
            
            <div className="space-y-4">
              <Link href="/app/settings">
                <Button className="w-full" data-testid="button-edit-settings">
                  <Edit2 className="mr-2 h-4 w-4" /> Edit Settings
                </Button>
              </Link>
              <Button variant="outline" className="w-full">
                <Download className="mr-2 h-4 w-4" /> Download Resume
              </Button>
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-profile-skills">
            <h3 className="font-semibold mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {skills.length > 0 ? skills.map(skill => (
                <Badge key={skill} variant="secondary" className="rounded-full">{skill}</Badge>
              )) : (
                <span className="text-sm text-muted-foreground">No skills added yet</span>
              )}
            </div>
            <h3 className="font-semibold mb-4 mt-6">Target Roles</h3>
            <div className="flex flex-wrap gap-2">
              {roles.length > 0 ? roles.map(role => (
                <Badge key={role} variant="outline" className="rounded-full border-primary/20">{role}</Badge>
              )) : (
                <span className="text-sm text-muted-foreground">No target roles set</span>
              )}
            </div>
            <h3 className="font-semibold mb-2 mt-6">Tone Preference</h3>
            <Badge className="rounded-full bg-primary/10 text-primary border-none capitalize">{tone}</Badge>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="glass p-6" data-testid="card-profile-experience">
            <div className="flex items-center gap-2 mb-6">
              <Briefcase className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Professional Experience</h3>
            </div>
            <div className="space-y-6">
              {experiences.length > 0 ? experiences.map((exp, idx) => (
                <div key={exp.id} className="relative pl-6 pb-6 last:pb-0">
                  {idx !== experiences.length - 1 && (
                    <div className="absolute left-[7px] top-6 bottom-0 w-px bg-border" />
                  )}
                  <div className="absolute left-0 top-1.5 size-4 rounded-full border-2 border-primary bg-background" />
                  <div className="space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="font-bold">{exp.role}</h4>
                      <span className="text-xs text-muted-foreground font-medium px-2 py-1 bg-secondary rounded-lg">
                        {exp.duration}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-primary/80">{exp.company}</p>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {exp.description}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">
                  No experience added yet. <Link href="/app/settings" className="text-primary underline">Add experience</Link>
                </div>
              )}
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-profile-projects">
            <div className="flex items-center gap-2 mb-6">
              <Rocket className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Top Projects</h3>
            </div>
            <div className="grid gap-4">
              {projects.length > 0 ? projects.map(project => (
                <div key={project.id} className="p-4 rounded-xl border bg-secondary/30 border-primary/5 hover:border-primary/20 transition-colors group">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold group-hover:text-primary transition-colors">{project.name}</h4>
                    <div className="flex gap-2">
                      {(typeof project.tech === "string" ? project.tech.split(",") : []).map(t => (
                        <span key={t.trim()} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.trim()}</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {project.impact}
                  </p>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">
                  No projects added yet. <Link href="/app/settings" className="text-primary underline">Add projects</Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
