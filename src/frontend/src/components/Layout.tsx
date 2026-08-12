import { Outlet } from "@tanstack/react-router";

import { MobileTabBar, Sidebar } from "@/components/Navbar";

export default function Layout() {
  return (
    <div
      data-ocid="layout"
      className="flex min-h-screen bg-background"
    >
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <main data-ocid="main" className="flex-1 min-w-0 bg-background animate-fade-in pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <MobileTabBar />
    </div>
  );
}
