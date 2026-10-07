import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { SunRays } from "./JackpotOverlay";
import { RollingNumber } from "./MineParts";
import type { TreasureView } from "./board-store";
import {
  TOKENS,
  TREASURE_MIN_PICKS,
  fmtPct1,
  gold,
  toGoldao,
} from "./game-utils";
import { playSound } from "./sounds";

export type { TreasureView } from "./board-store";

/** A win saved at 6 picks or deeper is a Treasure (depth, so it never depends on the payout rate). */
export function isTreasure(picks: number): boolean {
  return picks >= TREASURE_MIN_PICKS;
}

/** Gold coins falling over the whole screen while the Treasure is celebrated. */
function GoldRain() {
  // Fewer coins and no per-coin blur filter on small screens, and the fall distance in plain
  // pixels: mixing px and vh makes the animation library measure the layout of every coin.
  const { items, fall, light } = useMemo(() => {
    const w = typeof window === "undefined" ? 1024 : window.innerWidth;
    const h = typeof window === "undefined" ? 800 : window.innerHeight;
    const light = w < 768;
    return {
      light,
      fall: h + 160,
      items: Array.from({ length: light ? 24 : 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 2.2 + Math.random() * 2,
        size: 24 + Math.round(Math.random() * 40),
        spin: Math.random() > 0.5 ? 720 : -720,
      })),
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
    >
      {items.map((c) => (
        <motion.img
          key={c.id}
          src={TOKENS.GOLDAO.logo}
          alt=""
          initial={{ y: -120, rotate: 0 }}
          animate={{ y: fall, rotate: c.spin }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: "linear",
            repeat: Number.POSITIVE_INFINITY,
          }}
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size,
            willChange: "transform",
          }}
          className={cn(
            "absolute top-0 rounded-full",
            !light && "drop-shadow-[0_4px_12px_oklch(0.74_0.14_80/0.6)]",
          )}
        />
      ))}
    </div>,
    document.body,
  );
}

/**
 * Celebration for a win of x1.62 or more. It shows the whole prize, stake
 * included, covers the board panel and closes with Continue.
 */
export function TreasureOverlay({
  view,
  onClose,
}: {
  view: TreasureView | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (view) playSound("treasure");
  }, [view]);

  const content = (
    <AnimatePresence>
      {view && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[90] flex transform-gpu flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <svg width="0" height="0" className="absolute" aria-hidden>
            <title>Gold</title>
            <defs>
              <linearGradient
                id="treasure-gold"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="24"
                y2="24"
              >
                <stop offset="0" stopColor="oklch(0.86 0.14 80)" />
                <stop offset="1" stopColor="oklch(0.65 0.14 50)" />
              </linearGradient>
            </defs>
          </svg>
          <Trophy
            stroke="url(#treasure-gold)"
            strokeWidth={1.6}
            className="size-[clamp(64px,12vw,104px)] drop-shadow-[0_6px_18px_oklch(0.74_0.14_80/0.6)]"
          />
          <span className="text-gradient-gold font-display text-[clamp(44px,12vw,110px)] font-bold uppercase leading-none tracking-wide">
            Treasure
          </span>
          <span className="relative inline-flex">
            {/* Static glow behind the number: a blur filter on the animated number is repainted every frame */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-x-[12%] -inset-y-[30%] -z-10 rounded-full bg-[radial-gradient(closest-side,oklch(0.74_0.14_80/0.35),transparent)]"
            />
            <motion.span
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
              className="text-gradient-gold font-display text-[clamp(48px,13vw,120px)] font-bold leading-none tabular-nums"
            >
              +
              <RollingNumber
                value={toGoldao(view.gross)}
                from={0}
                scaled
                tick
                fixed2
              />
            </motion.span>
          </span>
          <span className={`font-mono text-sm tracking-[0.2em] ${gold}`}>
            GOLDAO
          </span>
          {view.gross > view.won && (
            <span
              className="rounded-full border border-[color:var(--term-green-border)] px-3 py-1 font-mono text-xs font-bold text-[color:var(--term-green)]"
              style={{
                background:
                  "linear-gradient(var(--term-green-bg), var(--term-green-bg)), oklch(var(--background))",
              }}
            >
              +{fmtPct1(view.won, view.gross - view.won)}% profit
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="gradient-primary pointer-events-auto mt-2 rounded-full px-9 py-3 font-display text-lg font-bold text-primary-foreground"
          >
            Continue
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <AnimatePresence>
        {view && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 rounded-xl bg-black/50"
          />
        )}
      </AnimatePresence>
      {view && <SunRays color="oklch(0.74 0.14 80 / 0.55)" />}
      {view && <GoldRain />}
      {typeof document !== "undefined" && createPortal(content, document.body)}
    </>
  );
}
