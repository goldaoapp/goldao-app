import { Link, useRouterState } from "@tanstack/react-router";
import {
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

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  ocid: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/", icon: Home, ocid: "nav.home" },
  { label: "Treasury", to: "/treasury", icon: Lock, ocid: "nav.treasury" },
  { label: "Proposals", to: "/proposals", icon: Gavel, ocid: "nav.proposals" },
  { label: "Rewards", to: "/rewards", icon: Gift, ocid: "nav.rewards" },
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

// Mobile bottom tab order: Home, Treasury, Rewards, Fair Value, More
const MOBILE_TABS: NavItem[] = [
  NAV_ITEMS[0], // Home
  NAV_ITEMS[1], // Treasury
  NAV_ITEMS[3], // Rewards
  NAV_ITEMS[4], // Fair Value
];

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
          "rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90 transition-opacity",
          collapsed && "rounded-lg px-0 w-full",
        )}
      >
        <Wallet className="size-4 flex-shrink-0" />
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
        title={collapsed ? "Salir" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center px-0",
        )}
      >
        <LogOut className="size-[18px] flex-shrink-0" aria-hidden="true" />
        {!collapsed && "Salir"}
      </button>
    </div>
  );
}

/* ─── Mobile Bottom Tab Bar ─── */
export function MobileTabBar() {
  const { location } = useRouterState();

  return (
    <nav
      data-ocid="mobile-tabs"
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-md px-2 pb-[env(safe-area-inset-bottom,0px)] pt-2 md:hidden"
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
              "flex flex-col items-center gap-1 py-1.5 px-3 rounded-md transition-colors outline-none",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="text-[9px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      {/* More button — opens remaining items */}
      <MoreMenu pathname={location.pathname} />
    </nav>
  );
}

const MORE_ITEMS: NavItem[] = [
  NAV_ITEMS[2], // Proposals
  NAV_ITEMS[5], // Docs
  NAV_ITEMS[6], // News
];

function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, isLoading, isAdmin, login, logout } = useAuth();
  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.to));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-ocid="mobile.nav.more"
        className={cn(
          "flex flex-col items-center gap-1 py-1.5 px-3 rounded-md transition-colors outline-none",
          moreActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-5"
          role="img"
          aria-label="More"
        >
          <circle cx="10" cy="10" r="2" />
          <path d="M10 3v2M10 15v2M3 10h2M15 10h2" />
        </svg>
        <span className="text-[9px] font-medium">More</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={() => {}}
            role="presentation"
          />
          <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[160px] rounded-lg border border-border bg-card/95 backdrop-blur-md shadow-lg py-1">
            {MORE_ITEMS.map((item) => {
              const active = isActive(pathname, item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}

            <div className="my-1 border-t border-border" />

            {!isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  login();
                }}
                disabled={isLoading}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-primary transition-colors"
              >
                <Wallet className="size-4" aria-hidden="true" />
                Connect Wallet
              </button>
            ) : (
              <>
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-primary transition-colors"
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
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Salir
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Keep default export for backward compatibility
export default function Navbar() {
  return null;
}
