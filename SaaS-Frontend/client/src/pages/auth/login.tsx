import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Github, Mail } from "lucide-react";

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
              onClick={() =>
                toast({
                  title: "Google sign-in",
                  description: "Google OAuth coming soon.",
                })
              }
              data-testid="button-google-signin"
            >
              <Github className="mr-2 h-4 w-4" />
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
