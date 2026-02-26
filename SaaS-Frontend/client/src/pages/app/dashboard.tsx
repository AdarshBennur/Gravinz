import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Pause, Play, Sparkles } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 140, damping: 18 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  return <motion.span data-testid="text-animated-number">{rounded}</motion.span>;
}

// Normalise a DB timestamp string to explicit UTC.
// Postgres TIMESTAMP WITHOUT TIME ZONE returns strings like
// "2026-02-25T10:35:13.75" (no Z). The Date constructor treats
// those as LOCAL time — causing wrong diffs in IST or any non-UTC zone.
// Appending Z forces UTC interpretation. Strings already tagged (Z / ±HH:MM) are left alone.
function normalizeUTC(s: string): string {
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s + "Z";
  return s;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(normalizeUTC(dateStr)).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

/**
 * Computes how many hours + minutes remain until midnight in the given IANA timezone.
 * Uses the same reset boundary as the automation cycle (midnight in user timezone = daily quota resets).
 */
function computeResetCountdown(timezone: string): string {
  try {
    // Current wall-clock time in the user's timezone
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
    const year = get("year"), month = get("month") - 1, day = get("day");
    const hour = get("hour"), minute = get("minute"), second = get("second");

    // Seconds elapsed since midnight in user TZ
    const elapsedSec = hour * 3600 + minute * 60 + second;
    // Seconds remaining until next midnight
    const remainSec = 86400 - elapsedSec;

    const h = Math.floor(remainSec / 3600);
    const m = Math.floor((remainSec % 3600) / 60);

    if (h === 0 && m === 0) return "Resets now";
    if (h === 0) return `Resets in ${m}m`;
    if (m === 0) return `Resets in ${h}h`;
    return `Resets in ${h}h ${m}m`;
  } catch {
    return "";
  }
}

function useResetCountdown(timezone: string | undefined): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!timezone) return;
    const tick = () => setLabel(computeResetCountdown(timezone));
    tick(); // run immediately
    const id = setInterval(tick, 60_000); // update every minute
    return () => clearInterval(id);
  }, [timezone]);

  return label;
}

interface DashboardData {
  stats: {
    sentToday: number;
    followupsPending: number;
    replies: number;
    dailyLimit: number | null; // null = unlimited (owner)
    used: number;
  };
  activity: Array<{
    contact: string;
    action: string;
    createdAt: string;
    status: string;
  }>;
  automationStatus: "running" | "paused";
  plan: string;
  isOwner: boolean;
  trialExpiresAt: string | null;
  trialExpired: boolean;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [steps, setSteps] = useState<string[]>([
    "Tighten target roles",
    "Refresh 2 subject lines",
    "Queue follow-ups for warm leads",
  ]);

  const { data, isLoading: loading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
  });

  // Fetch timezone from campaign settings (same source as automation)
  const { data: campaignSettings } = useQuery<{ timezone?: string }>({
    queryKey: ["/api/campaign-settings"],
    queryFn: () => apiGet<{ timezone?: string }>("/api/campaign-settings"),
    staleTime: 5 * 60_000, // re-fetch at most every 5 min
  });

  const resetLabel = useResetCountdown(campaignSettings?.timezone);

  const stats = data?.stats ?? { sentToday: 0, followupsPending: 0, replies: 0, dailyLimit: 5, used: 0 };
  const activity = data?.activity ?? [];
  const running = data?.automationStatus === "running";
  const isOwner = data?.isOwner ?? false;
  const trialExpired = data?.trialExpired ?? false;

  const toggleMutation = useMutation({
    mutationFn: () =>
      apiPost(running ? "/api/automation/pause" : "/api/automation/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: running ? "Automation paused" : "Automation started",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const nextStepsMutation = useMutation({
    mutationFn: () => apiPost<{ steps: string[] }>("/api/ai/generate-next-steps"),
    onSuccess: (res) => {
      setSteps(res.steps);
      toast({ title: "Generated next steps" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const progress = (!isOwner && stats.dailyLimit)
    ? Math.round((stats.used / stats.dailyLimit) * 100)
    : 0;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Monitor daily sending, replies, and automation health."
      headerRight={
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full" data-testid="status-automation-badge">
            {running ? "Automation running" : "Automation paused"}
          </Badge>
          <Button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            data-testid="button-toggle-automation"
          >
            {running ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        {[{
          label: "Emails sent today",
          value: stats.sentToday,
        }, {
          label: "Follow-ups pending",
          value: stats.followupsPending,
        }, {
          label: "Replies received",
          value: stats.replies,
        }].map((c) => (
          <Card key={c.label} className="glass p-5" data-testid={`card-kpi-${c.label.replaceAll(" ", "-")}`}>
            <div className="text-xs text-muted-foreground" data-testid="text-kpi-label">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold" data-testid="text-kpi-value">
              {loading ? <Skeleton className="h-7 w-14" /> : <AnimatedNumber value={c.value} />}
            </div>
          </Card>
        ))}

        {/* Daily limit card — renders differently by plan */}
        <Card className="glass p-5" data-testid="card-kpi-limit">
          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : isOwner ? (
            /* ── Owner: unlimited ── */
            <div className="flex h-full flex-col justify-between" data-testid="div-owner-plan">
              <div className="text-xs text-muted-foreground">Daily limit</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-2xl font-semibold" data-testid="text-unlimited-label">
                  {stats.sentToday}
                </div>
                <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5" data-testid="badge-unlimited">
                  Unlimited
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-owner-sub">
                Owner plan — no daily cap
              </div>
            </div>
          ) : trialExpired ? (
            /* ── Free: trial expired ── */
            <div className="flex h-full flex-col justify-between" data-testid="div-trial-expired">
              <div className="text-xs text-muted-foreground">Daily limit</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5" data-testid="badge-trial-expired">
                  Trial expired
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-trial-expired-sub">
                Your 14-day free trial has ended. Sending is disabled.
              </div>
            </div>
          ) : (
            /* ── Free: active trial ── */
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground" data-testid="text-limit-label">
                  Daily limit progress
                </div>
                <div className="text-xs font-medium" data-testid="text-limit-percent">
                  {progress}%
                </div>
              </div>
              <div className="mt-3">
                <Progress value={progress} data-testid="progress-daily-limit" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-limit-sub">
                {stats.used} / {stats.dailyLimit} emails used
              </div>
              {resetLabel && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70" data-testid="text-reset-countdown">
                  <Clock className="h-3 w-3" />
                  {resetLabel}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="glass p-6 lg:col-span-2" data-testid="card-activity">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" data-testid="text-activity-title">Recent activity</div>
              <div className="text-xs text-muted-foreground" data-testid="text-activity-sub">
                Latest automation events
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border bg-background/60">
            <Table data-testid="table-activity">
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="th-contact">Contact</TableHead>
                  <TableHead data-testid="th-action">Action</TableHead>
                  <TableHead className="text-right" data-testid="th-time">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} data-testid={`row-activity-skeleton-${i}`}>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                  : activity.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No recent activity
                        </TableCell>
                      </TableRow>
                    )
                    : activity.map((a, i) => (
                      <TableRow key={i} data-testid={`row-activity-${i}`}>
                        <TableCell className="font-medium" data-testid={`text-activity-contact-${i}`}>
                          {a.contact}
                        </TableCell>
                        <TableCell data-testid={`text-activity-action-${i}`}>{a.action}</TableCell>
                        <TableCell className="text-right text-muted-foreground" data-testid={`text-activity-time-${i}`}>
                          {a.createdAt ? relativeTime(a.createdAt) : ""}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="glass p-6" data-testid="card-insights">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground" data-testid="badge-insights">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold" data-testid="text-insights-title">Today's focus</div>
              <div className="text-xs text-muted-foreground" data-testid="text-insights-sub">
                Keep reply rate high
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            {steps.map((t, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2" data-testid={`row-insight-${idx}`}>
                <div className="text-muted-foreground" data-testid="text-insight">{t}</div>
                <Badge variant="secondary" className="rounded-full" data-testid={`badge-insight-${idx}`}>
                  AI
                </Badge>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            className="mt-5 w-full"
            disabled={nextStepsMutation.isPending}
            onClick={() => nextStepsMutation.mutate()}
            data-testid="button-generate-next-steps"
          >
            {nextStepsMutation.isPending ? "Generating…" : "Generate next steps"}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
