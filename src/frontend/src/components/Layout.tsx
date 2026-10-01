import { Outlet } from "@tanstack/react-router";

import { MobileTabBar, MobileTopBar, Sidebar } from "@/components/Navbar";
import ThemeToggle from "@/components/ThemeToggle";

export default function Layout() {
  return (
    <div data-ocid="layout" className="flex min-h-screen">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <main
        data-ocid="main"
        className="flex-1 min-w-0 animate-fade-in pb-20 pt-14 md:pb-0 md:pt-0"
      >
        <Outlet />
      </main>

      {/* Light / dark switch — desktop: fixed top-right; mobile: inside the top bar */}
      <ThemeToggle className="fixed right-4 top-4 z-50 hidden md:flex" />
      <MobileTopBar />

      {/* Mobile bottom tab bar */}
      <MobileTabBar />
    </div>
  );
}
