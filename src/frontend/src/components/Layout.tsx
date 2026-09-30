import { Outlet } from "@tanstack/react-router";

import { MobileTabBar, Sidebar } from "@/components/Navbar";
import ThemeToggle from "@/components/ThemeToggle";

export default function Layout() {
  return (
    <div data-ocid="layout" className="flex min-h-screen">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <main
        data-ocid="main"
        className="flex-1 min-w-0 animate-fade-in pb-16 md:pb-0"
      >
        <Outlet />
      </main>

      {/* Light / dark switch — always visible, top-right */}
      <ThemeToggle className="fixed right-4 top-4 z-50" />

      {/* Mobile bottom tab bar */}
      <MobileTabBar />
    </div>
  );
}
