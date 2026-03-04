import { useEffect, useState } from "react";
import { Clock, TrendingUp, Mail, MailCheck, MessageSquareReply, XCircle, Users, Hourglass, ListTodo, ArrowRight } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { DemoModeBanner } from "@/components/app/demo-banner";

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 140, damping: 18 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  return <motion.span data-testid="text-animated-number">{rounded}</motion.span>;
}

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

function computeResetCountdown(timezone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
    const hour = get("hour"), minute = get("minute"), second = get("second");
    const elapsedSec = hour * 3600 + minute * 60 + second;
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
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);
  return label;
}

interface DashboardData {
  stats: {
    sentToday: number;
    followupsPending: number;
    replies: number;
    dailyLimit: number | null;
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

interface MetricsData {
  followupCount: number;
  total: { totalSent: number; byFollowup: Record<number, number> };
  today: { totalSent: number; byFollowup: Record<number, number> };
  replies: number;
  rejected: number;
  replyRate: number;
  // Intelligence fields
  funnel: { sent: number; replied: number; rejected: number };
  averageReplyTimeHours: number | null;
  activeContacts: number;
  pendingFirstEmails: number;
  pendingFollowups: { total: number; byLevel: Record<number, number> };
}

/** Small breakdown row inside a metric card */
function BreakdownRow({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {loading ? <Skeleton className="h-3 w-6 inline-block" /> : value}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data, isLoading: loading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
    enabled: !!user,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricsData>({
    queryKey: ["/api/dashboard/metrics"],
    queryFn: () => apiGet<MetricsData>("/api/dashboard/metrics"),
    staleTime: 60_000,
    enabled: !!user,
  });

  const { data: campaignSettings } = useQuery<{ timezone?: string }>({
    queryKey: ["/api/campaign-settings"],
    queryFn: () => apiGet<{ timezone?: string }>("/api/campaign-settings"),
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  const resetLabel = useResetCountdown(campaignSettings?.timezone);

  const stats = data?.stats ?? { sentToday: 0, followupsPending: 0, replies: 0, dailyLimit: 5, used: 0 };
  const activity = data?.activity ?? [];
  const running = data?.automationStatus === "running";
  const isOwner = data?.isOwner ?? false;
  const trialExpired = data?.trialExpired ?? false;

  const m: MetricsData = metrics ?? {
    followupCount: 2,
    total: { totalSent: 0, byFollowup: { 0: 0, 1: 0, 2: 0 } as Record<number, number> },
    today: { totalSent: 0, byFollowup: { 0: 0, 1: 0, 2: 0 } as Record<number, number> },
    replies: 0,
    rejected: 0,
    replyRate: 0,
    funnel: { sent: 0, replied: 0, rejected: 0 },
    averageReplyTimeHours: null,
    activeContacts: 0,
    pendingFirstEmails: 0,
    pendingFollowups: { total: 0, byLevel: {} as Record<number, number> },
  };


  // Number of configured follow-ups (dynamic — 1..N)
  const followupCount = m.followupCount ?? 2;

  const toggleMutation = useMutation({
    mutationFn: () =>
      apiPost(running ? "/api/automation/pause" : "/api/automation/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: running ? "Automation paused" : "Automation started" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const effectiveDailyLimit = stats.dailyLimit ?? 0;
  const progress = effectiveDailyLimit > 0
    ? Math.min(100, Math.round((stats.used / effectiveDailyLimit) * 100))
    : 0;

  return (
    <AppShell
      title="Dashboard"
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
              <><Pause className="mr-2 h-4 w-4" /> Pause</>
            ) : (
              <><Play className="mr-2 h-4 w-4" /> Start</>
            )}
          </Button>
        </div>
      }
    >
      {/* ── Top KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-4">

        {/* Card 1 — Total Emails Sent (all-time) */}
        <Card className="glass p-5" data-testid="card-kpi-total-sent">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Total emails sent</div>
          </div>
          <div className="mt-2 text-2xl font-semibold" data-testid="text-kpi-total-sent">
            {metricsLoading ? <Skeleton className="h-7 w-14" /> : <AnimatedNumber value={m.total.totalSent} />}
          </div>
          <div className="mt-3 space-y-1.5 border-t pt-3">
            <BreakdownRow label="First email" value={m.total.byFollowup[0] ?? 0} loading={metricsLoading} />
            {Array.from({ length: followupCount }, (_, i) => (
              <BreakdownRow
                key={i + 1}
                label={`Follow-up ${i + 1}`}
                value={m.total.byFollowup[i + 1] ?? 0}
                loading={metricsLoading}
              />
            ))}
          </div>
        </Card>

        {/* Card 2 — Emails Sent Today */}
        <Card className="glass p-5" data-testid="card-kpi-today-sent">
          <div className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Emails sent today</div>
          </div>
          <div className="mt-2 text-2xl font-semibold" data-testid="text-kpi-today-sent">
            {metricsLoading ? <Skeleton className="h-7 w-14" /> : <AnimatedNumber value={m.today.totalSent} />}
          </div>
          <div className="mt-3 space-y-1.5 border-t pt-3">
            <BreakdownRow label="First email" value={m.today.byFollowup[0] ?? 0} loading={metricsLoading} />
            {Array.from({ length: followupCount }, (_, i) => (
              <BreakdownRow
                key={i + 1}
                label={`Follow-up ${i + 1}`}
                value={m.today.byFollowup[i + 1] ?? 0}
                loading={metricsLoading}
              />
            ))}
          </div>
        </Card>

        {/* Card 3 — Replies & Rejected */}
        <Card className="glass p-5" data-testid="card-kpi-replies">
          <div className="flex items-center gap-2">
            <MessageSquareReply className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Replies & rejected</div>
          </div>
          <div className="mt-2 text-2xl font-semibold" data-testid="text-kpi-replies">
            {metricsLoading ? <Skeleton className="h-7 w-14" /> : <AnimatedNumber value={m.replies} />}
          </div>
          <div className="mt-3 space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Rejected
              </span>
              <span className="font-medium tabular-nums">
                {metricsLoading ? <Skeleton className="h-3 w-6 inline-block" /> : m.rejected}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Reply rate
              </span>
              <span className="font-medium tabular-nums">
                {metricsLoading ? <Skeleton className="h-3 w-8 inline-block" /> : `${m.replyRate}%`}
              </span>
            </div>
          </div>
        </Card>

        {/* Card 4 — Daily Limit Progress (UNTOUCHED) */}
        <Card className="glass p-5" data-testid="card-kpi-limit">
          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : trialExpired ? (
            <div className="flex h-full flex-col justify-between" data-testid="div-trial-expired">
              <div className="text-xs text-muted-foreground">Daily limit</div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="text-xs font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5"
                  data-testid="badge-trial-expired"
                >
                  Trial expired
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-trial-expired-sub">
                Your 14-day free trial has ended. Sending is disabled.
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground" data-testid="text-limit-label">
                  Daily limit progress
                </div>
                <div className="flex items-center gap-1.5">
                  {isOwner && (
                    <span
                      className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5"
                      data-testid="badge-owner"
                    >
                      Owner
                    </span>
                  )}
                  <span className="text-xs font-medium" data-testid="text-limit-percent">
                    {progress}%
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={progress} data-testid="progress-daily-limit" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-limit-sub">
                {stats.used} / {effectiveDailyLimit > 0 ? effectiveDailyLimit : "—"} emails used
              </div>
              {resetLabel && (
                <div
                  className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70"
                  data-testid="text-reset-countdown"
                >
                  <Clock className="h-3 w-3" />
                  {resetLabel}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ── Intelligence Row ─────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">

        {/* Card A — Conversion Funnel */}
        <Card className="glass p-5" data-testid="card-funnel">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Conversion funnel</div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            {[
              { label: "Sent", value: m.funnel?.sent ?? m.total.totalSent, color: "text-primary" },
              { label: "Replied", value: m.funnel?.replied ?? m.replies, color: "text-green-500" },
              { label: "Rejected", value: m.funnel?.rejected ?? m.rejected, color: "text-destructive" },
            ].map((step, idx, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="text-center">
                  <div className={`text-xl font-semibold tabular-nums ${step.color}`}>
                    {metricsLoading ? <Skeleton className="h-6 w-10" /> : <AnimatedNumber value={step.value} />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{step.label}</div>
                </div>
                {idx < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            ))}
          </div>
          <div className="mt-3 border-t pt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Reply rate</span>
            <span className="font-semibold text-green-500">
              {metricsLoading ? <Skeleton className="h-3 w-8 inline-block" /> : `${m.replyRate}%`}
            </span>
          </div>
        </Card>

        {/* Card B — Reply Intelligence */}
        <Card className="glass p-5" data-testid="card-reply-intelligence">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Reply intelligence</div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Avg reply time</div>
                <div className="text-2xl font-semibold mt-0.5 tabular-nums" data-testid="text-avg-reply-time">
                  {metricsLoading ? (
                    <Skeleton className="h-7 w-20" />
                  ) : m.averageReplyTimeHours === null ? (
                    <span className="text-muted-foreground text-sm">No replies yet</span>
                  ) : m.averageReplyTimeHours < 1 ? (
                    `${Math.round(m.averageReplyTimeHours * 60)}m`
                  ) : (
                    `${m.averageReplyTimeHours}h`
                  )}
                </div>
              </div>
              <MessageSquareReply className="h-8 w-8 text-muted-foreground/20" />
            </div>
            <div className="border-t pt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Replies received</span>
                <span className="font-medium tabular-nums">
                  {metricsLoading ? <Skeleton className="h-3 w-6 inline-block" /> : m.replies}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Rejected</span>
                <span className="font-medium tabular-nums text-destructive">
                  {metricsLoading ? <Skeleton className="h-3 w-6 inline-block" /> : m.rejected}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Card C — Pipeline Status */}
        <Card className="glass p-5" data-testid="card-pipeline">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Pipeline status</div>
          </div>
          <div className="mt-3 space-y-2">
            {/* Active contacts */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span>Active contacts</span>
              </div>
              <span className="font-semibold tabular-nums text-primary" data-testid="text-active-contacts">
                {metricsLoading ? <Skeleton className="h-4 w-8 inline-block" /> : <AnimatedNumber value={m.activeContacts ?? 0} />}
              </span>
            </div>

            {/* Pending first emails */}
            <div className="flex items-center justify-between text-xs border-t pt-2">
              <span className="text-muted-foreground">Pending first email</span>
              <span className="font-medium tabular-nums">
                {metricsLoading ? <Skeleton className="h-3 w-6 inline-block" /> : m.pendingFirstEmails ?? 0}
              </span>
            </div>

            {/* Pending follow-ups — dynamic 1..N */}
            {followupCount > 0 && (
              <>
                <div className="text-xs text-muted-foreground border-t pt-2">Pending follow-ups</div>
                {Array.from({ length: followupCount }, (_, i) => (
                  <div key={i + 1} className="flex items-center justify-between text-xs pl-2">
                    <span className="text-muted-foreground">Follow-up {i + 1}</span>
                    <span className="font-medium tabular-nums">
                      {metricsLoading
                        ? <Skeleton className="h-3 w-5 inline-block" />
                        : m.pendingFollowups?.byLevel[i + 1] ?? 0}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ── Bottom row — Recent Activity (full width, Today's Focus removed) ── */}
      <div className="mt-6">
        <Card className="glass p-6" data-testid="card-activity">
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
      </div>
    </AppShell>
  );
}
