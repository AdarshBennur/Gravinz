import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, setAccessToken, getAccessToken, clearTokens } from "@/lib/api";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  // ── Synchronous init: read cached user + token from localStorage instantly ──
  // This eliminates the auth flicker on page refresh — UI sees correct state
  // immediately, while the background API call silently re-validates.
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

  // loading = false immediately if we already have a cached answer
  // (either no token → user is null, or cached user → user is set)
  // Only true when a token exists but no cached user (rare: first load after
  // login on a different device, or cache was cleared).
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const token = localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token");
      if (!token) return false; // definitely logged out
      const cached = localStorage.getItem("auth:user");
      return !cached; // only spin if no cache
    } catch { return true; }
  });

  // Wrapper that also persists to localStorage for next-render hydration
  const setUser = (u: AuthUser | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem("auth:user", JSON.stringify(u));
      else localStorage.removeItem("auth:user");
    } catch { /* ignore */ }
  };

  const refreshUser = useCallback(async () => {
    try {
      // Only attempt if we have a stored token
      if (!getAccessToken()) {
        setUser(null);
        return;
      }
      const data = await apiGet<AuthUser>("/api/auth/me");
      setUser(data);
    } catch {
      // Token is invalid or expired — clear it
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Check for Supabase OAuth session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.access_token) {
        // Store Supabase OAuth tokens
        setAccessToken(session.access_token);
        if (session.refresh_token) {
          localStorage.setItem("refresh_token", session.refresh_token);
        }

        // Sync OAuth user to database
        try {
          await apiPost("/api/auth/oauth-sync", {});
        } catch (error) {
          console.error("OAuth sync failed:", error);
        }
      }
      // Then refresh user data
      refreshUser().finally(() => setLoading(false));
    });

    // Listen for auth state changes (OAuth redirects)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        setAccessToken(session.access_token);
        if (session.refresh_token) {
          localStorage.setItem("refresh_token", session.refresh_token);
        }

        // Sync OAuth user to database
        try {
          await apiPost("/api/auth/oauth-sync", {});
          await refreshUser();

          // Redirect to dashboard if on auth page
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
    await apiPost("/api/auth/logout");
    clearTokens();
    setUser(null); // also clears localStorage cache via wrapper
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
