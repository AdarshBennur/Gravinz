import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function AnalyticsPage() {
  const data = useMemo(
    () =>
      [
        { day: "Mon", sent: 42, replies: 6 },
        { day: "Tue", sent: 55, replies: 8 },
        { day: "Wed", sent: 60, replies: 9 },
        { day: "Thu", sent: 44, replies: 5 },
        { day: "Fri", sent: 70, replies: 10 },
        { day: "Sat", sent: 30, replies: 4 },
        { day: "Sun", sent: 20, replies: 2 },
      ],
    [],
  );

  const totalSent = data.reduce((a, d) => a + d.sent, 0);
  const totalReplies = data.reduce((a, d) => a + d.replies, 0);
  const replyRate = Math.round((totalReplies / totalSent) * 100);

  const topSubjects = [
    "Quick question about {Role} at {Company}",
    "Loved the {Product} launch — could I help?",
    "Following up (2 min)"
  ];

  return (
    <AppShell title="Analytics" subtitle="Trends, reply rate, and subject performance.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass p-6" data-testid="card-reply-rate">
          <div className="text-xs text-muted-foreground" data-testid="text-reply-rate-label">Reply rate</div>
          <div className="mt-2 text-3xl font-semibold" data-testid="text-reply-rate">{replyRate}%</div>
          <div className="mt-2 text-xs text-muted-foreground" data-testid="text-reply-rate-sub">
            Based on last 7 days (mock)
          </div>
        </Card>
        <Card className="glass p-6" data-testid="card-total-sent">
          <div className="text-xs text-muted-foreground" data-testid="text-total-sent-label">Total emails sent</div>
          <div className="mt-2 text-3xl font-semibold" data-testid="text-total-sent">{totalSent}</div>
          <div className="mt-2 text-xs text-muted-foreground" data-testid="text-total-sent-sub">
            Including follow-ups
          </div>
        </Card>
        <Card className="glass p-6" data-testid="card-followups">
          <div className="text-xs text-muted-foreground" data-testid="text-followups-label">Follow-up performance</div>
          <div className="mt-2 flex items-center gap-2" data-testid="row-followups">
            <Badge className="rounded-full" data-testid="badge-followups">+31%</Badge>
            <span className="text-sm text-muted-foreground" data-testid="text-followups-sub">
              uplift vs. fresh emails
            </span>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="glass p-6 lg:col-span-2" data-testid="card-line-chart">
          <div className="text-sm font-semibold" data-testid="text-chart-title">Weekly trend</div>
          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-chart-sub">
            Sent vs replies
          </div>

          <div className="mt-5 h-64 w-full" data-testid="chart-trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="hsl(var(--border) / 0.6)" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card) / 0.92)",
                    border: "1px solid hsl(var(--border) / 0.7)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow-lg)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="replies"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glass p-6" data-testid="card-subjects">
          <div className="text-sm font-semibold" data-testid="text-subjects-title">Top subject lines</div>
          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-subjects-sub">
            Highest reply rate (mock)
          </div>

          <div className="mt-4 space-y-2 text-sm">
            {topSubjects.map((s, idx) => (
              <div
                key={s}
                className="rounded-xl border bg-background/60 px-3 py-2"
                data-testid={`row-subject-${idx}`}
              >
                <div className="text-muted-foreground" data-testid="text-subject">{s}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
