import { useMemo, useState } from "react";
import { Mail, NotionLogoIcon } from "@/components/app/icons";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { mockRequest } from "@/lib/mock-api";

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [dbId, setDbId] = useState("");

  const gmailStatus = useMemo(() => (gmailConnected ? "Connected" : "Not connected"), [gmailConnected]);
  const notionStatus = useMemo(
    () => (notionConnected ? "Connected" : dbId.trim() ? "Ready to connect" : "Not connected"),
    [notionConnected, dbId],
  );

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
              onCheckedChange={(v) => setGmailConnected(v)}
              data-testid="switch-gmail"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={async () => {
                await mockRequest(true, 650);
                setGmailConnected(true);
                toast({ title: "Gmail connected (mock)", description: "UI-only connection state." });
              }}
              data-testid="button-connect-gmail"
            >
              Connect Gmail
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setGmailConnected(false);
                toast({ title: "Disconnected", description: "UI-only state reset." });
              }}
              data-testid="button-disconnect-gmail"
            >
              Disconnect
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
              onClick={async () => {
                if (!dbId.trim()) {
                  toast({ title: "Add a Database ID", description: "This is required to connect (UI)." });
                  return;
                }
                await mockRequest(true, 650);
                setNotionConnected(true);
                toast({ title: "Notion connected (mock)", description: "UI-only connection state." });
              }}
              data-testid="button-connect-notion"
            >
              Connect
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setNotionConnected(false);
                setDbId("");
                toast({ title: "Disconnected", description: "UI-only state reset." });
              }}
              data-testid="button-disconnect-notion"
            >
              Disconnect
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
