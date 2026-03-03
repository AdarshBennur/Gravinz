import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, Send, Calendar, Zap, BarChart3, ArrowUpRight } from "lucide-react";

import AppShell from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Range = "7d" | "30d" | "90d" | "180d";

interface DayVolume {
  date: string;
  total: number;
  replies: number;
  initial: number;
  [key: string]: string | number; // followup_1, followup_2, followup_3…
}

interface EfficiencyRow {
  type: string;
  sent: number;
  replied: number;
  replyRate: number;
}

interface VolumeData {
  range: Range;
  followupCount: number;
  volume: DayVolume[];
  summary: {
    totalSent: number;
    totalReplies: number;
    replyRate: number;
    avgPerDay: number;
    peakDay: DayVolume | null;
  };
  efficiency: EfficiencyRow[];
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const RANGES: { label: string; value: Range }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "180d", value: "180d" },
];

// Palette for stacked bar segments
const STACK_COLORS = [
  "hsl(var(--primary))",        // initial
  "hsl(var(--chart-2))",        // followup_1
  "hsl(var(--chart-3))",        // followup_2
  "hsl(var(--chart-4))",        // followup_3
];

const typeLabel = (type: string) => {
  if (type === "initial") return "Initial";
  const n = type.replace("followup_", "");
  return `Follow-up ${n}`;
};

/* ─── Tooltip ────────────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border px-3 py-2.5 text-xs shadow-xl">
      <div className="mb-1.5 font-semibold text-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill || p.stroke }} />
          <span className="text-muted-foreground">{typeLabel(p.dataKey)}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Skeleton loader ───────────────────────────────────────────────────── */

function MetricSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("30d");

  const { data, isLoading } = useQuery<VolumeData>({
    queryKey: ["/api/analytics/email-volume", range],
    queryFn: () => apiGet<VolumeData>(`/api/analytics/email-volume?range=${range}`),
  });

  const followupCount = data?.followupCount ?? 2;
  const volume = data?.volume ?? [];
  const summary = data?.summary;
  const efficiency = data?.efficiency ?? [];

  // Determine stack keys from followupCount — always consistent with backend
  const stackKeys: string[] = ["initial", ...Array.from({ length: followupCount }, (_, i) => `followup_${i + 1}`)];

  // X-axis label formatting — abbreviate for wider ranges
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (range === "7d") return d.toLocaleDateString("en-US", { weekday: "short" });
    if (range === "30d") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // For chart display — compress label density on large ranges
  const tickInterval = range === "7d" ? 0 : range === "30d" ? 4 : range === "90d" ? 9 : 19;

  const hasData = volume.some((d) => d.total > 0);

  return (
    <AppShell title="Analytics">
      {/* ── Range filter ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        {RANGES.map((r) => (
          <Button
            key={r.value}
            variant={range === r.value ? "default" : "outline"}
            size="sm"
            className="h-8 px-4 text-xs font-medium rounded-lg"
            onClick={() => setRange(r.value)}
            data-testid={`btn-range-${r.value}`}
          >
            {r.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Real data · updates on filter change
        </span>
      </div>

      {/* ── Top metric cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Reply rate */}
        <Card className="glass p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Reply Rate</div>
              {isLoading ? <MetricSkeleton /> : (
                <>
                  <div className="text-3xl font-semibold" data-testid="text-reply-rate">
                    {summary?.replyRate ?? 0}%
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summary?.totalReplies ?? 0} of {summary?.totalSent ?? 0} sent
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl bg-primary/10 p-2">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
        </Card>

        {/* Total sent */}
        <Card className="glass p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Sent</div>
              {isLoading ? <MetricSkeleton /> : (
                <>
                  <div className="text-3xl font-semibold" data-testid="text-total-sent">
                    {summary?.totalSent ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Past {range.replace("d", " days")}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl bg-chart-2/10 p-2">
              <Send className="h-4 w-4 text-chart-2" />
            </div>
          </div>
        </Card>

        {/* Avg per day */}
        <Card className="glass p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Avg / Day</div>
              {isLoading ? <MetricSkeleton /> : (
                <>
                  <div className="text-3xl font-semibold">
                    {summary?.avgPerDay ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Emails per day in range
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl bg-chart-3/10 p-2">
              <BarChart3 className="h-4 w-4 text-chart-3" />
            </div>
          </div>
        </Card>

        {/* Peak day */}
        <Card className="glass p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Peak Day</div>
              {isLoading ? <MetricSkeleton /> : (
                <>
                  <div className="text-3xl font-semibold">
                    {summary?.peakDay?.total ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summary?.peakDay?.date
                      ? new Date(summary.peakDay.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "No data"}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl bg-chart-4/10 p-2">
              <Calendar className="h-4 w-4 text-chart-4" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Main chart: stacked bar ───────────────────────────────────── */}
      <Card className="glass p-6 mb-6" data-testid="card-bar-chart">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-sm font-semibold">Daily Email Volume</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Split by email type · stacked
            </div>
          </div>
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 flex-wrap">
            {stackKeys.map((key, i) => (
              <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STACK_COLORS[i % STACK_COLORS.length] }} />
                {typeLabel(key)}
              </div>
            ))}
          </div>
        </div>

        <div className="h-72" data-testid="chart-bar">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : !hasData ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <BarChart3 className="h-10 w-10 opacity-30" />
              <span className="text-sm">No emails sent in this period</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volume} barSize={range === "7d" ? 32 : range === "30d" ? 14 : 8}
                margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  interval={tickInterval}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--border) / 0.2)" }} />
                {stackKeys.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={STACK_COLORS[i % STACK_COLORS.length]}
                    radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ── Reply rate trend + Efficiency ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5 mb-6">
        {/* Reply rate per day — line chart */}
        <Card className="glass p-6 lg:col-span-3" data-testid="card-reply-trend">
          <div className="text-sm font-semibold mb-1">Reply Rate Trend</div>
          <div className="text-xs text-muted-foreground mb-5">Replies per day in selected window</div>
          <div className="h-52">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : !hasData ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data available yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volume} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    interval={tickInterval}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Total Sent"
                  />
                  <Line
                    type="monotone"
                    dataKey="replies"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                    name="Replies"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Follow-up efficiency cards */}
        <Card className="glass p-6 lg:col-span-2" data-testid="card-efficiency">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold">Follow-up Efficiency</div>
            <Zap className="h-3.5 w-3.5 text-chart-3" />
          </div>
          <div className="text-xs text-muted-foreground mb-5">Reply rate by email type</div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : efficiency.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No data yet
            </div>
          ) : (
            <div className="space-y-2.5">
              {efficiency.map((row, i) => (
                <div
                  key={row.type}
                  className="flex items-center justify-between rounded-xl border bg-background/50 px-3.5 py-3"
                  data-testid={`efficiency-row-${row.type}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: STACK_COLORS[i % STACK_COLORS.length] }}
                    />
                    <div>
                      <div className="text-xs font-medium">{typeLabel(row.type)}</div>
                      <div className="text-[10px] text-muted-foreground">{row.sent} sent</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={row.replyRate > 0 ? "default" : "secondary"}
                      className="text-xs font-semibold"
                    >
                      {row.replyRate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
