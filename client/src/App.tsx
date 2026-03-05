import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { TimezoneProvider } from "@/hooks/use-timezone";
import { Analytics } from "@vercel/analytics/react";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
import ForgotPasswordPage from "@/pages/auth/forgot";
import AuthCallbackPage from "@/pages/auth/callback";
import DashboardPage from "@/pages/app/dashboard";
import CampaignSettingsPage from "@/pages/app/campaigns";
import AnalyticsPage from "./pages/app/analytics";
import IntegrationsPage from "@/pages/app/integrations";
import InboxPage from "@/pages/app/inbox";
import ProfileSettingsPage from "@/pages/app/settings";
import ProfilePage from "@/pages/app/profile";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // No redirect — render the page in demo mode when logged out.
  // Each page guards its own API calls with `enabled: !!user`.
  return <Component />;
}


function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />

      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />

      <Route path="/app" component={() => <Redirect to="/app/dashboard" />} />
      <Route path="/app/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/app/campaigns" component={() => <ProtectedRoute component={CampaignSettingsPage} />} />
      <Route path="/app/inbox" component={() => <ProtectedRoute component={InboxPage} />} />
      <Route path="/app/analytics" component={() => <ProtectedRoute component={AnalyticsPage} />} />
      <Route path="/app/integrations" component={() => <ProtectedRoute component={IntegrationsPage} />} />
      <Route path="/app/settings" component={() => <ProtectedRoute component={ProfileSettingsPage} />} />
      <Route path="/app/profile" component={() => <ProtectedRoute component={ProfilePage} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <AuthProvider>
            <TimezoneProvider>
              <Toaster />
              <div className="min-h-dvh app-bg transition-colors duration-500">
                <Router />
              </div>
              <Analytics />
            </TimezoneProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
