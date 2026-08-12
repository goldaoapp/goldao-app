import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gift,
  Gavel,
  Home,
  Lock,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  { label: "Docs", to: "/documentation", icon: BookOpen, ocid: "nav.documentation" },
  { label: "News", to: "/news", icon: FileText, ocid: "nav.news" },
];

// Mobile bottom tab order: Home, Treasury, Rewards, Proposals, More
const MOBILE_TABS: NavItem[] = [
  NAV_ITEMS[0], // Home
  NAV_ITEMS[1], // Treasury
  NAV_ITEMS[3], // Rewards
  NAV_ITEMS[2], // Proposals
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
      <div className={cn("flex items-center gap-2.5 border-b border-border h-16 flex-shrink-0", collapsed ? "justify-center px-2" : "px-5")}>
        <Link
          to="/"
          data-ocid="nav.brand"
          aria-label="GOLDAO home"
          className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <img src="/assets/images/goldao-icon.png" alt="GOLDAO" className="size-8 rounded-md flex-shrink-0" />
          {!collapsed && (
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              GOLDAO
            </span>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2.5 overflow-y-auto">
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

        {/* Connect wallet */}
        <Button
          data-ocid="nav.connect_wallet"
          size="sm"
          className={cn(
            "rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90 transition-opacity",
            collapsed && "rounded-lg px-0 w-full",
          )}
        >
          <Wallet className="size-4 flex-shrink-0" />
          {!collapsed && "Connect Wallet"}
        </Button>
      </div>
    </aside>
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
      <Link
        to="/documentation"
        data-ocid="mobile.nav.more"
        className={cn(
          "flex flex-col items-center gap-1 py-1.5 px-3 rounded-md transition-colors outline-none",
          isActive(location.pathname, "/documentation") || isActive(location.pathname, "/news")
            ? "text-primary"
            : "text-muted-foreground",
        )}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
          <circle cx="10" cy="10" r="2" />
          <path d="M10 3v2M10 15v2M3 10h2M15 10h2" />
        </svg>
        <span className="text-[9px] font-medium">More</span>
      </Link>
    </nav>
  );
}

// Keep default export for backward compatibility
export default function Navbar() {
  return null;
}
