import { motion } from "framer-motion";
import { Briefcase, Rocket, Mail, MapPin, ExternalLink, Download, Edit2, User } from "lucide-react";
import { Link } from "wouter";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function ProfilePage() {
  const experiences = [
    {
      id: "1",
      role: "Senior Frontend Engineer",
      company: "TechCorp",
      duration: "Jan 2022 - Present",
      description: "Leading the UI platform team, building accessible design systems and scalable React applications.",
    },
    {
      id: "2",
      role: "Software Engineer",
      company: "InnovateSoft",
      duration: "Jun 2019 - Dec 2021",
      description: "Developed and maintained multiple client-facing applications using React and Node.js.",
    }
  ];

  const projects = [
    {
      id: "1",
      name: "OutboundAI",
      tech: ["React", "TypeScript", "Tailwind"],
      impact: "Automated cold outreach for 10k+ users, increasing response rates by 40%.",
    },
    {
      id: "2",
      name: "DesignSystem UI",
      tech: ["Storybook", "Radix", "CSS"],
      impact: "Reduced design-to-dev handoff time by 50% across 3 internal teams.",
    },
    {
      id: "3",
      name: "DataViz Pro",
      tech: ["D3.js", "React", "Node"],
      impact: "Real-time analytics dashboard used by executive leadership for strategic decisions.",
    }
  ];

  const skills = ["React", "TypeScript", "Next.js", "Tailwind CSS", "Node.js", "GraphQL", "System Design"];
  const roles = ["Frontend Engineer", "Product Engineer", "Fullstack Developer"];

  return (
    <AppShell title="Profile" subtitle="View your professional profile as the AI sees it.">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Header & Core Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="glass p-6 text-center" data-testid="card-profile-header">
            <div className="flex justify-center mb-4">
              <Avatar className="h-24 w-24 ring-4 ring-primary/10" data-testid="avatar-profile">
                <AvatarFallback className="bg-primary/5 text-primary text-2xl">
                  <User className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
            </div>
            <h2 className="text-xl font-bold" data-testid="text-profile-name">Jordan Doe</h2>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Mail className="h-3.5 w-3.5" />
              jordan@example.com
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Badge variant="secondary" className="rounded-full">Working Professional</Badge>
              <Badge variant="secondary" className="rounded-full">5+ Years Exp</Badge>
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
              {skills.map(skill => (
                <Badge key={skill} variant="secondary" className="rounded-full">{skill}</Badge>
              ))}
            </div>
            <h3 className="font-semibold mb-4 mt-6">Target Roles</h3>
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <Badge key={role} variant="outline" className="rounded-full border-primary/20">{role}</Badge>
              ))}
            </div>
            <h3 className="font-semibold mb-2 mt-6">Tone Preference</h3>
            <Badge className="rounded-full bg-primary/10 text-primary border-none capitalize">Direct</Badge>
          </Card>
        </div>

        {/* Right Column - Experience & Projects */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass p-6" data-testid="card-profile-experience">
            <div className="flex items-center gap-2 mb-6">
              <Briefcase className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Professional Experience</h3>
            </div>
            <div className="space-y-6">
              {experiences.map((exp, idx) => (
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
              ))}
            </div>
          </Card>

          <Card className="glass p-6" data-testid="card-profile-projects">
            <div className="flex items-center gap-2 mb-6">
              <Rocket className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Top 3 Projects</h3>
            </div>
            <div className="grid gap-4">
              {projects.map(project => (
                <div key={project.id} className="p-4 rounded-xl border bg-secondary/30 border-primary/5 hover:border-primary/20 transition-colors group">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold group-hover:text-primary transition-colors">{project.name}</h4>
                    <div className="flex gap-2">
                      {project.tech.map(t => (
                        <span key={t} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {project.impact}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
