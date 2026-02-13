import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPut } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface CampaignSettings {
  dailyLimit: number;
  followups: number;
  delays: number[];
  priority: "followups" | "fresh" | "balanced";
  balanced: number;
}

export default function CampaignSettingsPage() {
  const { toast } = useToast();
  const [dailyLimit, setDailyLimit] = useState(80);
  const [followups, setFollowups] = useState(2);
  const [delays, setDelays] = useState<number[]>([2, 4]);
  const [priority, setPriority] = useState<"followups" | "fresh" | "balanced">("balanced");
  const [balanced, setBalanced] = useState(60);

  const { data, isLoading } = useQuery<CampaignSettings>({
    queryKey: ["/api/campaign-settings"],
    queryFn: () => apiGet<CampaignSettings>("/api/campaign-settings"),
  });

  useEffect(() => {
    if (data) {
      setDailyLimit(data.dailyLimit ?? 80);
      setFollowups(data.followups ?? 2);
      setDelays(data.delays ?? [2, 4]);
      setPriority(data.priority ?? "balanced");
      setBalanced(data.balanced ?? 60);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut("/api/campaign-settings", { dailyLimit, followups, delays, priority, balanced }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-settings"] });
      toast({ title: "Saved", description: "Campaign settings saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const delayFields = useMemo(() => Array.from({ length: followups }), [followups]);

  if (isLoading) {
    return (
      <AppShell title="Campaign settings" subtitle="Tune daily limits, follow-up cadence, and prioritization.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="glass p-6 lg:col-span-2">
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
          <Card className="glass p-6">
            <Skeleton className="h-40 w-full" />
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Campaign settings"
      subtitle="Tune daily limits, follow-up cadence, and prioritization."
      headerRight={
        <Badge variant="secondary" className="rounded-full" data-testid="status-campaign">
          Draft
        </Badge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass p-6 lg:col-span-2" data-testid="card-campaign-form">
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="limit" data-testid="label-daily-limit">Daily send limit</Label>
              <Input
                id="limit"
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value || 0))}
                data-testid="input-daily-limit"
              />
              <div className="text-xs text-muted-foreground" data-testid="help-daily-limit">
                Start conservative to protect deliverability.
              </div>
            </div>

            <div className="grid gap-2">
              <Label data-testid="label-followups">Number of follow-ups</Label>
              <Select value={String(followups)} onValueChange={(v) => {
                const n = Number(v);
                setFollowups(n);
                setDelays((prev) => {
                  const next = prev.slice(0, n);
                  while (next.length < n) next.push((next[next.length - 1] ?? 2) + 2);
                  return next;
                });
              }}>
                <SelectTrigger data-testid="select-followups">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)} data-testid={`option-followups-${n}`}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-semibold" data-testid="text-delays-title">Follow-up delays</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {delayFields.map((_, idx) => (
                  <div key={idx} className="grid gap-2" data-testid={`field-delay-${idx}`}>
                    <Label htmlFor={`delay-${idx}`} data-testid={`label-delay-${idx}`}>Delay #{idx + 1} (days)</Label>
                    <Input
                      id={`delay-${idx}`}
                      type="number"
                      value={delays[idx] ?? 2}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setDelays((prev) => {
                          const next = [...prev];
                          next[idx] = v;
                          return next;
                        });
                      }}
                      data-testid={`input-delay-${idx}`}
                    />
                  </div>
                ))}
              </div>
              {followups === 0 ? (
                <div className="text-xs text-muted-foreground" data-testid="empty-followups">
                  No follow-ups enabled.
                </div>
              ) : null}
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-semibold" data-testid="text-priority-title">Priority mode</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { key: "followups", label: "Follow-ups first" },
                  { key: "fresh", label: "Fresh emails first" },
                  { key: "balanced", label: "Balanced" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    className={
                      "rounded-xl border px-3 py-3 text-left text-sm transition-colors hover:bg-background/60 " +
                      (priority === (opt.key as any) ? "bg-background/70 ring-soft" : "bg-background/40")
                    }
                    onClick={() => setPriority(opt.key as any)}
                    data-testid={`button-priority-${opt.key}`}
                  >
                    <div className="font-medium" data-testid="text-priority-label">{opt.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-priority-sub">
                      {opt.key === "balanced"
                        ? "Blend both based on a ratio"
                        : opt.key === "followups"
                          ? "Clear queued follow-ups first"
                          : "Send new prospects first"}
                    </div>
                  </button>
                ))}
              </div>

              {priority === "balanced" ? (
                <div className="mt-1 rounded-xl border bg-background/60 p-4" data-testid="card-balanced">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium" data-testid="text-balanced-title">Balanced ratio</div>
                    <div className="text-sm text-muted-foreground" data-testid="text-balanced-value">
                      {balanced}% follow-ups
                    </div>
                  </div>
                  <div className="mt-3">
                    <Slider
                      value={[balanced]}
                      onValueChange={(v) => setBalanced(v[0] ?? 60)}
                      max={100}
                      step={5}
                      data-testid="slider-balanced"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => toast({ title: "Preview", description: "Preview mode coming soon." })}
                data-testid="button-preview-settings"
              >
                Preview
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-settings"
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="glass p-6" data-testid="card-campaign-summary">
          <div className="text-sm font-semibold" data-testid="text-summary-title">Summary</div>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between" data-testid="row-summary-limit">
              <div className="text-muted-foreground">Daily limit</div>
              <div className="font-medium" data-testid="text-summary-limit">{dailyLimit}</div>
            </div>
            <div className="flex items-center justify-between" data-testid="row-summary-followups">
              <div className="text-muted-foreground">Follow-ups</div>
              <div className="font-medium" data-testid="text-summary-followups">{followups}</div>
            </div>
            <div className="flex items-center justify-between" data-testid="row-summary-priority">
              <div className="text-muted-foreground">Priority</div>
              <div className="font-medium" data-testid="text-summary-priority">{priority}</div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border bg-background/60 p-4" data-testid="card-validation">
            <div className="text-sm font-medium" data-testid="text-validation-title">Deliverability checks</div>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              {[
                dailyLimit <= 120 ? "Daily limit is within safe range" : "Daily limit may be too aggressive",
                followups <= 3 ? "Follow-up count is conservative" : "Consider fewer follow-ups",
              ].map((t, i) => (
                <div key={i} className="flex items-center justify-between" data-testid={`text-validation-${i}`}>
                  <span>{t}</span>
                  <Badge variant="secondary" className="rounded-full">AI</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
