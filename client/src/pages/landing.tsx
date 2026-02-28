import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
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
              <div className="leading-tight">
                <div className="text-sm font-semibold" data-testid="text-brand">
                  OutboundAI
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-brand-sub">
                  Cold email automation
                </div>
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
                href="#pricing"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-pricing"
              >
                Pricing
              </a>
              <a
                href="#security"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-security"
              >
                Trust
              </a>
            </nav>

            <div className="flex items-center gap-2">
              <Link href="/login" data-testid="link-login">
                <Button variant="ghost" className="hidden sm:inline-flex" data-testid="button-login">
                  Login
                </Button>
              </Link>
              <Link href="/signup" data-testid="link-signup">
                <Button className="group" data-testid="button-signup">
                  Sign up
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
          </div>
        </Shell>
      </header>

      <main>
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
                  AI cold email automation for job seekers
                </Badge>

                <h1
                  className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
                  data-testid="text-hero-title"
                >
                  Send better cold emails.
                  <span className="text-primary"> Get more replies.</span>
                </h1>

                <p
                  className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
                  data-testid="text-hero-subtitle"
                >
                  OutboundAI drafts personalized outreach, schedules follow-ups, and surfaces replies — so
                  you can focus on interviews, not inbox busywork.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/signup" data-testid="link-cta-primary">
                    <Button size="lg" className="group" data-testid="button-cta-primary">
                      Start free
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
                  <div className="flex items-center gap-2" data-testid="text-hero-proof-1">
                    <Check className="h-4 w-4 text-primary" />
                    Smart follow-ups
                  </div>
                  <Separator orientation="vertical" className="hidden h-4 sm:block" />
                  <div className="flex items-center gap-2" data-testid="text-hero-proof-2">
                    <Check className="h-4 w-4 text-primary" />
                    Reply tracking
                  </div>
                  <Separator orientation="vertical" className="hidden h-4 sm:block" />
                  <div className="flex items-center gap-2" data-testid="text-hero-proof-3">
                    <Check className="h-4 w-4 text-primary" />
                    Gmail + Notion ready
                  </div>
                </div>
              </motion.div>

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
                          Today’s automation
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="text-hero-card-subtitle">
                          Running with safe limits
                        </div>
                      </div>
                      <Badge className="rounded-full" data-testid="status-automation">
                        Live
                      </Badge>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {[
                        { label: "Emails sent", value: "42" },
                        { label: "Replies", value: "7" },
                        { label: "Follow-ups queued", value: "18" },
                        { label: "Next send", value: "3m" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl border bg-background/70 p-3"
                          data-testid={`card-hero-stat-${s.label.replaceAll(" ", "-")}`}
                        >
                          <div className="text-xs text-muted-foreground" data-testid="text-stat-label">
                            {s.label}
                          </div>
                          <div className="mt-1 text-lg font-semibold" data-testid="text-stat-value">
                            {s.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-xl border bg-background/70 p-3">
                      <div className="text-xs font-medium" data-testid="text-hero-activity-title">
                        Recent activity
                      </div>
                      <div className="mt-2 space-y-2 text-sm">
                        {[
                          { who: "Jamie L.", what: "Replied to your email", time: "1h" },
                          { who: "Ava R.", what: "Follow-up scheduled", time: "2h" },
                          { who: "Niko S.", what: "Email drafted", time: "3h" },
                        ].map((a, idx) => (
                          <div key={idx} className="flex items-center justify-between" data-testid={`row-hero-activity-${idx}`}>
                            <div className="text-muted-foreground">
                              <span className="text-foreground" data-testid="text-activity-who">
                                {a.who}
                              </span>{" "}
                              {a.what}
                            </div>
                            <div className="text-xs text-muted-foreground" data-testid="text-activity-time">
                              {a.time}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </section>

          <section id="features" className="py-16 sm:py-20">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-features-title">
                  Everything you need to stay consistent
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-features-sub">
                  A clean workflow from profile → contacts → campaigns → analytics.
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "AI personalization",
                  desc: "Generate role-specific intros and subject lines without sounding robotic.",
                },
                {
                  title: "Follow-up engine",
                  desc: "Queue follow-ups automatically with guardrails for daily limits.",
                },
                {
                  title: "Reply monitoring",
                  desc: "Track replies and mark contacts for follow-up in one place.",
                },
                {
                  title: "Templates & tone",
                  desc: "Choose formal, casual, or direct — and override prompts when needed.",
                },
                {
                  title: "CSV imports",
                  desc: "Bring contacts in fast. Bulk actions keep your pipeline tidy.",
                },
                {
                  title: "Analytics",
                  desc: "Know what’s working: reply rate, subject performance, and follow-up impact.",
                },
              ].map((f) => (
                <Card
                  key={f.title}
                  className="glass hover-lift p-5"
                  data-testid={`card-feature-${f.title.replaceAll(" ", "-")}`}
                >
                  <div className="text-sm font-semibold" data-testid="text-feature-title">
                    {f.title}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground" data-testid="text-feature-desc">
                    {f.desc}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section id="security" className="py-16 sm:py-20">
            <Card className="glass p-6 sm:p-8" data-testid="card-trust">
              <div className="grid gap-6 lg:grid-cols-3">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-trust-title">
                    Designed for trust
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground" data-testid="text-trust-sub">
                    Sensible limits, clear controls, and a transparent workflow.
                  </p>
                </div>
                <div className="lg:col-span-2 grid gap-3 sm:grid-cols-3">
                  {["Daily send caps", "Audit-friendly activity", "No surprise automations"].map((t) => (
                    <div
                      key={t}
                      className="rounded-xl border bg-background/70 p-4"
                      data-testid={`card-trust-pill-${t.replaceAll(" ", "-")}`}
                    >
                      <div className="text-sm font-medium" data-testid="text-trust-pill">
                        {t}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-trust-pill-sub">
                        Built to feel safe and professional.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          <section id="pricing" className="py-16 sm:py-20">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-pricing-title">
                  Simple pricing
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="text-pricing-sub">
                  Start small, then scale up when you’re ready.
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {[
                {
                  name: "Basic",
                  price: "$19",
                  perks: ["500 emails / month", "2 follow-ups", "Basic analytics"],
                },
                {
                  name: "Pro",
                  price: "$49",
                  perks: ["Unlimited contacts", "5 follow-ups", "Advanced analytics"],
                },
              ].map((p) => (
                <Card key={p.name} className="glass hover-lift p-6" data-testid={`card-pricing-${p.name}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold" data-testid="text-plan-name">
                        {p.name}
                      </div>
                      <div className="mt-2 text-3xl font-semibold" data-testid="text-plan-price">
                        {p.price}
                        <span className="text-sm text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    {p.name === "Pro" ? (
                      <Badge className="rounded-full" data-testid="badge-most-popular">
                        Most popular
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-2 text-sm">
                    {p.perks.map((perk) => (
                      <div
                        key={perk}
                        className="flex items-center gap-2"
                        data-testid={`text-perk-${perk.replaceAll(" ", "-")}`}
                      >
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">{perk}</span>
                      </div>
                    ))}
                  </div>

                  <Link href="/signup" className="mt-6 block" data-testid="link-pricing-cta">
                    <Button
                      className="w-full"
                      variant={p.name === "Pro" ? "default" : "secondary"}
                      data-testid="button-pricing-cta"
                    >
                      Choose {p.name}
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </section>

          <section className="pb-16 sm:pb-24">
            <Card className="glass p-6 sm:p-10" data-testid="card-final-cta">
              <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-xl font-semibold" data-testid="text-final-cta-title">
                    Ready to run your outreach like a system?
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground" data-testid="text-final-cta-sub">
                    Build a repeatable process for high-quality applications.
                  </p>
                </div>
                <Link href="/signup" data-testid="link-final-cta">
                  <Button size="lg" className="group" data-testid="button-final-cta">
                    Start automation
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </Card>
          </section>
        </Shell>
      </main>

      <footer className="border-t bg-background/70 backdrop-blur">
        <Shell>
          <div className="flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div data-testid="text-footer-copy">© {new Date().getFullYear()} OutboundAI</div>
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
