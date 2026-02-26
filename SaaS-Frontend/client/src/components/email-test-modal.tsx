import { useState } from "react";
import { FlaskConical, RefreshCw, Send, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";

interface TestEmailResult {
    subject: string;
    body: string;
    fallback?: boolean;
}

interface EmailTestModalProps {
    onClose: () => void;
}

export function EmailTestModal({ onClose }: EmailTestModalProps) {
    const { toast } = useToast();
    const [preview, setPreview] = useState<TestEmailResult | null>(null);
    const [sent, setSent] = useState(false);

    const generateMutation = useMutation({
        mutationFn: () => apiPost<TestEmailResult>("/api/email-test/generate", {}),
        onSuccess: (data) => {
            setPreview(data);
            setSent(false);
        },
        onError: (err: Error) => {
            toast({ title: "Generation failed", description: err.message, variant: "destructive" });
        },
    });

    const sendMutation = useMutation({
        mutationFn: () =>
            apiPost<{ message: string }>("/api/email-test/send", {
                subject: preview!.subject,
                body: preview!.body,
            }),
        onSuccess: (data) => {
            setSent(true);
            toast({ title: "Test email sent!", description: data.message });
        },
        onError: (err: Error) => {
            toast({ title: "Send failed", description: err.message, variant: "destructive" });
        },
    });

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <Card className="glass relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-background/60 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <FlaskConical className="h-5 w-5 text-primary" />
                        <div>
                            <div className="text-sm font-semibold">Email Preview</div>
                            <div className="text-xs text-muted-foreground">
                                Generates using your real profile + prompt settings — nothing is saved to DB
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 hover:bg-background/60 transition-colors"
                        data-testid="button-close-test-modal"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Empty state */}
                    {!preview && !generateMutation.isPending && (
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
                                <FlaskConical className="h-7 w-7 text-primary" />
                            </div>
                            <div className="text-sm font-medium">No preview generated yet</div>
                            <div className="text-xs text-muted-foreground max-w-xs">
                                Click "Generate Preview" to see exactly how your next cold email would look — using your current profile, tone, and prompt settings.
                            </div>
                        </div>
                    )}

                    {/* Loading */}
                    {generateMutation.isPending && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div className="text-sm text-muted-foreground">Generating email via AI…</div>
                        </div>
                    )}

                    {/* Preview */}
                    {preview && !generateMutation.isPending && (
                        <div className="space-y-4">
                            {preview.fallback && (
                                <div className="flex items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-500">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    AI generation failed — fallback template shown. Check OpenAI API key.
                                </div>
                            )}

                            {sent && (
                                <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-500">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    Test email sent to your Gmail. Check your inbox (look for a [TEST] prefix).
                                </div>
                            )}

                            {/* Subject */}
                            <div className="rounded-xl border bg-background/60 px-4 py-3">
                                <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</div>
                                <div className="text-sm font-medium" data-testid="text-test-subject">{preview.subject}</div>
                            </div>

                            {/* Body */}
                            <div className="rounded-xl border bg-background/60 px-4 py-4">
                                <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Body</div>
                                <pre
                                    className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground"
                                    data-testid="text-test-body"
                                >
                                    {preview.body}
                                </pre>
                            </div>

                            <div className="rounded-xl border border-muted/40 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                                ℹ️ This preview uses placeholder recipient data ("Test Recipient" / "Example Company" / "Hiring Manager"). Real sends use your actual contact's data.
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between border-t bg-background/60 px-6 py-4 gap-3">
                    <Button
                        variant="outline"
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending || sendMutation.isPending}
                        data-testid="button-generate-test"
                    >
                        {generateMutation.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                        ) : (
                            <><RefreshCw className="mr-2 h-4 w-4" /> {preview ? "Regenerate" : "Generate Preview"}</>
                        )}
                    </Button>

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose} data-testid="button-close-test">
                            Close
                        </Button>
                        <Button
                            onClick={() => sendMutation.mutate()}
                            disabled={!preview || sendMutation.isPending || generateMutation.isPending}
                            data-testid="button-send-test"
                        >
                            {sendMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                            ) : (
                                <><Send className="mr-2 h-4 w-4" /> Send Test to Myself</>
                            )}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
