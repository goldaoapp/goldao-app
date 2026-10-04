import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Small ring shown while a value is loading. It uses the current text colour
 * and size, so it follows the light and dark themes automatically.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-[max(0.7em,10px)] animate-spin rounded-full border-[max(0.1em,1.5px)] border-current border-t-transparent align-middle opacity-50",
        className,
      )}
    />
  );
}

/**
 * Large ring over the board while the session and the player's state load, so
 * the empty board is never mistaken for a ready one. After a while it says the
 * wait is longer than usual.
 */
export function BoardLoader() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <output
      aria-label="Loading"
      className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-3 rounded-lg bg-[var(--term-card)]/75 backdrop-blur-[2px]"
    >
      <span className="size-16 animate-spin rounded-full border-4 border-[color:var(--term-gold)] border-t-transparent sm:size-20" />
      <span className="font-mono text-xs text-[color:var(--term-gold)]">
        {slow ? "Still loading. Check your connection." : "Loading your mine"}
      </span>
    </output>
  );
}
