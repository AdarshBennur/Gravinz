import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, NotionLogoIcon } from "@/components/app/icons";
import { Download, RefreshCw } from "lucide-react";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface IntegrationStatus {
  gmail: { connected: boolean; email?: string | null; configured?: boolean };
  notion: { connected: boolean; metadata?: { databaseId?: string; workspaceName?: string }; configured?: boolean };
}

interface NotionDatabase {
  id: string;
  title: string;
}

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [selectedDbId, setSelectedDbId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      toast({ title: "Gmail connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      window.history.replaceState({}, "", "/app/integrations");
    } else if (params.get("gmail") === "error") {
      toast({ title: "Gmail connection failed", description: params.get("message") || "Please try again" });
      window.history.replaceState({}, "", "/app/integrations");
    }
    if (params.get("notion") === "connected") {
      toast({ title: "Notion connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/notion/databases"] });
      window.history.replaceState({}, "", "/app/integrations");
    } else if (params.get("notion") === "error") {
      toast({ title: "Notion connection failed", description: params.get("message") || "Please try again" });
      window.history.replaceState({}, "", "/app/integrations");
    }
  }, []);

  const { data, isLoading } = useQuery<IntegrationStatus>({
    queryKey: ["/api/integrations"],
    queryFn: () => apiGet<IntegrationStatus>("/api/integrations"),
  });

  const gmailConnected = data?.gmail?.connected ?? false;
  const notionConnected = data?.notion?.connected ?? false;

  const { data: notionDatabases = [], isLoading: dbsLoading, refetch: refetchDbs } = useQuery<NotionDatabase[]>({
    queryKey: ["/api/integrations/notion/databases"],
    queryFn: () => apiGet<NotionDatabase[]>("/api/integrations/notion/databases"),
    enabled: notionConnected,
  });

  const connectGmail = useMutation({
    mutationFn: () => apiPost<any>("/api/integrations/gmail/connect"),
    onSuccess: (result) => {
      if (result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
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
    mutationFn: () => apiPost<any>("/api/integrations/notion/connect"),
    onSuccess: (result) => {
      if (result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Notion connected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  const disconnectNotion = useMutation({
    mutationFn: () => apiPost("/api/integrations/notion/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setSelectedDbId("");
      toast({ title: "Notion disconnected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message }),
  });

  const importFromNotion = useMutation({
    mutationFn: (databaseId: string) => apiPost<any>("/api/integrations/notion/import", { databaseId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Notion Import Complete",
        description: `Imported ${result.imported} contacts${result.skipped ? `, ${result.skipped} skipped` : ""}`,
      });
    },
    onError: (err: Error) => toast({ title: "Import Error", description: err.message }),
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
              {gmailConnected ? "Connected" : "Not connected"}
            </Badge>
          </div>

          {gmailConnected && data?.gmail?.email && (
            <div className="mt-3 text-xs text-muted-foreground">
              Sending from: {data.gmail.email}
            </div>
          )}

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
              disabled={connectGmail.isPending || gmailConnected}
              data-testid="button-connect-gmail"
            >
              {connectGmail.isPending ? "Connecting..." : gmailConnected ? "Connected" : "Connect Gmail"}
            </Button>
            {gmailConnected && (
              <Button
                variant="secondary"
                onClick={() => disconnectGmail.mutate()}
                disabled={disconnectGmail.isPending}
                data-testid="button-disconnect-gmail"
              >
                {disconnectGmail.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            )}
          </div>

          {!data?.gmail?.configured && !gmailConnected && (
            <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
              Requires Google OAuth credentials. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment.
            </div>
          )}
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
                  Import contacts and sync status updates
                </div>
              </div>
            </div>
            <Badge
              variant={notionConnected ? "default" : "secondary"}
              className="rounded-full"
              data-testid="status-notion"
            >
              {notionConnected ? "Connected" : "Not connected"}
            </Badge>
          </div>

          {notionConnected && data?.notion?.metadata?.workspaceName && (
            <div className="mt-3 text-xs text-muted-foreground">
              Workspace: {data.notion.metadata.workspaceName}
            </div>
          )}

          {notionConnected && (
            <div className="mt-5 grid gap-2">
              <div className="flex items-center justify-between">
                <Label data-testid="label-notion-db">Select database</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => refetchDbs()}
                  disabled={dbsLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${dbsLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {dbsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : notionDatabases.length === 0 ? (
                <div className="text-xs text-muted-foreground rounded-lg border bg-background/60 p-3">
                  No databases found in your connected workspace. Make sure you granted access to at least one database during authorization.
                </div>
              ) : (
                <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                  <SelectTrigger data-testid="select-notion-db">
                    <SelectValue placeholder="Choose a database..." />
                  </SelectTrigger>
                  <SelectContent>
                    {notionDatabases.map((db) => (
                      <SelectItem key={db.id} value={db.id}>{db.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {!notionConnected ? (
              <Button
                onClick={() => connectNotion.mutate()}
                disabled={connectNotion.isPending}
                data-testid="button-connect-notion"
              >
                {connectNotion.isPending ? "Connecting..." : "Connect Notion"}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    if (!selectedDbId) {
                      toast({ title: "Select a database", description: "Pick a database from the dropdown to import contacts." });
                      return;
                    }
                    importFromNotion.mutate(selectedDbId);
                  }}
                  disabled={importFromNotion.isPending || !selectedDbId}
                  data-testid="button-import-notion"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {importFromNotion.isPending ? "Importing..." : "Import Contacts"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => disconnectNotion.mutate()}
                  disabled={disconnectNotion.isPending}
                  data-testid="button-disconnect-notion"
                >
                  {disconnectNotion.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
              </>
            )}
          </div>

          {!data?.notion?.configured && !notionConnected && (
            <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
              Requires Notion OAuth credentials. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in your environment.
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
