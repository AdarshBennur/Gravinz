import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, setAccessToken, getAccessToken } from "@/lib/api";

interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

interface AuthResponse extends AuthUser {
  access_token?: string;
  refresh_token?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, email?: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Keys we own — Supabase manages its own sb-* keys automatically.
const OUR_TOKEN_KEYS = ["access_token", "refresh_token", "auth:user"];

function clearOurTokens() {
  OUR_TOKEN_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    try { sessionStorage.removeItem(k); } catch { /* ignore */ }
  });
  setAccessToken(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // ── Synchronous init: read cached user + token from localStorage instantly ──
  // Eliminates auth flicker on page refresh — UI sees correct state immediately.
  const [user, setUserState] = useState<AuthUser | null>(() => {
    try {
      const token = localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token");
      if (!token) return null;
      const cached = localStorage.getItem("auth:user");
      if (cached) return JSON.parse(cached) as AuthUser;
    } catch { /* ignore */ }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const token = localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token");
      if (!token) return false; // definitely logged out
      const cached = localStorage.getItem("auth:user");
      return !cached; // only spin if no cached user
    } catch { return true; }
  });

  // Tracks whether WE initiated the sign-out, so the SIGNED_OUT listener
  // doesn't accidentally wipe the custom JWT for non-OAuth users.
  const logoutInitiated = useRef(false);

  const setUser = (u: AuthUser | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem("auth:user", JSON.stringify(u));
      else localStorage.removeItem("auth:user");
    } catch { /* ignore */ }
  };

  const refreshUser = useCallback(async () => {
    try {
      if (!getAccessToken()) {
        setUser(null);
        return;
      }
      const data = await apiGet<AuthUser>("/api/auth/me");
      setUser(data);
    } catch {
      // Token invalid or expired — clear only our tokens, not Supabase's
      clearOurTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // On app load: restore Supabase OAuth session if one exists
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.access_token) {
        // OAuth session exists — use Supabase token as our access token
        setAccessToken(session.access_token);
        if (session.refresh_token) {
          localStorage.setItem("refresh_token", session.refresh_token);
        }
        try {
          await apiPost("/api/auth/oauth-sync", {});
        } catch (error) {
          console.error("OAuth sync failed:", error);
        }
      }
      // Validate + hydrate user (works for both OAuth and custom JWT)
      refreshUser().finally(() => setLoading(false));
    });

    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        // Only clear our tokens if WE triggered the sign-out.
        // Supabase fires SIGNED_OUT for non-OAuth sessions too — don't wipe
        // the custom JWT in those cases.
        if (logoutInitiated.current) {
          clearOurTokens();
          setUser(null);
        }
        return;
      }

      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        // Supabase refreshed the OAuth token in the background — keep our copy in sync
        setAccessToken(session.access_token);
        return;
      }

      if (event === "SIGNED_IN" && session?.access_token) {
        setAccessToken(session.access_token);
        if (session.refresh_token) {
          localStorage.setItem("refresh_token", session.refresh_token);
        }
        try {
          await apiPost("/api/auth/oauth-sync", {});
          await refreshUser();
          if (window.location.pathname === "/login" || window.location.pathname === "/signup") {
            window.location.href = "/app/dashboard";
          }
        } catch (error) {
          console.error("OAuth sync failed:", error);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const data = await apiPost<AuthResponse>("/api/auth/login", { username, password });
    if (data.access_token) {
      setAccessToken(data.access_token);
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }
    }
    setUser({
      id: data.id,
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      avatarUrl: data.avatarUrl ?? null,
    });
  };

  const signup = async (username: string, password: string, email?: string, fullName?: string) => {
    const data = await apiPost<AuthResponse>("/api/auth/signup", { username, password, email, fullName });
    if (data.access_token) {
      setAccessToken(data.access_token);
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }
    }
    setUser({
      id: data.id,
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      avatarUrl: data.avatarUrl ?? null,
    });
  };

  const logout = async () => {
    // Signal the SIGNED_OUT listener that we initiated this
    logoutInitiated.current = true;

    try {
      // Destroy Supabase OAuth session server-side
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Supabase signOut error:", e);
    }

    // Notify backend (best-effort)
    try { await apiPost("/api/auth/logout"); } catch { /* ignore */ }

    // Clear ONLY our specific keys — do NOT call localStorage.clear()
    // because that wipes Supabase's session keys and can cause the in-memory
    // refresh timer to re-populate them, causing a re-login loop.
    clearOurTokens();
    setUser(null);

    // Hard redirect clears React Query cache and React state tree
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
