import type { GameSummary } from "@/backend";
import { cn } from "@/lib/utils";
import { Gem, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ShinyDiamond } from "./Diamonds";
import { DIAMOND_IMG, DIAMOND_TEXT, eyebrow, inkFaint } from "./game-utils";
import { observePool } from "./jackpot-watch";

const SHOWN_MS = 7_000;

/**
 * Floating notice, shown on every tab of the game page when a jackpot was paid to anyone,
 * the viewer included. No amounts and no names. Driven by the pool of the public summary
 * (see jackpot-watch).
 */
export function JackpotNotice({
  summary,
  readAt,
}: { summary: GameSummary | undefined; readAt: number }) {
  const [shown, setShown] = useState(0);
  const pool = summary?.pool;
  const tournament = summary?.tournament;

  // One reading per answer from the server (readAt changes even when the pool does not).
  useEffect(() => {
    if (pool === undefined || tournament === undefined) return;
    // Also shown to the winner: it proves the notice appears whenever a jackpot is paid.
    if (observePool({ tournament, pool, at: readAt })) setShown((n) => n + 1);
  }, [readAt, pool, tournament]);

  useEffect(() => {
    if (shown === 0) return;
    const t = setTimeout(() => setShown(0), SHOWN_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
    >
      <AnimatePresence>
        {shown > 0 && (
          <motion.div
            key="notice"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-auto relative flex w-full max-w-[440px] items-center gap-3 overflow-hidden rounded-2xl border border-[oklch(0.68_0.16_350/0.45)] bg-[oklch(0.22_0.03_350/0.92)] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur-md"
          >
            {DIAMOND_IMG && (
              <div aria-hidden className="flex shrink-0 items-end">
                {[-14, 0, 14].map((r, i) => (
                  <ShinyDiamond
                    key={r}
                    rotate={r}
                    lift={i === 1 ? 0 : 3}
                    delay={i * 0.5}
                    z={i === 1 ? 2 : 1}
                    className={cn("w-[26px]", i > 0 && "-ml-2")}
                  />
                ))}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  eyebrow,
                  DIAMOND_TEXT,
                  "flex items-center gap-1.5 text-[10px]",
                )}
              >
                <Gem className="size-3" /> Diamond jackpot
              </span>
              <span className="text-[13px] leading-snug text-[color:var(--term-ink)]">
                A new jackpot winner! Congratulations!
              </span>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setShown(0)}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/10",
                inkFaint,
              )}
            >
              <X className="size-3.5" />
            </button>
            <motion.span
              key={shown}
              className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[oklch(0.75_0.15_350)]"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: SHOWN_MS / 1000, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
