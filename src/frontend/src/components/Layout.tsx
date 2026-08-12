import { Outlet } from "@tanstack/react-router";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function Layout() {
  return (
    <div
      data-ocid="layout"
      className="flex min-h-screen flex-col bg-background"
    >
      <Navbar />
      <main data-ocid="main" className="flex-1 bg-background animate-fade-in">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
