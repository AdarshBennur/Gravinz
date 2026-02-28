import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <Card className="glass p-8 max-w-md w-full" data-testid="card-not-found">
        <div className="text-sm text-muted-foreground" data-testid="text-404-label">
          404
        </div>
        <div className="mt-2 text-xl font-semibold" data-testid="text-404-title">
          Page not found
        </div>
        <div className="mt-2 text-sm text-muted-foreground" data-testid="text-404-sub">
          The page you’re looking for doesn’t exist in this prototype.
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/" data-testid="link-404-home">
            <Button variant="secondary" className="w-full" data-testid="button-404-home">
              Back home
            </Button>
          </Link>
          <Link href="/app/dashboard" data-testid="link-404-dashboard">
            <Button className="w-full" data-testid="button-404-dashboard">
              Go to dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
