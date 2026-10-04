import { cn } from "@/lib/utils";
import { Gem } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RollingNumber } from "./MineParts";
import type { JackpotView } from "./board-store";
import {
  DIAMOND_IMG,
  DIAMOND_TEXT,
  TOKENS,
  fmtGoldao,
  gold,
  inkFaint,
  inkMid,
  toGoldao,
} from "./game-utils";
import { playSound } from "./sounds";

/** Each slot: suspense while it charges, then the reveal. */
const SLOT_MS = 2100;
const CHARGE_MS = 1700;
const OPEN_MS = 700;

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

/** Diamonds falling over the whole screen while the jackpot is celebrated. */
function DiamondRain() {
  const items = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 2.4 + Math.random() * 2.2,
        size: 26 + Math.round(Math.random() * 48),
        spin: Math.random() > 0.5 ? 540 : -540,
      })),
    [],
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
    >
      {items.map((d) => (
        <motion.div
          key={d.id}
          initial={{ y: -140, rotate: 0 }}
          animate={{ y: "115vh", rotate: d.spin }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            ease: "linear",
            repeat: Number.POSITIVE_INFINITY,
          }}
          style={{ left: `${d.left}%`, width: d.size, height: d.size }}
          className="absolute top-0 drop-shadow-[0_4px_12px_oklch(0.8_0.12_350/0.6)]"
        >
          <DiamondIcon fill />
        </motion.div>
      ))}
    </div>,
    document.body,
  );
}

function DiamondIcon({
  fill,
  className,
}: { fill?: boolean; className?: string }) {
  const size = fill ? "size-full" : "size-[68%]";
  return DIAMOND_IMG ? (
    <img
      src={DIAMOND_IMG}
      alt="Diamond"
      className={cn("object-contain", size, className)}
    />
  ) : (
    <Gem className={cn(size, DIAMOND_TEXT, className)} />
  );
}

type SlotState = "locked" | "charging" | "hit" | "miss";

function Slot({ state }: { state: SlotState }) {
  return (
    <motion.div
      animate={
        state === "charging"
          ? {
              scale: [1, 1.06],
              boxShadow: [
                "0 0 0 0 oklch(0.74 0.14 80 / 0)",
                "0 0 32px 4px oklch(0.74 0.14 80 / 0.55)",
              ],
            }
          : state === "hit"
            ? {
                scale: [0.7, 1],
                boxShadow: "0 0 28px oklch(0.7 0.14 350 / 0.5)",
              }
            : { scale: 1, boxShadow: "0 0 0 0 transparent" }
      }
      transition={
        state === "charging"
          ? { duration: CHARGE_MS / 1000, ease: "easeInOut" }
          : { type: "spring", stiffness: 300, damping: 18 }
      }
      className={cn(
        "flex size-20 items-center justify-center rounded-2xl border-2 sm:size-24",
        (state === "locked" || state === "charging") &&
          "border-primary bg-[color:var(--term-card)]",
        state === "hit" &&
          "border-[oklch(0.68_0.16_350/0.85)] bg-[oklch(0.7_0.14_350/0.18)]",
        state === "miss" &&
          "border-[color:var(--term-border)] bg-[var(--term-alt)] opacity-70",
      )}
    >
      {state === "hit" ? (
        <DiamondIcon />
      ) : state === "miss" ? (
        <span className={cn("font-mono text-2xl", inkFaint)}>-</span>
      ) : (
        <span className={cn("font-display text-3xl font-bold", gold)}>?</span>
      )}
    </motion.div>
  );
}

/**
 * Three slots, each one built up with suspense and then revealed: diamond or
 * empty. Stage 3 is the jackpot. The board stays locked while it is open;
 * stages 1 and 2 close by themselves.
 *
 * The slots are drawn in `bandHost`, the gap that opens in the middle of the
 * split board. The jackpot celebration covers the whole panel.
 */
export function JackpotOverlay({
  view,
  onClose,
  bandHost,
  pool,
}: {
  view: JackpotView | null;
  onClose: () => void;
  bandHost: HTMLElement | null;
  pool: bigint | undefined;
}) {
  const [shown, setShown] = useState(0);
  const [charging, setCharging] = useState(0);
  const stage = view?.stage ?? 0;
  const won = view?.won ?? 0n;
  const jackpot = stage >= 3 && won > 0n;
  const celebrating = jackpot && shown >= 3;

  useEffect(() => {
    setShown(0);
    setCharging(0);
    if (!view) return;
    const timers: number[] = [];
    const visible = Math.min(3, view.stage + 1);
    playSound("crack");
    for (let i = 1; i <= visible; i++) {
      const start = OPEN_MS + (i - 1) * SLOT_MS;
      timers.push(
        window.setTimeout(() => {
          setCharging(i);
          playSound("suspense");
        }, start),
        window.setTimeout(() => {
          setCharging(0);
          setShown(i);
          playSound(i <= view.stage ? "diamond" : "miss");
        }, start + CHARGE_MS),
      );
    }
    if (view.stage >= 3 && view.won > 0n) {
      timers.push(
        window.setTimeout(
          () => playSound("jackpot"),
          OPEN_MS + 2 * SLOT_MS + CHARGE_MS + 300,
        ),
      );
    } else {
      timers.push(
        window.setTimeout(
          onClose,
          OPEN_MS + (visible - 1) * SLOT_MS + CHARGE_MS + 1500,
        ),
      );
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [view, onClose]);

  const slotState = (slot: number): SlotState => {
    if (shown >= slot) return slot <= stage ? "hit" : "miss";
    return charging === slot ? "charging" : "locked";
  };
  const hits = Math.min(shown, stage);

  const band = (
    <AnimatePresence>
      {view && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          className="my-2 overflow-hidden border-y border-dashed border-[oklch(0.68_0.16_350/0.7)] bg-[radial-gradient(ellipse_at_center,oklch(0.7_0.14_350/0.14),transparent_75%)] sm:my-2.5"
        >
          <div className="flex flex-col items-center gap-3 px-2 py-4">
            <motion.span
              animate={{ opacity: [1, 0.35, 1], scale: [1, 1.04, 1] }}
              transition={{
                duration: 1.1,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
              className={cn(
                "text-center font-display text-[clamp(26px,7vw,42px)] font-bold leading-none tracking-wider",
                DIAMOND_TEXT,
              )}
            >
              DIAMOND JACKPOT
            </motion.span>
            {pool !== undefined && (
              <span
                className={cn(
                  "font-display text-xl font-semibold tabular-nums",
                  DIAMOND_TEXT,
                )}
              >
                {fmtGoldao(pool)}{" "}
                <span className={cn("font-mono text-xs", inkMid)}>GOLDAO</span>
              </span>
            )}
            <div className="flex items-center gap-3">
              {[1, 2, 3].map((slot) => (
                <Slot key={slot} state={slotState(slot)} />
              ))}
            </div>
            <span className={cn("text-center font-mono text-xs", inkMid)}>
              {shown >= Math.min(3, stage + 1) && !jackpot
                ? "So close"
                : `${hits} / 3 diamonds`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {bandHost && createPortal(band, bandHost)}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/30 p-4 text-center backdrop-blur-[2px]"
          >
            <DiamondRain />
            <div className="flex items-center gap-2">
              {[0, 0.2, 0.4].map((delay, i) => (
                <motion.div
                  key={delay}
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{
                    duration: 1.2,
                    delay,
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                  className={
                    i === 1 ? "size-20 sm:size-28" : "size-14 sm:size-20"
                  }
                >
                  <DiamondIcon fill />
                </motion.div>
              ))}
            </div>
            <span className="text-gradient-gold font-display text-[clamp(44px,12vw,120px)] font-bold leading-none tracking-wide">
              JACKPOT
            </span>
            <motion.span
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
              className="text-gradient-gold font-display text-[clamp(52px,14vw,140px)] font-bold leading-none tabular-nums drop-shadow-[0_0_24px_oklch(0.74_0.14_80/0.55)]"
            >
              +
              <RollingNumber
                value={toGoldao(won)}
                digits={2}
                from={0}
                scaled
                tick
              />
            </motion.span>
            <span className={cn("font-mono text-sm tracking-[0.2em]", gold)}>
              GOLDAO
            </span>
            {view?.held && (
              <span className="max-w-xs font-mono text-xs text-[color:var(--term-ink)]">
                On hold: it is confirmed from the third pick.
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="gradient-primary mt-2 rounded-full px-9 py-3 font-display text-lg font-bold text-primary-foreground"
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
