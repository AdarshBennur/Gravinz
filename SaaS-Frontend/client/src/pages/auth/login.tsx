import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Github, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        {children}
        <div className="mt-6 text-center text-xs text-muted-foreground" data-testid="text-auth-disclaimer">
          This is a frontend-only prototype. No real authentication.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
                  title: "Google sign-in (UI only)",
                  description: "Connect OAuth in a full app. This is a prototype.",
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
                <Label htmlFor="email" data-testid="label-email">Email</Label>
                <Input id="email" type="email" placeholder="you@domain.com" data-testid="input-email" />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" data-testid="label-password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                    Forgot?
                  </Link>
                </div>
                <Input id="password" type="password" placeholder="••••••••" data-testid="input-password" />
              </div>

              <Button
                className="mt-1"
                onClick={() => {
                  toast({ title: "Signed in (mock)", description: "Redirecting to dashboard…" });
                  setLocation("/app/dashboard");
                }}
                data-testid="button-submit-login"
              >
                <Mail className="mr-2 h-4 w-4" />
                Sign in
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-auth-switch">
              Don’t have an account?{" "}
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
