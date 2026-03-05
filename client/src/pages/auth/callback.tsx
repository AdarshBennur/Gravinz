import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { apiPost, setAccessToken } from "@/lib/api";

/**
 * /auth/callback — Landing page after Supabase Google OAuth redirect.
 *
 * Supabase appends the session tokens as a hash fragment (#access_token=...)
 * or as a code in the query string (?code=...). The supabase-js client's
 * `detectSessionInUrl: true` option automatically parses both formats when
 * this page loads, triggering onAuthStateChange which we handle below.
 *
 * This page just shows a loading spinner while the async handshake completes.
 */
export default function AuthCallbackPage() {
    const [, setLocation] = useLocation();

    useEffect(() => {
        // Fallback: if the session is already present (fast loads / hash already parsed)
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.access_token) {
                setAccessToken(session.access_token);
                if (session.refresh_token) {
                    localStorage.setItem("refresh_token", session.refresh_token);
                }
                try {
                    await apiPost("/api/auth/oauth-sync", {});
                } catch { /* non-critical */ }
                setLocation("/app/dashboard");
                return;
            }

            // Primary path: wait for supabase-js to exchange the code and emit a session
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
                if (session?.access_token) {
                    setAccessToken(session.access_token);
                    if (session.refresh_token) {
                        localStorage.setItem("refresh_token", session.refresh_token);
                    }
                    try {
                        await apiPost("/api/auth/oauth-sync", {});
                    } catch (err) {
                        console.error("[AuthCallback] oauth-sync failed:", err);
                    }
                    setLocation("/app/dashboard");
                }
            });

            return () => subscription.unsubscribe();
        });
    }, [setLocation]);

    return (
        <div className="min-h-dvh grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <svg
                    className="h-8 w-8 animate-spin text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                    />
                </svg>
                <p className="text-sm">Signing you in…</p>
            </div>
        </div>
    );
}
