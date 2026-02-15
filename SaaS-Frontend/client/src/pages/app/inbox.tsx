import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  MailOpen,
  Reply,
  Send,
  Search,
  User,
  Building2,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronRight,
} from "lucide-react";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGet } from "@/lib/api";

interface ThreadListItem {
  contactId: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  status: string;
  source: string | null;
  lastMessage: {
    subject: string | null;
    bodyPreview: string;
    sentAt: string | null;
    status: string | null;
    followupNumber: number | null;
  } | null;
  unread: boolean;
  messageCount: number;
  analytics: { delivered: number; opened: number; replied: number };
}

interface ThreadMessage {
  id: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  followupNumber: number | null;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  gmailThreadId: string | null;
  direction: "outbound" | "inbound";
}

interface ThreadDetail {
  contact: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    role: string | null;
    status: string;
    source: string | null;
    followupsSent: number | null;
    lastSentAt: string | null;
    createdAt: string;
  };
  thread: ThreadMessage[];
  analytics: { delivered: number; opened: number; replied: number; total: number };
}

const statusLabel: Record<string, string> = {
  "not-sent": "Not Applied",
  sent: "First Email Sent",
  "followup-1": "Follow-Up 1",
  "followup-2": "Follow-Up 2",
  followup: "Follow-Up",
  replied: "Replied",
  bounced: "Bounced",
  paused: "Paused",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  replied: "default",
  sent: "secondary",
  "followup-1": "secondary",
  "followup-2": "secondary",
  "not-sent": "outline",
  bounced: "destructive",
  paused: "outline",
};

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return d.toLocaleDateString("en-US", { weekday: "short" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function EmailStatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case "replied":
      return <Reply className="h-3.5 w-3.5 text-green-500" />;
    case "opened":
      return <MailOpen className="h-3.5 w-3.5 text-blue-500" />;
    case "delivered":
    case "sent":
      return <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />;
    case "bounced":
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    default:
      return <Send className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: threads = [], isLoading: threadsLoading } = useQuery<ThreadListItem[]>({
    queryKey: ["/api/inbox/threads", search],
    queryFn: () => apiGet<ThreadListItem[]>(`/api/inbox/threads${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  const activeContactId = selectedId || (threads.length > 0 ? threads[0].contactId : null);

  const { data: detail, isLoading: detailLoading } = useQuery<ThreadDetail>({
    queryKey: ["/api/inbox/threads", activeContactId],
    queryFn: () => apiGet<ThreadDetail>(`/api/inbox/threads/${activeContactId}`),
    enabled: !!activeContactId,
  });

  return (
    <AppShell title="Inbox" subtitle="View conversations, track opens, and manage replies.">
      <div className="grid h-[calc(100dvh-180px)] gap-0 overflow-hidden rounded-2xl border bg-background/50 backdrop-blur lg:grid-cols-[320px_1fr_300px]">
        {/* LEFT SIDEBAR - Contact List */}
        <div className="flex flex-col border-r">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {threadsLoading ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Mail className="mx-auto h-8 w-8 mb-2 opacity-40" />
                No conversations yet
              </div>
            ) : (
              <div className="p-1.5">
                {threads.map((t) => (
                  <button
                    key={t.contactId}
                    onClick={() => setSelectedId(t.contactId)}
                    className={
                      "w-full text-left rounded-xl px-3 py-2.5 transition-colors " +
                      (activeContactId === t.contactId
                        ? "bg-sidebar-accent ring-soft"
                        : "hover:bg-sidebar-accent/50")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.unread && (
                          <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />
                        )}
                        <span className={`text-sm truncate ${t.unread ? "font-semibold" : "font-medium"}`}>
                          {t.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(t.lastMessage?.sentAt || null)}
                      </span>
                    </div>
                    {t.company && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {t.company}{t.role ? ` · ${t.role}` : ""}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <span className="text-xs text-muted-foreground truncate">
                        {t.lastMessage
                          ? t.lastMessage.subject || t.lastMessage.bodyPreview
                          : "No messages yet"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.messageCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">{t.messageCount}</span>
                        )}
                        <Badge
                          variant={statusVariant[t.status] || "secondary"}
                          className="rounded-full text-[10px] px-1.5 py-0"
                        >
                          {statusLabel[t.status] || t.status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* MIDDLE PANEL - Conversation Thread */}
        <div className="flex flex-col min-w-0">
          {!activeContactId ? (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
              Select a contact to view conversation
            </div>
          ) : detailLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : !detail ? (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
              Contact not found
            </div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{detail.contact.name}</div>
                  <div className="text-xs text-muted-foreground">{detail.contact.email}</div>
                </div>
                <Badge variant={statusVariant[detail.contact.status] || "secondary"} className="rounded-full">
                  {statusLabel[detail.contact.status] || detail.contact.status}
                </Badge>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {detail.thread.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      <Send className="mx-auto h-8 w-8 mb-2 opacity-40" />
                      No emails sent to this contact yet
                    </div>
                  ) : (
                    detail.thread.map((msg) => (
                      <div key={msg.id} className="rounded-xl border bg-background/70 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <EmailStatusIcon status={msg.status} />
                            <span className="text-xs font-medium">
                              {!msg.followupNumber ? "Initial Email" : `Follow-Up ${msg.followupNumber}`}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {formatFullDate(msg.sentAt)}
                          </span>
                        </div>

                        {msg.subject && (
                          <div className="mt-2 text-sm font-medium">{msg.subject}</div>
                        )}

                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {msg.body}
                        </div>

                        <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                          {msg.sentAt && (
                            <span className="flex items-center gap-1">
                              <Send className="h-3 w-3" /> Sent
                            </span>
                          )}
                          {msg.openedAt && (
                            <span className="flex items-center gap-1">
                              <MailOpen className="h-3 w-3 text-blue-500" /> Opened {formatTime(msg.openedAt)}
                            </span>
                          )}
                          {msg.repliedAt && (
                            <span className="flex items-center gap-1">
                              <Reply className="h-3 w-3 text-green-500" /> Replied {formatTime(msg.repliedAt)}
                            </span>
                          )}
                          {msg.status === "bounced" && (
                            <span className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3 w-3" /> Bounced
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* RIGHT PANEL - Contact Details & Analytics */}
        <div className="hidden lg:flex flex-col border-l">
          {detail ? (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{detail.contact.name}</div>
                      <div className="text-xs text-muted-foreground">{detail.contact.email}</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</div>
                  {detail.contact.company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{detail.contact.company}</span>
                    </div>
                  )}
                  {detail.contact.role && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{detail.contact.role}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Added {formatFullDate(detail.contact.createdAt)}</span>
                  </div>
                  {detail.contact.source && (
                    <div className="flex items-center gap-2 text-sm">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground capitalize">Source: {detail.contact.source}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Analytics</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border bg-background/60 p-3 text-center">
                      <div className="text-lg font-bold">{detail.analytics.total}</div>
                      <div className="text-[10px] text-muted-foreground">Total Sent</div>
                    </div>
                    <div className="rounded-xl border bg-background/60 p-3 text-center">
                      <div className="text-lg font-bold">{detail.analytics.delivered}</div>
                      <div className="text-[10px] text-muted-foreground">Delivered</div>
                    </div>
                    <div className="rounded-xl border bg-background/60 p-3 text-center">
                      <div className="text-lg font-bold text-blue-500">{detail.analytics.opened}</div>
                      <div className="text-[10px] text-muted-foreground">Opened</div>
                    </div>
                    <div className="rounded-xl border bg-background/60 p-3 text-center">
                      <div className="text-lg font-bold text-green-500">{detail.analytics.replied}</div>
                      <div className="text-[10px] text-muted-foreground">Replied</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign Info</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={statusVariant[detail.contact.status] || "secondary"} className="rounded-full text-[10px]">
                        {statusLabel[detail.contact.status] || detail.contact.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Follow-ups</span>
                      <span className="font-medium">{detail.contact.followupsSent ?? 0}</span>
                    </div>
                    {detail.contact.lastSentAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last sent</span>
                        <span className="text-xs">{formatFullDate(detail.contact.lastSentAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm p-4">
              Select a contact to view details
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
