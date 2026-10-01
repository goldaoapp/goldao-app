import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gavel,
  Gift,
  Home,
  Lock,
  LogOut,
  type LucideIcon,
  Scale,
  Shield,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import ThemeToggle from "@/components/ThemeToggle";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  ocid: string;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/", icon: Home, ocid: "nav.home" },
  { label: "Treasury", to: "/treasury", icon: Lock, ocid: "nav.treasury" },
  { label: "Proposals", to: "/proposals", icon: Gavel, ocid: "nav.proposals" },
  { label: "Rewards", to: "/rewards", icon: Gift, ocid: "nav.rewards" },
  { label: "Events", to: "/events", icon: Activity, ocid: "nav.events" },
  {
    label: "Fair Value",
    to: "/fair-value",
    icon: Scale,
    ocid: "nav.fair-value",
  },
  {
    label: "Docs",
    to: "/documentation",
    icon: BookOpen,
    ocid: "nav.documentation",
  },
  { label: "News", to: "/news", icon: FileText, ocid: "nav.news" },
];

// Not developed yet — hidden from the menu, routes still reachable by URL.
// Remove a path from this list to show it again.
const HIDDEN_PATHS = new Set(["/proposals", "/news"]);

const NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => !HIDDEN_PATHS.has(i.to));

// Mobile bottom bar shows every visible module (6 fit on a 360 px phone).
const MOBILE_TABS: NavItem[] = NAV_ITEMS;

function isActive(currentPath: string, to: string): boolean {
  if (to === "/") return currentPath === "/";
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

/* ─── Desktop Sidebar ─── */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });
  const { location } = useRouterState();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  return (
    <aside
      data-ocid="sidebar"
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card/80 backdrop-blur-md transition-all duration-300 flex-shrink-0",
        collapsed ? "w-[68px]" : "w-[220px]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-border h-16 flex-shrink-0",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Link
          to="/"
          data-ocid="nav.brand"
          aria-label="GOLDAO home"
          className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <img
            src="/assets/images/goldao-icon.png"
            alt="GOLDAO"
            className="size-8 rounded-md flex-shrink-0"
          />
          {!collapsed && (
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              GOLDAO
            </span>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav
        aria-label="Primary"
        className="flex flex-1 flex-col gap-1 p-2.5 overflow-y-auto"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(location.pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-ocid={item.ocid}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-[18px] flex-shrink-0" aria-hidden="true" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-2.5 flex flex-col gap-2 border-t border-border">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <ChevronRight className="size-[18px]" />
          ) : (
            <>
              <ChevronLeft className="size-[18px] flex-shrink-0" />
              Collapse
            </>
          )}
        </button>

        {/* Auth / Connect wallet */}
        <AuthControls collapsed={collapsed} />
      </div>
    </aside>
  );
}

/* ─── Auth controls (sidebar bottom) ─── */
function AuthControls({ collapsed }: { collapsed: boolean }) {
  const { isAuthenticated, isLoading, isAdmin, principalId, login, logout } =
    useAuth();

  if (!isAuthenticated) {
    return (
      <Button
        data-ocid="nav.connect_wallet"
        size="sm"
        onClick={() => login()}
        disabled={isLoading}
        title={collapsed ? "Connect Wallet" : undefined}
        className={cn(
          "rounded-lg gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90 transition-opacity border border-primary/30",
          collapsed && "rounded-lg px-0 w-full",
        )}
      >
        {!collapsed && (isLoading ? "…" : "Connect Wallet")}
      </Button>
    );
  }

  const short = principalId
    ? `${principalId.slice(0, 5)}…${principalId.slice(-3)}`
    : "";

  return (
    <div className="flex flex-col gap-1.5">
      {!collapsed && principalId && (
        <span
          className="px-1 font-mono text-[11px] text-muted-foreground truncate"
          title={principalId}
        >
          {short}
        </span>
      )}

      {isAdmin && (
        <Link
          to="/admin"
          data-ocid="nav.admin"
          title={collapsed ? "Panel Admin" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-primary hover:bg-primary/12 transition-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center px-0",
          )}
        >
          <Shield className="size-[18px] flex-shrink-0" aria-hidden="true" />
          {!collapsed && "Panel Admin"}
        </Link>
      )}

      <button
        type="button"
        onClick={logout}
        data-ocid="nav.logout"
        title={collapsed ? "Logout" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center px-0",
        )}
      >
        <LogOut className="size-[18px] flex-shrink-0" aria-hidden="true" />
        {!collapsed && "Logout"}
      </button>
    </div>
  );
}

/* ─── Mobile Bottom Tab Bar ─── */
/* ─── Mobile top bar: brand + wallet + theme ─── */
export function MobileTopBar() {
  return (
    <header
      data-ocid="mobile-topbar"
      className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[color:var(--term-border)] bg-card/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md md:hidden"
    >
      <Link
        to="/"
        aria-label="GOLDAO home"
        className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--term-ink)]"
      >
        <img
          src="/assets/images/goldao-icon.png"
          alt=""
          className="size-6 rounded-md"
        />
        GOLDAO <span className="text-[color:var(--term-gold)]">App</span>
      </Link>
      <div className="flex items-center gap-2">
        <MobileAuth />
        <ThemeToggle />
      </div>
    </header>
  );
}

function MobileAuth() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, isLoading, isAdmin, principalId, login, logout } =
    useAuth();

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() => login()}
        disabled={isLoading}
        data-ocid="mobile.nav.connect_wallet"
        className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--term-gold)] px-3 font-mono text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Wallet className="size-3.5" aria-hidden="true" />
        {isLoading ? "…" : "Connect"}
      </button>
    );
  }

  const short = principalId
    ? `${principalId.slice(0, 5)}…${principalId.slice(-3)}`
    : "Account";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-ocid="mobile.nav.account"
        className="flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--term-border)] bg-[var(--term-card)] px-3 font-mono text-[11px] text-[color:var(--term-ink)]"
      >
        <Wallet
          className="size-3.5 text-[color:var(--term-gold)]"
          aria-hidden="true"
        />
        {short}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={() => {}}
            role="presentation"
          />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[160px] rounded-lg border border-border bg-card/95 py-1 shadow-lg backdrop-blur-md">
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-primary"
              >
                <Shield className="size-4" aria-hidden="true" />
                Panel Admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              data-ocid="mobile.nav.logout"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-muted-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Mobile bottom tab bar: every module, no "More" ─── */
export function MobileTabBar() {
  const { location } = useRouterState();

  return (
    <nav
      data-ocid="mobile-tabs"
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[color:var(--term-border)] bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2 backdrop-blur-md md:hidden"
      style={{
        gridTemplateColumns: `repeat(${MOBILE_TABS.length}, minmax(0, 1fr))`,
      }}
    >
      {MOBILE_TABS.map((item) => {
        const active = isActive(location.pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            data-ocid={`mobile.${item.ocid}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-md py-1 outline-none transition-colors",
              active
                ? "text-[color:var(--term-gold)]"
                : "text-[color:var(--term-ink-mid)]",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="w-full truncate text-center text-[9.5px] font-medium leading-none">
              {item.label}
            </span>
            <span
              className={cn(
                "h-0.5 w-5 rounded-full",
                active ? "bg-[var(--term-gold)]" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

// Keep default export for backward compatibility
export default function Navbar() {
  return null;
}
