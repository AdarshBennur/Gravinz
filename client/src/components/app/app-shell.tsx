import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Compass,
  Inbox,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plug,
  Settings,
  SlidersHorizontal,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─────────────────────────────── nav items ─────────────────────────────── */

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: Compass, testId: "nav-dashboard" },
  { href: "/app/inbox", label: "Inbox", icon: Inbox, testId: "nav-inbox" },
  { href: "/app/campaigns", label: "Campaigns", icon: SlidersHorizontal, testId: "nav-campaigns" },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3, testId: "nav-analytics" },
  { href: "/app/integrations", label: "Integrations", icon: Plug, testId: "nav-integrations" },
  { href: "/app/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
];

/** Icon lookup for page headings — derived from nav + extra routes not in sidebar */
const pageIcons: Record<string, React.ElementType> = {
  ...Object.fromEntries(nav.map((item) => [item.href, item.icon])),
  "/app/profile": User,
};

/* ──────────────────────────────── NavLinks ─────────────────────────────── */

function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();

  return (
    <div className="grid gap-1">
      {nav.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;

        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              "group flex items-center rounded-xl py-2 text-sm transition-all duration-200 " +
              (collapsed ? "justify-center px-0" : "gap-3 px-3") +
              " " +
              (active
                ? "bg-sidebar-accent text-foreground ring-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent")
            }
            data-testid={`link-${item.testId}`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            {/* Label: fade + collapse when sidebar is collapsed */}
            <span
              className={
                "font-medium transition-all duration-200 " +
                (collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100")
              }
            >
              {item.label}
            </span>
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.href} delayDuration={100}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        }

        return link;
      })}
    </div>
  );
}

/* ──────────────────────────────── ThemeToggle ──────────────────────────── */

function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { setTheme } = useTheme();

  const button = (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-xl"
      data-testid="button-theme-toggle"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );

  return (
    <DropdownMenu>
      {/* Correct nesting: Tooltip > TooltipTrigger > DropdownMenuTrigger > Button.
          This ensures the real button element gets both tooltip & dropdown handlers. */}
      {collapsed ? (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle theme</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" side="top">
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

/* ──────────────────────────────── SidebarBottom ───────────────────────── */

function SidebarBottom({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    onNavigate?.();
  };

  // Two separate button shapes: icon-only (collapsed) vs full-width row (expanded).
  // Collapsed uses h-9 w-9 to exactly match nav icon and theme toggle button sizing.
  const collapsedAvatarBtn = (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-xl"
      data-testid="button-user-menu"
    >
      <Avatar className="h-5 w-5" data-testid="img-avatar">
        <AvatarFallback data-testid="text-avatar-fallback">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    </Button>
  );

  const expandedAvatarBtn = (
    <Button
      variant="ghost"
      className="h-auto flex-1 justify-start gap-2 rounded-xl px-2 py-2"
      data-testid="button-user-menu"
    >
      <Avatar className="h-7 w-7 shrink-0" data-testid="img-avatar">
        <AvatarFallback data-testid="text-avatar-fallback">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <span
        className="truncate text-sm font-medium text-foreground"
        data-testid="text-sidebar-username"
      >
        {user?.fullName || user?.username || "My Account"}
      </span>
    </Button>
  );

  return (
    <div
      className={
        "border-t py-4 transition-all duration-200 " +
        (collapsed ? "px-2" : "px-4")
      }
    >
      {/* Collapsed: stack vertically — theme on top, profile at bottom */}
      {/* Expanded:  row          — profile flex-1, theme toggle at right */}
      <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2"}>
        {/* Theme toggle — above profile when collapsed */}
        <ThemeToggle collapsed={collapsed} />

        {/* Profile dropdown — always the bottom-most element */}
        <DropdownMenu>
          {/* Correct nesting: Tooltip > TooltipTrigger > DropdownMenuTrigger > Button */}
          {collapsed ? (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{collapsedAvatarBtn}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                {user?.fullName || user?.username || "My Account"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuTrigger asChild>{expandedAvatarBtn}</DropdownMenuTrigger>
          )}
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuLabel data-testid="text-user-menu-label">
              {user?.fullName || user?.username || "My Account"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleNavigate("/app/profile")}
              data-testid="menu-profile"
            >
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleNavigate("/app/settings")}
              data-testid="menu-settings"
            >
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
  );
}

/* ───────────────────────────────── Sidebar ─────────────────────────────── */

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={
        "hidden shrink-0 lg:block transition-all duration-300 ease-in-out " +
        (collapsed ? "w-[68px]" : "w-[260px]")
      }
    >
      <div className="sticky top-0 flex h-dvh flex-col border-r bg-sidebar/75 backdrop-blur">
        {/* ── Top: logo + collapse toggle ── */}
        <div
          className={
            "flex items-center border-b py-4 transition-all duration-200 " +
            (collapsed ? "justify-center px-2" : "justify-between px-4")
          }
        >
          {/* Logo / brand */}
          <Link href="/" className="flex min-w-0 items-center gap-2" data-testid="link-app-home">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground ring-soft"
              data-testid="badge-app-logo"
            >
              <span className="text-sm font-semibold">OA</span>
            </div>
            {/* Brand text: hidden when collapsed */}
            <div
              className={
                "leading-tight transition-all duration-200 " +
                (collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100")
              }
            >
              <div className="text-sm font-semibold" data-testid="text-app-brand">
                GravinzAI
              </div>
            </div>
          </Link>

          {/* Collapse toggle — always visible, shifts position when collapsed */}
          {!collapsed && (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggle}
                  className="h-7 w-7 shrink-0 rounded-lg"
                  data-testid="button-sidebar-collapse"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Collapse sidebar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Expand button when collapsed — underneath the logo */}
        {collapsed && (
          <div className="flex justify-center py-2">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggle}
                  className="h-7 w-7 rounded-lg"
                  data-testid="button-sidebar-expand"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Expand sidebar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Scrollable nav section ── */}
        <div
          className={
            "flex-1 overflow-y-auto py-4 transition-all duration-200 " +
            (collapsed ? "px-2" : "px-4")
          }
        >
          <NavLinks collapsed={collapsed} />

          {/* Tip box — hidden when collapsed */}
          {!collapsed && (
            <div className="mt-6 rounded-xl border bg-sidebar-accent/60 p-3">
              <div className="text-xs font-medium" data-testid="text-sidebar-tip-title">
                Tip
              </div>
              <div
                className="mt-1 text-xs text-muted-foreground"
                data-testid="text-sidebar-tip-sub"
              >
                Keep daily limits conservative to protect deliverability.
              </div>
            </div>
          )}
        </div>

        {/* ── Pinned bottom: profile + theme ── */}
        <SidebarBottom collapsed={collapsed} />
      </div>
    </aside>
  );
}

/* ──────────────────────────────── AppShell ─────────────────────────────── */

export default function AppShell({
  title,
  subtitle,
  children,
  headerRight,
  fullHeight = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  /** Lock the shell to viewport height; internal panels scroll independently */
  fullHeight?: boolean;
}) {
  const [location] = useLocation();
  const PageIcon = pageIcons[location];

  // Persist collapse state in localStorage so it survives navigation remounts
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar:collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("sidebar:collapsed", String(next)); } catch { }
      return next;
    });
  };

  return (
    <TooltipProvider>
      <div className={fullHeight ? "h-dvh overflow-hidden flex" : "min-h-dvh"}>
        <div className={fullHeight ? "contents" : "flex"}>
          {/* ── Desktop sidebar ── */}
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />

          {/* ── Page content ── */}
          <div className={fullHeight ? "min-w-0 flex-1 flex flex-col overflow-hidden" : "min-w-0 flex-1"}>
            {/* Mobile hamburger — floating, no height impact on layout */}
            <div className="fixed left-3 top-3 z-30 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="secondary" size="icon" data-testid="button-open-sidebar">
                    <span className="sr-only">Open navigation</span>
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[280px] flex-col bg-sidebar p-0">
                  {/* Scrollable nav */}
                  <div className="flex-1 overflow-y-auto px-4 py-5">
                    <div className="flex items-center gap-2" data-testid="mobile-brand">
                      <div
                        className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"
                        data-testid="badge-mobile-logo"
                      >
                        <span className="text-sm font-semibold">OA</span>
                      </div>
                      <div className="leading-tight">
                        <div className="text-sm font-semibold" data-testid="text-mobile-brand">
                          GravinzAI
                        </div>
                      </div>
                    </div>
                    <Separator className="my-4" />
                    {/* Mobile always expanded — no collapsed prop */}
                    <NavLinks />
                  </div>

                  {/* Pinned bottom */}
                  <SidebarBottom />
                </SheetContent>
              </Sheet>
            </div>

            {fullHeight ? (
              /* ── Flush viewport-locked layout (Inbox) ── */
              <main className="flex flex-1 flex-col overflow-hidden min-h-0">
                {/* Mobile: clear the floating hamburger — identical to standard */}
                <div className="shrink-0 mb-4 lg:hidden" style={{ height: "2.5rem" }} />

                {/* Title — same padding, same wrapper structure as standard layout */}
                <div className="shrink-0 px-4 pt-8 sm:px-6 lg:px-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        {PageIcon && (
                          <PageIcon
                            className="h-6 w-6 shrink-0 text-muted-foreground"
                            strokeWidth={2}
                            data-testid="icon-page-title"
                          />
                        )}
                        <h1
                          className="text-2xl font-semibold tracking-tight"
                          data-testid="text-page-title"
                        >
                          {title}
                        </h1>
                      </div>
                      {subtitle ? (
                        <p
                          className="mt-1 text-sm text-muted-foreground"
                          data-testid="text-page-subtitle"
                        >
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                    {headerRight ? (
                      <div data-testid="slot-header-right">{headerRight}</div>
                    ) : null}
                  </div>
                </div>

                {/* Children fill remaining height — mt-6 gap matches standard layout */}
                <div className="flex-1 overflow-hidden min-h-0 px-4 mt-6 pb-4 sm:px-6 lg:px-8">
                  {children}
                </div>
              </main>
            ) : (
              /* ── Standard padded layout (all other pages) ── */
              <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Small top padding on mobile to clear the floating menu button */}
                <div className="mb-4 lg:hidden" style={{ height: "2.5rem" }} />

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    {/* Icon + title row — icon derived from nav pageIcons map */}
                    <div className="flex items-center gap-3">
                      {PageIcon && (
                        <PageIcon
                          className="h-6 w-6 shrink-0 text-muted-foreground"
                          strokeWidth={2}
                          data-testid="icon-page-title"
                        />
                      )}
                      <h1
                        className="text-2xl font-semibold tracking-tight"
                        data-testid="text-page-title"
                      >
                        {title}
                      </h1>
                    </div>
                    {subtitle ? (
                      <p
                        className="mt-1 text-sm text-muted-foreground"
                        data-testid="text-page-subtitle"
                      >
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                  {headerRight ? (
                    <div data-testid="slot-header-right">{headerRight}</div>
                  ) : null}
                </div>

                <div className="mt-6">{children}</div>
              </main>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
