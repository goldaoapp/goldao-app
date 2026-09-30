import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Reads / writes the theme ("light" | "dark") in localStorage, same key as before. */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
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

  return { dark, toggle: () => setDark((d) => !d) };
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
