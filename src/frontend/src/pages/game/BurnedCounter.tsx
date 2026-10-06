import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { fmtGoldao, inkFaint, toGoldao } from "./game-utils";

/**
 * Public counter of all GOLDAO burned by the game (fees of loads, payouts and
 * withdrawals). When the number grows it counts up and the flame flares.
 */
export function BurnedCounter({ value }: { value: bigint }) {
  const reduce = useReducedMotion();
  const target = toGoldao(value);
  const [shown, setShown] = useState(target);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (target === from) return;
    if (target < from || reduce) {
      setShown(target);
      return;
    }
    setGain({ id: Date.now(), amount: target - from });
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const hide = window.setTimeout(() => setGain(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hide);
    };
  }, [target, reduce]);

  const burning = gain !== null;

  return (
    <div
      className="relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1"
      title="All GOLDAO burned by the game: fees of loads, payouts and withdrawals"
    >
      <motion.span
        key={gain?.id ?? "idle"}
        animate={
          burning && !reduce
            ? { scale: [1, 1.5, 1.15, 1.4, 1], rotate: [0, -8, 8, -4, 0] }
            : { scale: 1 }
        }
        transition={{ duration: 1.2 }}
        className={cn(
          "flex size-7 items-center justify-center rounded-full",
          burning ? "bg-orange-500/20" : "",
        )}
      >
        <Flame
          className={cn(
            "size-5 transition-colors",
            burning
              ? "text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.9)]"
              : "text-orange-500/80",
          )}
          fill="currentColor"
        />
      </motion.span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-semibold tabular-nums text-orange-400">
          {fmtGoldao(BigInt(Math.round(shown)) * 100_000_000n)}
          <span className={cn("ml-1 text-[10px] font-normal", inkFaint)}>
            GOLDAO
          </span>
        </span>
        <span className={cn("text-[10px] uppercase tracking-wider", inkFaint)}>
          Burned by the game
        </span>
      </div>
      <AnimatePresence>
        {gain && !reduce && (
          <motion.span
            key={gain.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -14 }}
            exit={{ opacity: 0, y: -22 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-none absolute -top-2 right-0 font-mono text-[11px] font-semibold text-orange-300"
          >
            +{Math.round(gain.amount).toLocaleString("en-US")}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
