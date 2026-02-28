import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Trash2,
  RotateCcw,
} from "lucide-react";

import AppShell from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

import { apiGet, apiPost, apiRequest } from "@/lib/api";
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

interface GmailMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  direction: "outbound" | "inbound";
  from: string;
  senderName: string;
  subject: string;
  body: string;
  sentAt: string;
  internalDate: number;
}

interface GmailThreadResponse {
  messages: GmailMessage[];
  gmailThreadId: string | null;
  error?: string;
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
  const [showClearModal, setShowClearModal] = useState(false);
  const tz = useTimezone();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Real-time Gmail thread fetch — outbound + inbound messages from Gmail API
  const { data: gmailThread, isLoading: gmailLoading } = useQuery<GmailThreadResponse>({
    queryKey: ["/api/inbox/threads", activeContactId, "gmail"],
    queryFn: () => apiGet<GmailThreadResponse>(`/api/inbox/threads/${activeContactId}/gmail`),
    enabled: !!activeContactId,
    refetchOnWindowFocus: false,
  });

  const clearContactsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/contacts/clear").then((r) => r.json() as Promise<{ deleted: number; message: string }>),
    onSuccess: (data) => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/threads"] });
      toast({
        title: "Contacts cleared",
        description: `All imported contacts cleared from application.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to clear contacts",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Notion sync — reuses the same endpoint as the Integrations page.
  // No backend changes; this is pure UI-level reuse.
  const syncFromNotion = useMutation({
    mutationFn: () => apiPost<any>("/api/integrations/notion/sync", {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Notion Sync Complete",
        description: `Synced ${result.imported ?? 0} contacts${
          result.skipped ? `, ${result.skipped} skipped` : ""
        }`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Sync Error", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <AlertDialog open={showClearModal} onOpenChange={setShowClearModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all imported contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all imported contacts from this application.{" "}
              <strong>This will NOT delete anything from Notion.</strong> Your Notion database
              remains completely untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearContactsMutation.mutate()}
              disabled={clearContactsMutation.isPending}
            >
              {clearContactsMutation.isPending ? "Deleting..." : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AppShell title="Inbox" subtitle="View conversations, track opens, and manage replies.">
        <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border bg-background/50 backdrop-blur">
          {/* LEFT SIDEBAR - Contact List */}
          <div className="flex w-full flex-col border-r md:w-[320px] shrink-0">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => syncFromNotion.mutate()}
                  disabled={syncFromNotion.isPending}
                  title="Sync latest changes from Notion"
                  data-testid="button-sync-notion-inbox"
                >
                  <RotateCcw
                    className={`mr-1.5 h-3.5 w-3.5 ${
                      syncFromNotion.isPending ? "animate-spin" : ""
                    }`}
                  />
                  {syncFromNotion.isPending ? "Syncing..." : "Sync Notion"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setShowClearModal(true)}
                  data-testid="button-clear-contacts"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.messageCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">{t.messageCount}</span>
                          )}
                          <Badge
                            variant={statusVariant[t.status] || "secondary"}
                            className="rounded-full text-[10px] px-1.5 py-0"
                          >
                            {t.status || "—"}
                          </Badge>
                        </div>
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
                  <Skeleton key={i} className={`h-24 w-3/4 rounded-2xl ${i % 2 === 1 ? "ml-auto" : ""}`} />
                ))}
              </div>
            ) : !detail ? (
              <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
                Contact not found
              </div>
            ) : (() => {
              // ─── Message source resolution ────────────────────────────────
              // Priority 1: Gmail thread messages (outbound + inbound, real-time)
              // Priority 2: Local email_sends from DB (outbound only, always available)
              const gmailMessages = gmailThread?.messages ?? [];
              const localMessages = detail.thread ?? [];
              const usingGmail = gmailMessages.length > 0;
              const usingFallback = !usingGmail && localMessages.length > 0;
              const hasAny = usingGmail || usingFallback;

              if (usingGmail) {
                console.log(`[Inbox] Rendering ${gmailMessages.length} Gmail messages for contact`);
              } else if (usingFallback) {
                console.log(`[Inbox] Gmail unavailable — falling back to ${localMessages.length} DB messages`);
              }

              return (
                <>
                  {/* Thread header */}
                  <div className="p-4 border-b flex items-center justify-between shrink-0">
                    <div>
                      <div className="font-semibold text-sm">{detail.contact.name}</div>
                      <div className="text-xs text-muted-foreground">{detail.contact.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {usingFallback && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          local only
                        </span>
                      )}
                      <Badge variant={statusVariant[detail.contact.status] || "secondary"} className="rounded-full">
                        {detail.contact.status || "—"}
                      </Badge>
                    </div>
                  </div>

                  {/* Chat bubble area */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="flex flex-col gap-3 p-4">

                      {/* Gmail API fetch error (non-critical) */}
                      {gmailThread?.error && gmailThread.error !== "no_thread_id" && (
                        <div className="text-center text-xs text-amber-600 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-xl">
                          Gmail thread unavailable ({gmailThread.error}) — showing local records
                        </div>
                      )}

                      {/* Empty state — only when truly nothing to show */}
                      {!hasAny && gmailLoading && (
                        <div className="space-y-4">
                          {Array.from({ length: 2 }).map((_, i) => (
                            <Skeleton key={i} className={`h-20 w-3/4 rounded-2xl ${i % 2 === 1 ? "ml-auto" : ""}`} />
                          ))}
                        </div>
                      )}

                      {!hasAny && !gmailLoading && (
                        <div className="text-center text-sm text-muted-foreground py-12">
                          <Send className="mx-auto h-8 w-8 mb-2 opacity-40" />
                          No emails sent to this contact yet
                        </div>
                      )}

                      {/* ── GMAIL MESSAGES (Priority 1) ── */}
                      {usingGmail && gmailMessages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        return (
                          <div
                            key={msg.gmailMessageId}
                            className={`flex flex-col max-w-[78%] gap-1 ${isOutbound ? "self-end items-end" : "self-start items-start"
                              }`}
                          >
                            <div className={`flex items-center gap-2 text-[10px] text-muted-foreground px-1 ${isOutbound ? "flex-row-reverse" : "flex-row"
                              }`}>
                              <span className="font-medium">{isOutbound ? "You" : msg.senderName}</span>
                              <span>{formatFullDate(msg.sentAt, tz)}</span>
                            </div>
                            <div
                              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${isOutbound
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted text-foreground rounded-tl-sm"
                                }`}
                            >
                              {msg.subject && (
                                <div className={`text-[10px] font-semibold mb-1.5 ${isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
                                  }`}>
                                  {msg.subject}
                                </div>
                              )}
                              {msg.body}
                            </div>
                          </div>
                        );
                      })}

                      {/* ── FALLBACK: LOCAL DB MESSAGES (Priority 2) ── */}
                      {usingFallback && localMessages.map((msg) => {
                        // Strip HTML tags for display
                        const plainBody = (msg.body || "")
                          .replace(/<br\s*\/?>/gi, "\n")
                          .replace(/<\/p>/gi, "\n")
                          .replace(/<[^>]+>/g, "")
                          .replace(/&nbsp;/g, " ")
                          .replace(/&amp;/g, "&")
                          .replace(/\n{3,}/g, "\n\n")
                          .trim();
                        return (
                          <div
                            key={msg.id}
                            className="flex flex-col max-w-[78%] gap-1 self-end items-end"
                          >
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1 flex-row-reverse">
                              <span className="font-medium">You</span>
                              <span>{formatFullDate(msg.sentAt, tz)}</span>
                              {msg.followupNumber != null && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  {msg.followupNumber === 0 ? "Initial" : `Follow-up ${msg.followupNumber}`}
                                </span>
                              )}
                            </div>
                            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-primary text-primary-foreground">
                              {msg.subject && (
                                <div className="text-[10px] font-semibold mb-1.5 text-primary-foreground/70">
                                  {msg.subject}
                                </div>
                              )}
                              {plainBody || msg.body}
                            </div>
                          </div>
                        );
                      })}

                    </div>
                  </div>
                </>
              );
            })()}
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
    </>
  );
}
