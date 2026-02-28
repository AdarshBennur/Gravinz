import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Missing fields", description: "Please enter your username and password." });
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      toast({ title: "Welcome back!", description: "Redirecting to dashboard..." });
      setLocation("/app/dashboard");
    } catch (error: any) {
      toast({ title: "Login failed", description: error.message || "Invalid credentials." });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to initiate Google sign-in",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Google OAuth error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <Card className="glass p-6" data-testid="card-login">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold" data-testid="text-login-title">Welcome back</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-login-sub">
              Sign in to manage campaigns and replies.
            </p>
          </div>

          <div className="mt-6 grid gap-3">
            <Button
              variant="secondary"
              className="justify-start"
              onClick={handleGoogleLogin}
              data-testid="button-google-signin"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground" data-testid="text-divider">
                  or
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="username" data-testid="label-email">Username</Label>
                <Input
                  id="username"
                  placeholder="your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-email"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" data-testid="label-password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-password"
                />
              </div>

              <Button
                className="mt-1"
                onClick={handleLogin}
                disabled={loading}
                data-testid="button-submit-login"
              >
                <Mail className="mr-2 h-4 w-4" />
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-auth-switch">
              Don't have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline" data-testid="link-to-signup">
                Sign up
              </Link>
            </div>
          </div>
        </Card>
      </motion.div>
    </AuthShell>
  );
}
