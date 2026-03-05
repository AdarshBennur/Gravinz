import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  Inbox,
  LogOut,
  Mail,
  Monitor,
  Moon,
  MousePointerClick,
  NotebookText,
  Settings,
  Sparkles,
  Sun,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Layout shell ──────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-[0.35]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

/* ─── Landing-page profile dropdown (when logged in) ───────────────────── */

function LandingProfileMenu() {
  const { user, logout } = useAuth();
  const { setTheme } = useTheme();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl"
          data-testid="button-landing-user-menu"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback>
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" className="w-52">
        <DropdownMenuLabel data-testid="text-landing-user-label">
          {user?.fullName || user?.username || "My Account"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => setLocation("/app/dashboard")}
          data-testid="landing-menu-dashboard"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocation("/app/profile")}
          data-testid="landing-menu-profile"
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocation("/app/settings")}
          data-testid="landing-menu-settings"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")} data-testid="landing-menu-theme-light">
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} data-testid="landing-menu-theme-dark">
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} data-testid="landing-menu-theme-system">
          <Monitor className="mr-2 h-4 w-4" /> System
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} data-testid="landing-menu-logout">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Header auth slot ──────────────────────────────────────────────────── */

function HeaderAuthSlot() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-9 w-20" aria-hidden />;
  }

  if (user) {
    return <LandingProfileMenu />;
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" data-testid="link-login">
        <Button variant="ghost" className="hidden sm:inline-flex" data-testid="button-login">
          Login
        </Button>
      </Link>
      <Link href="/signup" data-testid="link-signup">
        <Button className="group" data-testid="button-signup">
          Get started
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </Link>
    </div>
  );
}

/* ─── Feature data ──────────────────────────────────────────────────────── */

const features = [
  {
    icon: Mail,
    title: "Email Automation",
    desc: "Automatically send cold emails and multi-stage follow-ups on a configurable schedule — without touching the keyboard.",
  },
  {
    icon: Sparkles,
    title: "AI Personalization",
    desc: "GPT-4o generates role-specific intros and subject lines tailored to each contact and job opportunity.",
  },
  {
    icon: Zap,
    title: "Gmail Integration",
    desc: "Send emails directly through your own Gmail account. Your outreach, your sender reputation.",
  },
  {
    icon: NotebookText,
    title: "Notion Sync",
    desc: "Import contacts and job opportunities directly from your Notion database. Stay in the tools you already use.",
  },
  {
    icon: Inbox,
    title: "Unified Inbox",
    desc: "Track replies and conversations across all your outreach campaigns in one clean view.",
  },
  {
    icon: MousePointerClick,
    title: "Click Tracking",
    desc: "See who opened your links, clicked your portfolio, and engaged with your emails.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    desc: "Monitor daily sending activity, reply rates, follow-up performance, and quota usage in real time.",
  },
  {
    icon: Workflow,
    title: "Smart Follow-Ups",
    desc: "Configure up to 3 follow-up stages with custom delays. The system respects your daily limits automatically.",
  },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur">
        <Shell>
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2" data-testid="link-home">
              <div
                className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground ring-soft"
                data-testid="badge-logo"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="text-sm font-semibold" data-testid="text-brand">
                GravinzAI
              </div>
            </Link>

            <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-features"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-how-it-works"
              >
                How it works
              </a>
            </nav>

            <HeaderAuthSlot />
          </div>
        </Shell>
      </header>

      <main>
        {/* ── 1. Hero ── */}
        <Shell>
          <section className="relative py-16 sm:py-20 lg:py-28">
            <div className="mx-auto grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
                <Badge
                  variant="secondary"
                  className="inline-flex items-center gap-2 rounded-full"
                  data-testid="badge-hero"
                >
                  <span className="inline-block size-1.5 rounded-full bg-primary" />
                  AI-Powered Outreach Automation
                </Badge>

                <h1
                  className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
                  data-testid="text-hero-title"
                >
                  Automate personalized cold outreach.
                  <span className="text-primary"> Get more replies.</span>
                </h1>

                <p
                  className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
                  data-testid="text-hero-subtitle"
                >
                  GravinzAI connects to Gmail and Notion, drafts personalized cold emails with GPT-4o,
                  and follows up automatically — so you can focus on interviews, not inbox busywork.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/signup" data-testid="link-cta-primary">
                    <Button size="lg" className="group" data-testid="button-cta-primary">
                      Start automating
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                  <Link href="/app/dashboard" data-testid="link-cta-secondary">
                    <Button
                      size="lg"
                      variant="secondary"
                      className="hover-lift"
                      data-testid="button-cta-secondary"
                    >
                      View dashboard
                    </Button>
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {["Smart follow-ups", "Click tracking", "Gmail + Notion ready"].map((item, i) => (
                    <span key={item} className="flex items-center gap-2" data-testid={`text-hero-proof-${i + 1}`}>
                      {i > 0 && <Separator orientation="vertical" className="hidden h-4 sm:block" />}
                      <Check className="h-4 w-4 text-primary" />
                      {item}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* Hero mock card */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
                className="lg:justify-self-end"
              >
                <Card className="glass hover-lift overflow-hidden" data-testid="card-hero-preview">
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium" data-testid="text-hero-card-title">
                          Today's automation
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="text-hero-card-subtitle">
                          Running with safe limits
                        </div>
                      </div>
                      <Badge className="rounded-full" data-testid="status-automation">Live</Badge>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {[
                        { label: "Emails sent", value: "27" },
                        { label: "Replies", value: "5" },
                        { label: "Follow-ups queued", value: "12" },
                        { label: "Next send", value: "4m" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl border bg-background/70 p-3"
                          data-testid={`card-hero-stat-${s.label.replaceAll(" ", "-")}`}
                        >
                          <div className="text-xs text-muted-foreground">{s.label}</div>
                          <div className="mt-1 text-lg font-semibold">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-xl border bg-background/70 p-3">
                      <div className="text-xs font-medium">Recent activity</div>
                      <div className="mt-2 space-y-2 text-sm">
                        {[
                          { who: "Priya M.", what: "Replied to your email", time: "1h" },
                          { who: "Rohan S.", what: "Follow-up scheduled", time: "2h" },
                          { who: "Anika T.", what: "Link clicked", time: "3h" },
                        ].map((a, idx) => (
                          <div key={idx} className="flex items-center justify-between" data-testid={`row-hero-activity-${idx}`}>
                            <div className="text-muted-foreground">
                              <span className="text-foreground">{a.who}</span>{" "}
                              {a.what}
                            </div>
                            <div className="text-xs text-muted-foreground">{a.time}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </section>
        </Shell>

        {/* ── 2. Problem ── */}
        <div className="border-y bg-muted/30">
          <Shell>
            <section className="py-14 sm:py-16">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-problem-title">
                  Job hunting is a full-time job. It shouldn't be.
                </h2>
                <p className="mt-3 text-sm text-muted-foreground" data-testid="text-problem-sub">
                  Reaching out to dozens of recruiters, tracking every thread, writing follow-ups, updating spreadsheets —
                  it's overwhelming. Most candidates give up before anyone sees their work.
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  { stat: "80+", label: "Cold emails per successful offer on average" },
                  { stat: "3×", label: "More replies from structured follow-up sequences" },
                  { stat: "10h+", label: "Saved per week by automating repetitive outreach" },
                ].map((item) => (
                  <div
                    key={item.stat}
                    className="rounded-xl border bg-background/70 p-5 text-center"
                    data-testid={`card-stat-${item.stat}`}
                  >
                    <div className="text-3xl font-semibold text-primary">{item.stat}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
            </section>
          </Shell>
        </div>

        {/* ── 3. Features ── */}
        <Shell>
          <section id="features" className="py-16 sm:py-20">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-features-title">
                Everything you need to run structured outreach
              </h2>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-features-sub">
                Built around your real workflow — Gmail, Notion, and AI working together.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                  >
                    <Card
                      className="glass hover-lift h-full p-5"
                      data-testid={`card-feature-${f.title.replaceAll(" ", "-")}`}
                    >
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" strokeWidth={2.2} />
                      </div>
                      <div className="text-sm font-semibold" data-testid="text-feature-title">
                        {f.title}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground" data-testid="text-feature-desc">
                        {f.desc}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </Shell>

        {/* ── 4. How it works ── */}
        <div className="border-y bg-muted/30">
          <Shell>
            <section id="how-it-works" className="py-16 sm:py-20">
              <div className="text-center">
                <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-how-title">
                  Up and running in three steps
                </h2>
                <p className="mt-2 text-sm text-muted-foreground" data-testid="text-how-sub">
                  Connect your tools once. The automation handles the rest.
                </p>
              </div>

              <div className="mt-12 grid gap-8 sm:grid-cols-3">
                {[
                  {
                    step: "01",
                    title: "Connect Gmail",
                    desc: "Authorize GravinzAI to send emails on your behalf through your own Gmail account.",
                  },
                  {
                    step: "02",
                    title: "Import from Notion",
                    desc: "Pull your contact list and job opportunities directly from your Notion database.",
                  },
                  {
                    step: "03",
                    title: "Launch your campaign",
                    desc: "Set your daily limit and follow-up schedule. GravinzAI takes it from there.",
                  },
                ].map((item) => (
                  <div key={item.step} className="relative" data-testid={`card-step-${item.step}`}>
                    <div className="mb-4 text-4xl font-semibold text-primary/20 leading-none">
                      {item.step}
                    </div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </Shell>
        </div>

        {/* ── 5. Final CTA ── */}
        <Shell>
          <section className="py-16 pb-24 sm:py-20 sm:pb-28">
            <Card className="glass p-8 sm:p-12 text-center" data-testid="card-final-cta">
              <h2
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
                data-testid="text-final-cta-title"
              >
                Start your automated outreach system today.
              </h2>
              <p
                className="mt-3 text-sm text-muted-foreground"
                data-testid="text-final-cta-sub"
              >
                Connect Gmail, import from Notion, and let the AI handle the rest.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/signup" data-testid="link-final-cta">
                  <Button size="lg" className="group" data-testid="button-final-cta">
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/login" data-testid="link-final-login">
                  <Button size="lg" variant="secondary" data-testid="button-final-login">
                    Sign in
                  </Button>
                </Link>
              </div>
            </Card>
          </section>
        </Shell>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t bg-background/70 backdrop-blur">
        <Shell>
          <div className="flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div data-testid="text-footer-copy">© {new Date().getFullYear()} GravinzAI</div>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Privacy
              </a>
              <a href="#" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Terms
              </a>
            </div>
          </div>
        </Shell>
      </footer>
    </div>
  );
}
