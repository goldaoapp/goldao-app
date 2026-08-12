import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string;
  ocid: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/", ocid: "nav.home" },
  { label: "Treasury", to: "/treasury", ocid: "nav.treasury" },
  { label: "Proposals", to: "/proposals", ocid: "nav.proposals" },
  { label: "Rewards Simulator", to: "/rewards", ocid: "nav.rewards" },
  { label: "Documentation", to: "/documentation", ocid: "nav.documentation" },
  { label: "News", to: "/news", ocid: "nav.news" },
];

function isActive(currentPath: string, to: string): boolean {
  if (to === "/") return currentPath === "/";
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

function NavLink({
  item,
  onNavigate,
}: { item: NavItem; onNavigate?: () => void }) {
  const { location } = useRouterState();
  const active = isActive(location.pathname, item.to);

  return (
    <Link
      to={item.to}
      data-ocid={item.ocid}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative text-sm font-medium transition-colors duration-200 rounded-md px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.label}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-px bg-primary"
        />
      )}
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header
      data-ocid="navbar"
      className="sticky top-0 z-40 w-full border-b border-border bg-card/80 backdrop-blur-md shadow-subtle"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          to="/"
          data-ocid="nav.brand"
          aria-label="GOLDAO home"
          className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
        >
          <span className="flex size-8 items-center justify-center rounded-md gradient-primary text-primary-foreground font-display font-bold text-sm shadow-subtle">
            G
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            GOLDAO
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Button
            data-ocid="nav.connect_wallet"
            size="sm"
            className="rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90 transition-opacity"
          >
            <Wallet className="size-4" />
            Connect Wallet
          </Button>
        </div>

        {/* Mobile menu trigger */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                data-ocid="nav.mobile_menu"
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
                className="text-foreground"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-72 bg-card border-border"
              aria-label="Mobile navigation"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 px-2 pb-4 pt-2">
                  <span className="flex size-8 items-center justify-center rounded-md gradient-primary text-primary-foreground font-display font-bold text-sm">
                    G
                  </span>
                  <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                    GOLDAO
                  </span>
                </div>
                <nav
                  aria-label="Mobile primary"
                  className="flex flex-1 flex-col gap-1 px-2"
                >
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.to}
                      item={item}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </nav>
                <div className="px-2 pb-6">
                  <Button
                    data-ocid="nav.mobile.connect_wallet"
                    className="w-full rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90 transition-opacity"
                  >
                    <Wallet className="size-4" />
                    Connect Wallet
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
