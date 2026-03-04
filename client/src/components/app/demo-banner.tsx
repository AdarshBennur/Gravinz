import { Link } from "wouter";
import { LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown at the top of every page when the user is not logged in.
 * Gives a clear signal that this is a product preview / demo mode,
 * and provides a one-click path to sign in.
 */
export function DemoModeBanner() {
    return (
        <div className="w-full bg-gradient-to-r from-violet-600/10 via-purple-500/10 to-indigo-600/10 border-b border-violet-500/20 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
                <span>
                    You&apos;re viewing a <strong className="text-foreground">demo preview</strong> — sign in to load your real data.
                </span>
            </div>
            <Link href="/login">
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs shrink-0">
                    <LogIn className="h-3.5 w-3.5" />
                    Sign in
                </Button>
            </Link>
        </div>
    );
}
