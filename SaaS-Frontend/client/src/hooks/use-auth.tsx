import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
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
      const data = await apiGet<AuthUser>("/api/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const data = await apiPost<AuthUser>("/api/auth/login", { username, password });
    setUser(data);
  };

  const signup = async (username: string, password: string, email?: string, fullName?: string) => {
    const data = await apiPost<AuthUser>("/api/auth/signup", { username, password, email, fullName });
    setUser(data);
  };

  const logout = async () => {
    await apiPost("/api/auth/logout");
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
