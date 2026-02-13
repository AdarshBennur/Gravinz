import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, NotionLogoIcon } from "@/components/app/icons";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface IntegrationStatus {
  gmail: { connected: boolean };
  notion: { connected: boolean; metadata?: { databaseId?: string } };
}

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [dbId, setDbId] = useState("");

  const { data, isLoading } = useQuery<IntegrationStatus>({
    queryKey: ["/api/integrations"],
    queryFn: () => apiGet<IntegrationStatus>("/api/integrations"),
  });

  const gmailConnected = data?.gmail?.connected ?? false;
  const notionConnected = data?.notion?.connected ?? false;

  const gmailStatus = gmailConnected ? "Connected" : "Not connected";
  const notionStatus = notionConnected ? "Connected" : dbId.trim() ? "Ready to connect" : "Not connected";

  const connectGmail = useMutation({
    mutationFn: () => apiPost("/api/integrations/gmail/connect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Gmail connected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  const disconnectGmail = useMutation({
    mutationFn: () => apiPost("/api/integrations/gmail/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Gmail disconnected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  const connectNotion = useMutation({
    mutationFn: () => apiPost("/api/integrations/notion/connect", { databaseId: dbId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Notion connected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  const disconnectNotion = useMutation({
    mutationFn: () => apiPost("/api/integrations/notion/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setDbId("");
      toast({ title: "Notion disconnected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  if (isLoading) {
    return (
      <AppShell title="Integrations" subtitle="Connect the tools your workflow already lives in.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="glass p-6"><Skeleton className="h-40 w-full" /></Card>
          <Card className="glass p-6"><Skeleton className="h-40 w-full" /></Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Integrations" subtitle="Connect the tools your workflow already lives in.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass p-6" data-testid="card-gmail">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-background/70 border" data-testid="img-gmail">
                <Mail />
              </div>
              <div>
                <div className="text-sm font-semibold" data-testid="text-gmail-title">Gmail</div>
                <div className="text-xs text-muted-foreground" data-testid="text-gmail-sub">
                  Send and track replies from your inbox
                </div>
              </div>
            </div>
            <Badge
              variant={gmailConnected ? "default" : "secondary"}
              className="rounded-full"
              data-testid="status-gmail"
            >
              {gmailStatus}
            </Badge>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border bg-background/60 px-3 py-3">
            <div className="text-sm text-muted-foreground" data-testid="text-gmail-toggle">
              Enable sending
            </div>
            <Switch
              checked={gmailConnected}
              onCheckedChange={(v) => {
                if (v) connectGmail.mutate();
                else disconnectGmail.mutate();
              }}
              data-testid="switch-gmail"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => connectGmail.mutate()}
              disabled={connectGmail.isPending}
              data-testid="button-connect-gmail"
            >
              {connectGmail.isPending ? "Connecting…" : "Connect Gmail"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => disconnectGmail.mutate()}
              disabled={disconnectGmail.isPending}
              data-testid="button-disconnect-gmail"
            >
              {disconnectGmail.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </Card>

        <Card className="glass p-6" data-testid="card-notion">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-background/70 border" data-testid="img-notion">
                <NotionLogoIcon />
              </div>
              <div>
                <div className="text-sm font-semibold" data-testid="text-notion-title">Notion</div>
                <div className="text-xs text-muted-foreground" data-testid="text-notion-sub">
                  Sync contacts and campaign notes
                </div>
              </div>
            </div>
            <Badge
              variant={notionConnected ? "default" : "secondary"}
              className="rounded-full"
              data-testid="status-notion"
            >
              {notionStatus}
            </Badge>
          </div>

          <div className="mt-5 grid gap-2">
            <Label htmlFor="db" data-testid="label-notion-db">Database ID</Label>
            <Input
              id="db"
              placeholder="e.g. 8f3a..."
              value={dbId}
              onChange={(e) => setDbId(e.target.value)}
              data-testid="input-notion-db"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                if (!dbId.trim()) {
                  toast({ title: "Add a Database ID", description: "This is required to connect." });
                  return;
                }
                connectNotion.mutate();
              }}
              disabled={connectNotion.isPending}
              data-testid="button-connect-notion"
            >
              {connectNotion.isPending ? "Connecting…" : "Connect"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => disconnectNotion.mutate()}
              disabled={disconnectNotion.isPending}
              data-testid="button-disconnect-notion"
            >
              {disconnectNotion.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
