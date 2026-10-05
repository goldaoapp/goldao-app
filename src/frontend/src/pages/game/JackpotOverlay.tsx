import { cn } from "@/lib/utils";
import { Gem } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** Suspense while a tapped slot charges, then the reveal. */
const CHARGE_MS = 1700;
/** Pause after the last reveal before a miss closes by itself. */
const CLOSE_MS = 1500;

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

function Slot({
  state,
  onTap,
  ready,
  label,
}: {
  state: SlotState;
  onTap: () => void;
  ready: boolean;
  label: string;
}) {
  const tappable = state === "locked" && ready;
  return (
    <motion.button
      type="button"
      onClick={onTap}
      disabled={!tappable}
      aria-label={label}
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
            : tappable
              ? {
                  scale: [1, 1.05, 1],
                  boxShadow: [
                    "0 0 0 0 oklch(0.74 0.14 80 / 0)",
                    "0 0 18px 2px oklch(0.74 0.14 80 / 0.4)",
                    "0 0 0 0 oklch(0.74 0.14 80 / 0)",
                  ],
                }
              : { scale: 1, boxShadow: "0 0 0 0 transparent" }
      }
      transition={
        state === "charging"
          ? { duration: CHARGE_MS / 1000, ease: "easeInOut" }
          : tappable
            ? { duration: 1.4, repeat: Number.POSITIVE_INFINITY }
            : { type: "spring", stiffness: 300, damping: 18 }
      }
      className={cn(
        "flex size-20 items-center justify-center rounded-2xl border-2 disabled:cursor-default sm:size-24",
        (state === "locked" || state === "charging") &&
          "border-primary bg-[color:var(--term-card)]",
        tappable && "cursor-pointer hover:border-[color:var(--term-gold)]",
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
    </motion.button>
  );
}

/**
 * Three slots the player taps one by one: each charges with suspense and then
 * shows a diamond or an empty slot. Stage 3 is the jackpot. The board stays
 * locked while it is open; stages 1 and 2 close by themselves once the three
 * slots are open.
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
  const [slots, setSlots] = useState<SlotState[]>([
    "locked",
    "locked",
    "locked",
  ]);
  const timers = useRef<number[]>([]);
  const stage = view?.stage ?? 0;
  const won = view?.won ?? 0n;
  const jackpot = stage >= 3 && won > 0n;
  const shown = slots.filter((x) => x === "hit" || x === "miss").length;
  const charging = slots.includes("charging");
  const celebrating = jackpot && shown >= 3;

  useEffect(() => {
    setSlots(["locked", "locked", "locked"]);
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    if (view) playSound("crack");
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    };
  }, [view]);

  const tap = (index: number) => {
    if (!view || charging || slots[index] !== "locked") return;
    const order = shown + 1;
    setSlots((s) => s.map((x, i) => (i === index ? "charging" : x)));
    playSound("suspense");
    timers.current.push(
      window.setTimeout(() => {
        const hit = order <= view.stage;
        setSlots((s) =>
          s.map((x, i) => (i === index ? (hit ? "hit" : "miss") : x)),
        );
        playSound(hit ? "diamond" : "miss");
        if (order < 3) return;
        if (view.stage >= 3 && view.won > 0n) {
          timers.current.push(
            window.setTimeout(() => playSound("jackpot"), 300),
          );
        } else {
          timers.current.push(window.setTimeout(onClose, CLOSE_MS));
        }
      }, CHARGE_MS),
    );
  };

  const hits = Math.min(shown, stage);
  const ready = view !== null && !charging;

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
            {(jackpot ? won : pool) !== undefined && (
              <span
                className={cn(
                  "font-display text-xl font-semibold tabular-nums",
                  DIAMOND_TEXT,
                )}
              >
                {fmtGoldao(jackpot ? won : (pool ?? 0n))}{" "}
                <span className={cn("font-mono text-xs", inkMid)}>GOLDAO</span>
              </span>
            )}
            <div className="flex items-center gap-3">
              {slots.map((state, i) => (
                <Slot
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed three slots
                  key={i}
                  state={state}
                  ready={ready}
                  onTap={() => tap(i)}
                  label={`Reveal slot ${i + 1}`}
                />
              ))}
            </div>
            <span className={cn("text-center font-mono text-xs", inkMid)}>
              {shown >= 3 && !jackpot
                ? "So close"
                : shown === 0
                  ? "Tap a slot to reveal it"
                  : `${hits} / 3 diamonds`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const celebration = (
    <AnimatePresence>
      {celebrating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 p-4 text-center"
        >
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
            <RollingNumber value={toGoldao(won)} from={0} scaled tick />
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
      {bandHost && createPortal(band, bandHost)}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 rounded-xl bg-black/30 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>
      {celebrating && <DiamondRain />}
      {typeof document !== "undefined" &&
        createPortal(celebration, document.body)}
    </>
  );
}
