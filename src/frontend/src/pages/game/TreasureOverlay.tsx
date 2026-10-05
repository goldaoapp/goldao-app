import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { TreasureView } from "./board-store";
import { RollingNumber } from "./MineParts";
import {
  PAYOUT_BPS,
  TOKENS,
  fmtGoldao,
  fmtMult,
  gold,
  inkMid,
  toGoldao,
} from "./game-utils";
import { playSound } from "./sounds";

export type { TreasureView } from "./board-store";

/** A win shown as x1.62 or more is a Treasure (6 picks or deeper). */
export function isTreasure(points: number): boolean {
  return Math.round((points * PAYOUT_BPS) / 10_000) >= 162;
}

/** Gold coins falling over the whole screen while the Treasure is celebrated. */
function GoldRain() {
  const items = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 2.2 + Math.random() * 2,
        size: 24 + Math.round(Math.random() * 40),
        spin: Math.random() > 0.5 ? 720 : -720,
      })),
    [],
  );
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
          animate={{ y: "115vh", rotate: c.spin }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: "linear",
            repeat: Number.POSITIVE_INFINITY,
          }}
          style={{ left: `${c.left}%`, width: c.size, height: c.size }}
          className="absolute top-0 rounded-full drop-shadow-[0_4px_12px_oklch(0.74_0.14_80/0.6)]"
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
          className="pointer-events-none fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <span className="text-gradient-gold font-display text-[clamp(44px,12vw,110px)] font-bold uppercase leading-none tracking-wide">
            Treasure
          </span>
          <motion.span
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
            className="text-gradient-gold font-display text-[clamp(48px,13vw,120px)] font-bold leading-none tabular-nums drop-shadow-[0_0_24px_oklch(0.74_0.14_80/0.55)]"
          >
            <RollingNumber
              value={toGoldao(view.gross)}
              digits={2}
              from={0}
              scaled
              tick
            />
          </motion.span>
          <span className={`font-mono text-sm tracking-[0.2em] ${gold}`}>
            GOLDAO
          </span>
          <span className={`font-mono text-xs ${inkMid}`}>
            {fmtMult(view.points)} · profit +{fmtGoldao(view.won, 2)}
          </span>
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
            className="absolute inset-0 z-40 rounded-xl bg-black/50 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>
      {view && <GoldRain />}
      {typeof document !== "undefined" && createPortal(content, document.body)}
    </>
  );
}
