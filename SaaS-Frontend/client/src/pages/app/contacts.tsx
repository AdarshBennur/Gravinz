import { useMemo, useState } from "react";
import { Plus, Upload, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

type ContactStatus = "replied" | "followup" | "not-sent";

type Contact = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  status: ContactStatus;
  lastSentAt: string | null;
};

const statusLabel: Record<ContactStatus, string> = {
  replied: "Replied",
  followup: "Follow-up",
  "not-sent": "Not sent",
};

function StatusBadge({ status }: { status: ContactStatus }) {
  const variant = status === "replied" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="rounded-full" data-testid={`status-contact-${status}`}>
      {statusLabel[status] ?? status}
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default function ContactsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | ContactStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", role: "", status: "not-sent" as ContactStatus });

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: () => apiGet<Contact[]>("/api/contacts"),
  });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => apiPost("/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact added" });
      setOpen(false);
      setForm({ name: "", email: "", company: "", role: "", status: "not-sent" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message });
    },
  });

  const filtered = useMemo(() => {
    return contacts
      .filter((c) => (filter === "all" ? true : c.status === filter))
      .filter((c) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q)
        );
      });
  }, [contacts, filter, query]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected[c.id]);
  const anySelected = filtered.some((c) => selected[c.id]);

  return (
    <AppShell
      title="Contacts"
      subtitle="Import contacts, track status, and manage follow-ups."
      headerRight={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="secondary"
            onClick={() => toast({ title: "Upload CSV", description: "CSV import coming soon." })}
            data-testid="button-upload-csv"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload CSV
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-contact">
                <Plus className="mr-2 h-4 w-4" />
                Add contact
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg" data-testid="modal-add-contact">
              <DialogHeader>
                <DialogTitle data-testid="text-add-contact-title">Add contact</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" data-testid="label-contact-name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Full name"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email" data-testid="label-contact-email">Email</Label>
                  <Input
                    id="email"
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    placeholder="name@company.com"
                    data-testid="input-contact-email"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="company" data-testid="label-contact-company">Company</Label>
                    <Input
                      id="company"
                      value={form.company}
                      onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))}
                      placeholder="Company"
                      data-testid="input-contact-company"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role" data-testid="label-contact-role">Role</Label>
                    <Input
                      id="role"
                      value={form.role}
                      onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}
                      placeholder="Role"
                      data-testid="input-contact-role"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label data-testid="label-contact-status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((s) => ({ ...s, status: v as ContactStatus }))}
                  >
                    <SelectTrigger data-testid="select-contact-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-sent" data-testid="option-status-not-sent">Not sent</SelectItem>
                      <SelectItem value="followup" data-testid="option-status-followup">Follow-up</SelectItem>
                      <SelectItem value="replied" data-testid="option-status-replied">Replied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-add-contact"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => addMutation.mutate(form)}
                  disabled={addMutation.isPending}
                  data-testid="button-confirm-add-contact"
                >
                  {addMutation.isPending ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="grid gap-4">
        <Card className="glass p-4" data-testid="card-contacts-controls">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Input
                type="search"
                placeholder="Search contacts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full sm:w-72"
                data-testid="input-search-contacts"
              />
              {anySelected ? (
                <Badge variant="secondary" className="rounded-full" data-testid="badge-selected">
                  {filtered.filter((c) => selected[c.id]).length} selected
                </Badge>
              ) : null}
            </div>

            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} data-testid="tabs-filters">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="replied" data-testid="tab-replied">Replied</TabsTrigger>
                <TabsTrigger value="followup" data-testid="tab-followup">Follow-up</TabsTrigger>
                <TabsTrigger value="not-sent" data-testid="tab-not-sent">Not sent</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Card>

        <Card className="glass overflow-hidden" data-testid="card-contacts-table">
          <div className="overflow-auto">
            <Table data-testid="table-contacts">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" data-testid="th-select">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => {
                        const next: Record<string, boolean> = { ...selected };
                        filtered.forEach((c) => (next[c.id] = Boolean(v)));
                        setSelected(next);
                      }}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead data-testid="th-name">Name</TableHead>
                  <TableHead data-testid="th-email">Email</TableHead>
                  <TableHead data-testid="th-company">Company</TableHead>
                  <TableHead data-testid="th-role">Role</TableHead>
                  <TableHead data-testid="th-status">Status</TableHead>
                  <TableHead data-testid="th-last-sent">Last sent</TableHead>
                  <TableHead className="w-10" data-testid="th-actions"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : filtered.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No contacts found
                        </TableCell>
                      </TableRow>
                    )
                    : filtered.map((c) => (
                      <TableRow key={c.id} data-testid={`row-contact-${c.id}`}>
                        <TableCell data-testid={`cell-select-${c.id}`}>
                          <Checkbox
                            checked={Boolean(selected[c.id])}
                            onCheckedChange={(v) => setSelected((s) => ({ ...s, [c.id]: Boolean(v) }))}
                            data-testid={`checkbox-select-${c.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-contact-name-${c.id}`}>{c.name}</TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-contact-email-${c.id}`}>{c.email}</TableCell>
                        <TableCell data-testid={`text-contact-company-${c.id}`}>{c.company}</TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-contact-role-${c.id}`}>{c.role}</TableCell>
                        <TableCell data-testid={`cell-status-${c.id}`}><StatusBadge status={c.status} /></TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-contact-last-sent-${c.id}`}>{formatDate(c.lastSentAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
