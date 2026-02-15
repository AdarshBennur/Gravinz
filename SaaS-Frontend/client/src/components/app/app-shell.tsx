import { Link, useLocation } from "wouter";
import {
  BarChart3,
  Compass,
  Contact2,
  Inbox,
  Plug,
  Settings,
  SlidersHorizontal,
  User,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: Compass, testId: "nav-dashboard" },
  { href: "/app/contacts", label: "Contacts", icon: Contact2, testId: "nav-contacts" },
  { href: "/app/inbox", label: "Inbox", icon: Inbox, testId: "nav-inbox" },
  { href: "/app/campaigns", label: "Campaigns", icon: SlidersHorizontal, testId: "nav-campaigns" },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3, testId: "nav-analytics" },
  { href: "/app/integrations", label: "Integrations", icon: Plug, testId: "nav-integrations" },
  { href: "/app/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <div className="grid gap-1">
      {nav.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors " +
              (active
                ? "bg-sidebar-accent text-foreground ring-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent")
            }
            data-testid={`link-${item.testId}`}
          >
            <Icon className="h-4 w-4" strokeWidth={2.2} />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-[260px] shrink-0 lg:block">
      <div className="sticky top-0 h-dvh border-r bg-sidebar/75 backdrop-blur">
        <div className="px-4 py-5">
          <Link href="/" className="flex items-center gap-2" data-testid="link-app-home">
            <div
              className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground ring-soft"
              data-testid="badge-app-logo"
            >
              <span className="text-sm font-semibold">OA</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold" data-testid="text-app-brand">
                OutboundAI
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-app-brand-sub">
                Automation
              </div>
            </div>
          </Link>

          <Separator className="my-4" />
          <NavLinks />

          <div className="mt-6 rounded-xl border bg-sidebar-accent/60 p-3">
            <div className="text-xs font-medium" data-testid="text-sidebar-tip-title">
              Tip
            </div>
            <div className="mt-1 text-xs text-muted-foreground" data-testid="text-sidebar-tip-sub">
              Keep daily limits conservative to protect deliverability.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" data-testid="button-theme-toggle">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Topbar() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" data-testid="button-open-sidebar">
                <span className="sr-only">Open navigation</span>
                <Compass className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar">
              <div className="flex items-center gap-2" data-testid="mobile-brand">
                <div
                  className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"
                  data-testid="badge-mobile-logo"
                >
                  <span className="text-sm font-semibold">OA</span>
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold" data-testid="text-mobile-brand">
                    OutboundAI
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-mobile-sub">
                    Automation
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              <NavLinks onNavigate={() => {}} />
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="text-env-sub">
              {user.fullName || user.username}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="h-9 w-9 rounded-full p-0 overflow-hidden" data-testid="button-user-menu">
                <Avatar className="h-9 w-9" data-testid="img-avatar">
                  <AvatarFallback data-testid="text-avatar-fallback">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel data-testid="text-user-menu-label">
                {user?.fullName || user?.username || "My Account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/app/profile")} data-testid="menu-profile">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/app/settings")} data-testid="menu-settings">
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export default function AppShell({
  title,
  subtitle,
  children,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Topbar />
          <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1 text-sm text-muted-foreground" data-testid="text-page-subtitle">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {headerRight ? <div data-testid="slot-header-right">{headerRight}</div> : null}
            </div>

            <div className="mt-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
