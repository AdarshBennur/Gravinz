import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const { toast } = useToast();

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <Card className="glass p-6" data-testid="card-forgot">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold" data-testid="text-forgot-title">Reset password</h1>
              <p className="text-sm text-muted-foreground" data-testid="text-forgot-sub">
                We’ll “send” a reset link. (UI only.)
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="email" data-testid="label-email">Email</Label>
                <Input id="email" type="email" placeholder="you@domain.com" data-testid="input-email" />
              </div>

              <Button
                onClick={() =>
                  toast({
                    title: "Reset link sent (mock)",
                    description: "This prototype does not send email.",
                  })
                }
                data-testid="button-submit-forgot"
              >
                <Mail className="mr-2 h-4 w-4" />
                Send reset link
              </Button>

              <div className="text-sm text-muted-foreground" data-testid="text-back-to-login">
                Back to{" "}
                <Link href="/login" className="text-primary hover:underline" data-testid="link-back-login">
                  login
                </Link>
              </div>
            </div>
          </Card>
        </motion.div>

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-back-home"
        >
          <ArrowRight className="mr-2 h-3.5 w-3.5 rotate-180" />
          Back to landing
        </Link>
      </div>
    </div>
  );
}
