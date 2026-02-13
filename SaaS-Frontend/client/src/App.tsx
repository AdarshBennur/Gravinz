import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
import ForgotPasswordPage from "@/pages/auth/forgot";
import DashboardPage from "@/pages/app/dashboard";
import ContactsPage from "@/pages/app/contacts";
import CampaignSettingsPage from "@/pages/app/campaigns";
import AnalyticsPage from "./pages/app/analytics";
import IntegrationsPage from "@/pages/app/integrations";
import ProfileSettingsPage from "@/pages/app/settings";
import ProfilePage from "@/pages/app/profile";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />

      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />

      <Route path="/app" component={() => <Redirect to="/app/dashboard" />} />
      <Route path="/app/dashboard" component={DashboardPage} />
      <Route path="/app/contacts" component={ContactsPage} />
      <Route path="/app/campaigns" component={CampaignSettingsPage} />
      <Route path="/app/analytics" component={AnalyticsPage} />
      <Route path="/app/integrations" component={IntegrationsPage} />
      <Route path="/app/settings" component={ProfileSettingsPage} />
      <Route path="/app/profile" component={ProfilePage} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <Toaster />
          <div className="min-h-dvh app-bg transition-colors duration-500">
            <Router />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
