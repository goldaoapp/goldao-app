import { cn } from "@/lib/utils";
import { Gem } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { JackpotView } from "./board-store";
import {
  DIAMOND_IMG,
  DIAMOND_TEXT,
  TOKENS,
  eyebrow,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
} from "./game-utils";
import { playSound } from "./sounds";

const REVEAL_MS = 900;

/** Falling coins; `seed` restarts the shower. */
export function CoinRain({ seed }: { seed: number }) {
  const coins = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: `${seed}-${i}`,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 1.6 + Math.random() * 1.2,
        size: 18 + Math.round(Math.random() * 14),
        spin: Math.random() > 0.5 ? 360 : -360,
      })),
    [seed],
  );
  if (seed === 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {coins.map((c) => (
        <motion.img
          key={c.id}
          src={TOKENS.GOLDAO.logo}
          alt=""
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{ y: 520, opacity: [0, 1, 1, 0], rotate: c.spin }}
          transition={{ duration: c.duration, delay: c.delay, ease: "easeIn" }}
          style={{ left: `${c.left}%`, width: c.size, height: c.size }}
          className="absolute top-0 rounded-full"
        />
      ))}
    </div>
  );
}

function DiamondIcon({ big }: { big?: boolean }) {
  return DIAMOND_IMG ? (
    <img
      src={DIAMOND_IMG}
      alt="Diamond"
      className={cn("object-contain", big ? "size-12" : "size-9")}
    />
  ) : (
    <Gem className={cn(big ? "size-10" : "size-8", DIAMOND_TEXT)} />
  );
}

/**
 * Three slots revealed one by one: diamond or empty. Stage 3 is the jackpot.
 * The board stays locked while it is open; stages 1 and 2 close by themselves.
 */
export function JackpotOverlay({
  view,
  onClose,
}: {
  view: JackpotView | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(0);
  const stage = view?.stage ?? 0;
  const won = view?.won ?? 0n;
  const jackpot = stage >= 3 && won > 0n;

  useEffect(() => {
    if (!view) {
      setShown(0);
      return;
    }
    setShown(0);
    const timers: number[] = [];
    const visible = Math.min(3, view.stage + 1);
    for (let i = 1; i <= visible; i++) {
      timers.push(
        window.setTimeout(() => {
          setShown(i);
          if (i <= view.stage) playSound("diamond");
        }, i * REVEAL_MS),
      );
    }
    if (!(view.stage >= 3 && view.won > 0n)) {
      timers.push(window.setTimeout(onClose, (visible + 1) * REVEAL_MS + 400));
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [view, onClose]);

  return (
    <AnimatePresence>
      {view && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-xl bg-[color:var(--term-card)]/95 p-4 backdrop-blur-sm"
        >
          {jackpot && shown >= 3 && <CoinRain seed={1} />}
          <span className={cn(eyebrow, DIAMOND_TEXT)}>Diamond jackpot</span>
          <div className="flex items-center gap-3">
            {[1, 2, 3].map((slot) => {
              const revealed = shown >= slot;
              const hit = slot <= stage;
              return (
                <motion.div
                  key={slot}
                  animate={
                    revealed
                      ? { rotateY: [90, 0], scale: [0.6, 1] }
                      : { rotateY: 0, scale: 1 }
                  }
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className={cn(
                    "flex size-20 items-center justify-center rounded-xl border-2",
                    !revealed &&
                      "border-[color:var(--term-border)] bg-[var(--term-header)]",
                    revealed &&
                      hit &&
                      "border-[oklch(0.68_0.16_350/0.8)] bg-[oklch(0.7_0.14_350/0.18)]",
                    revealed &&
                      !hit &&
                      "border-[color:var(--term-border)] bg-[var(--term-alt)]",
                  )}
                >
                  {revealed ? (
                    hit ? (
                      <DiamondIcon big />
                    ) : (
                      <span className={cn("font-mono text-2xl", inkFaint)}>
                        -
                      </span>
                    )
                  ) : (
                    <span className={cn("font-mono text-2xl", inkFaint)}>
                      ?
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            {shown >= Math.min(3, stage + 1) && (
              <motion.div
                key={jackpot ? "jackpot" : "close"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-2 text-center"
              >
                {jackpot ? (
                  <>
                    <span
                      className={cn(
                        "font-display text-4xl font-bold tracking-wide",
                        gold,
                      )}
                    >
                      JACKPOT
                    </span>
                    <span
                      className={cn(
                        "font-display text-3xl font-semibold tabular-nums",
                        ink,
                      )}
                    >
                      {fmtGoldao(won, 2)} GOLDAO
                    </span>
                    {view?.held && (
                      <span
                        className={cn("max-w-xs font-mono text-xs", inkMid)}
                      >
                        On hold: it is confirmed from the third pick.
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="gradient-primary mt-1 rounded-full px-5 py-1.5 font-display text-sm font-semibold text-primary-foreground"
                    >
                      Continue
                    </button>
                  </>
                ) : (
                  <span className={cn("font-display text-xl", inkMid)}>
                    So close
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
