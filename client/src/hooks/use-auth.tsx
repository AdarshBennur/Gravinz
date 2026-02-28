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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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
    setUser(null);
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
