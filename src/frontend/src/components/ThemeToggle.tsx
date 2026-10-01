import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const THEME_EVENT = "goldao-theme-change";

/** Reads / writes the theme ("light" | "dark") in localStorage, same key as before. */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return document.documentElement.classList.contains("dark");
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  }, [dark]);

  // Keep every toggle instance (desktop + mobile top bar) in sync.
  useEffect(() => {
    const onChange = (e: Event) => setDark((e as CustomEvent<boolean>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  };

  return { dark, toggle };
}

/** Light / dark switch, fixed in the top-right corner of every page. */
export default function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useDarkMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      data-ocid="theme.toggle"
      className={cn(
        "relative flex h-8 w-[60px] shrink-0 items-center rounded-full border border-[color:var(--term-border)] bg-[var(--term-card)] p-1 shadow-sm backdrop-blur-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Sun
        className={cn(
          "absolute left-2 size-3.5 text-[color:var(--term-ink-faint)] transition-opacity",
          dark ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <Moon
        className={cn(
          "absolute right-2 size-3.5 text-[color:var(--term-ink-faint)] transition-opacity",
          dark ? "opacity-0" : "opacity-100",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full bg-[var(--term-gold)] text-white shadow transition-transform duration-300",
          dark ? "translate-x-[26px]" : "translate-x-0",
        )}
      >
        {dark ? (
          <Moon className="size-3.5" aria-hidden="true" />
        ) : (
          <Sun className="size-3.5" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
