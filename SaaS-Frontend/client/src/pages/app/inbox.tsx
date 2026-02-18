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

import { apiGet } from "@/lib/api";
import { useTimezone } from "@/hooks/use-timezone";
import { formatThreadTime, formatFullDate } from "@/lib/date-utils";

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

// Removed statusLabel mapping

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  // Internal normalized status values
  replied: "default",
  sent: "secondary",
  "followup-1": "secondary",
  "followup-2": "secondary",
  "not-sent": "outline",
  bounced: "destructive",
  paused: "outline",
  // Raw Notion status values (displayed for Notion-imported contacts)
  "Not Applied": "outline",
  "First Email": "secondary",
  "First Email Sent": "secondary",
  "Applied": "secondary",
  "Follow-Up 1": "secondary",
  "Follow-up 1": "secondary",
  "Follow-Up 1 Sent": "secondary",
  "Follow-Up 2": "secondary",
  "Follow-up 2": "secondary",
  "Follow-Up 2 Sent": "secondary",
  "Replied": "default",
  "Interview": "default",
  "Rejected": "destructive",
  "Bounced": "destructive",
  "To Apply": "outline",
  "New": "outline",
  "Sent": "secondary",
  "Paused": "outline",
};


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
  const tz = useTimezone();

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
      <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border bg-background/50 backdrop-blur">
        {/* LEFT SIDEBAR - Contact List */}
        <div className="flex w-full flex-col border-r md:w-[320px] shrink-0">
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

          <div className="flex-1 overflow-y-auto min-h-0">
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
                        {formatThreadTime(t.lastMessage?.sentAt || null, tz)}
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
                      {t.messageCount > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{t.messageCount}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE PANEL - Conversation Thread */}
        <div className="flex flex-1 flex-col min-w-0 min-h-0 border-r">
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
                  {detail.contact.status || "—"}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
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
                            {formatFullDate(msg.sentAt, tz)}
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
                              <MailOpen className="h-3 w-3 text-blue-500" /> Opened {formatThreadTime(msg.openedAt, tz)}
                            </span>
                          )}
                          {msg.repliedAt && (
                            <span className="flex items-center gap-1">
                              <Reply className="h-3 w-3 text-green-500" /> Replied {formatThreadTime(msg.repliedAt, tz)}
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
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL - Contact Details & Analytics */}
        <div className="hidden w-[300px] flex-col shrink-0 lg:flex">
          {detail ? (
            <div className="flex-1 overflow-y-auto min-h-0">
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
                    <span className="text-muted-foreground">Added {formatFullDate(detail.contact.createdAt, tz)}</span>
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
                        {detail.contact.status || "—"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Follow-ups</span>
                      <span className="font-medium">{detail.contact.followupsSent ?? 0}</span>
                    </div>
                    {detail.contact.lastSentAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last sent</span>
                        <span className="text-xs">{formatFullDate(detail.contact.lastSentAt, tz)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
