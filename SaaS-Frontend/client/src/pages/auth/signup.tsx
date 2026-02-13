import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Github, Sparkles } from "lucide-react";

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

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Missing fields", description: "Please enter a username and password." });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Weak password", description: "Password must be at least 6 characters." });
      return;
    }
    setLoading(true);
    try {
      await signup(username, password, email || undefined, fullName || undefined);
      toast({ title: "Account created!", description: "Welcome to OutboundAI." });
      setLocation("/app/dashboard");
    } catch (error: any) {
      toast({ title: "Signup failed", description: error.message || "Could not create account." });
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
        <Card className="glass p-6" data-testid="card-signup">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold" data-testid="text-signup-title">Create your account</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-signup-sub">
              Start building a consistent, high-quality outreach system.
            </p>
          </div>

          <div className="mt-6 grid gap-3">
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() =>
                toast({
                  title: "Google sign-up",
                  description: "Google OAuth coming soon.",
                })
              }
              data-testid="button-google-signup"
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
                <Label htmlFor="name" data-testid="label-name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="username" data-testid="label-username">Username</Label>
                <Input
                  id="username"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="input-username"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email" data-testid="label-email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" data-testid="label-password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                  data-testid="input-password"
                />
              </div>

              <Button
                className="mt-1"
                onClick={handleSignup}
                disabled={loading}
                data-testid="button-submit-signup"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-auth-switch">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline" data-testid="link-to-login">
                Login
              </Link>
            </div>
          </div>
        </Card>
      </motion.div>
    </AuthShell>
  );
}
