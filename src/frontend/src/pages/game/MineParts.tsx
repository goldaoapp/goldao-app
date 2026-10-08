import type {
  Dashboard,
  EndResult,
  ExcavationView,
  GameConfig,
} from "@/backend";
import { EndKind } from "@/backend";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Gem,
  Mountain,
  RotateCcw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Cell, useBoard } from "./board-store";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  MAX_PICKS,
  ROCK_CELL,
  STAKE_LABELS,
  TOKENS,
  type TokenKey,
  eyebrow,
  fmtCountdown,
  fmtFixed2Number,
  fmtGoldao,
  fmtGoldao2,
  fmtGoldaoNumber,
  fmtMultOf,
  fmtPct1,
  gold,
  ink,
  inkFaint,
  inkMid,
  miniPrizeOf,
  prizeName,
  toGoldao,
} from "./game-utils";
import { playSound } from "./sounds";

/** Covered cell: faceted rock. The vars set the facet tones for the light and dark themes. */
const SLAB_CLASS = cn(
  "[--f1:rgba(255,255,255,.4)] [--f2:rgba(90,70,45,.24)] [--f3:rgba(255,255,255,.2)] [--b1:#c6b8a3] [--b2:#a99880]",
  "dark:[--f1:rgba(255,255,255,.12)] dark:[--f2:rgba(0,0,0,.28)] dark:[--f3:rgba(255,255,255,.06)] dark:[--b1:#4a443d] dark:[--b2:#2f2b27]",
  "bg-[linear-gradient(135deg,var(--f1)_0_50%,transparent_50%),linear-gradient(45deg,transparent_0_50%,var(--f2)_50%),linear-gradient(160deg,transparent_0_28%,var(--f3)_28%_60%,transparent_60%),linear-gradient(180deg,var(--b1),var(--b2))]",
  "border border-[rgba(80,65,45,.4)] dark:border-[rgba(199,154,59,.3)]",
  "shadow-[inset_0_2px_0_rgba(255,255,255,.6),inset_0_-4px_0_rgba(80,65,45,.3),0_3px_6px_rgba(80,55,25,.22)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.14),inset_0_-4px_0_rgba(0,0,0,.4),0_4px_8px_rgba(0,0,0,.5)]",
);

/** One pickaxe swing lasts this long; the blow lands at STRIKE_AT of the swing. */
const SWING_S = 0.4;
const STRIKE_AT = 0.58;

/** Multiplier of the pick that was just revealed, floating up from its cell. */
export interface CellPop {
  index: number;
  text: string;
  id: number;
}

export function MineCell({
  cell,
  digging,
  disabled,
  onClick,
  enterNo = 0,
  enterDelay = 0,
  pop = null,
  onStrike,
}: {
  cell: Cell | undefined;
  digging: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Counts the times the board was loaded; above 0 the cell rises into place. */
  enterNo?: number;
  enterDelay?: number;
  pop?: CellPop | null;
  /** Called on every pickaxe blow, so the board can shake. */
  onStrike?: () => void;
}) {
  const hitCtl = useAnimationControls();
  const [hits, setHits] = useState(0);
  const strike = useRef(onStrike);
  strike.current = onStrike;
  const style = !cell
    ? "border-[color:var(--term-border)] bg-[var(--term-header)]"
    : cell.kind === "rock"
      ? ROCK_CELL
      : cell.kind === "diamond"
        ? DIAMOND_CELL
        : TOKENS[cell.token].cell;
  const picking = digging && !cell;

  // While the pick is being dug: one blow per swing, with its sound, sparks and shake.
  useEffect(() => {
    if (!picking) return;
    let timer = 0;
    const blow = () => {
      playSound("hit");
      strike.current?.();
      setHits((h) => h + 1);
      void hitCtl.start({
        x: [0, 2, -2, 0],
        y: [0, 3, -1, 0],
        scale: [1, 0.95, 1.02, 1],
        transition: { duration: 0.14 },
      });
    };
    const first = window.setTimeout(
      () => {
        blow();
        timer = window.setInterval(blow, SWING_S * 1000);
      },
      SWING_S * STRIKE_AT * 1000,
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      setHits(0);
    };
  }, [picking, hitCtl]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || !!cell}
      initial={enterNo > 0 ? { opacity: 0, y: 40, scale: 0.9 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: "easeOut", delay: enterDelay }}
      className={cn(
        "relative aspect-square rounded-lg disabled:cursor-default [&:enabled:active_.lift]:scale-95 [&:enabled:hover_.lift]:-translate-y-[3px] [&:enabled:hover_.lift]:brightness-110",
        (picking || pop) && "z-10",
      )}
      aria-label={cell ? cell.kind : "Dig this cell"}
    >
      <motion.span
        animate={hitCtl}
        className="absolute inset-0 rounded-[inherit]"
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit] border-[1.5px]",
            style,
          )}
        >
          <AnimatePresence>
            {cell && (
              <motion.span
                key={cell.kind}
                initial={{ opacity: 0, y: "-70%", scale: 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 240,
                  damping: 13,
                  delay: 0.15,
                }}
                className="flex size-full items-center justify-center"
              >
                <CellContent cell={cell} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="lift absolute inset-0 rounded-[inherit] transition-[transform,filter] duration-200">
          <motion.span
            initial={false}
            animate={
              cell
                ? { opacity: 0, y: "46%", scale: 0.9, rotate: 3 }
                : { opacity: 1, y: 0, scale: 1, rotate: 0 }
            }
            transition={
              cell ? { duration: 0.45, ease: "easeIn" } : { duration: 0 }
            }
            className={cn(
              "absolute inset-0 overflow-hidden rounded-[inherit]",
              SLAB_CLASS,
            )}
          >
            <Glint />
          </motion.span>
          {picking && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_50%_55%,rgba(255,200,90,0.45),transparent_62%)]"
              animate={{ opacity: [0, 0, 1, 0] }}
              transition={{
                duration: SWING_S,
                times: [0, 0.4, STRIKE_AT, 1],
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          )}
        </span>
      </motion.span>
      {picking && <PickaxeSwing />}
      {picking && hits > 0 && (
        <Burst key={hits} sparks={6} chips={5} color="#ffd67a" />
      )}
      {cell?.kind === "diamond" && <Sparkle />}
      {pop && (
        <Burst
          key={`p${pop.id}`}
          sparks={12}
          chips={0}
          color={cell?.kind === "diamond" ? "#ff8fbf" : "#ffcf6b"}
        />
      )}
      {pop && <MultPop key={pop.id} text={pop.text} />}
    </motion.button>
  );
}

/**
 * Gold sheen that crosses a covered cell now and then, each cell on its own timing. It only moves
 * a transform (run by the browser, off the main thread), so 25 of them cost almost nothing.
 */
function Glint() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const from = "translateX(-160%) skewX(-18deg)";
    const to = "translateX(340%) skewX(-18deg)";
    const anim = el.animate(
      [
        { transform: from, offset: 0 },
        { transform: to, offset: 0.3 },
        { transform: to, offset: 1 },
      ],
      {
        duration: 6000,
        iterations: Number.POSITIVE_INFINITY,
        delay: -Math.random() * 6000,
        easing: "linear",
      },
    );
    return () => anim.cancel();
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-[45%] bg-[linear-gradient(90deg,transparent,rgba(224,178,70,.5),transparent)] will-change-transform"
      style={{ transform: "translateX(-160%) skewX(-18deg)" }}
    />
  );
}

/** Pickaxe that rises and strikes the cell once per swing. */
function PickaxeSwing() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-0"
    >
      <motion.svg
        viewBox="0 0 64 64"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute -left-[30px] -top-[52px] size-[60px] drop-shadow-md"
        style={{ transformOrigin: "50% 88%" }}
        initial={{ rotate: -40 }}
        animate={{ rotate: [-62, -70, 14, 8, -62] }}
        transition={{
          duration: SWING_S,
          times: [0, 0.45, STRIKE_AT, 0.68, 1],
          ease: "linear",
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        <title>Pickaxe</title>
        <path d="M14 58 36 20" stroke="#5b3a1d" strokeWidth="7" />
        <path d="M14 58 36 20" stroke="#c18a47" strokeWidth="4" />
        <path
          d="M8 26C16 10 40 6 58 18c-8-3-14-2-20 2-4-4-14-6-30 6z"
          fill="#d7dbe0"
          stroke="#4b525c"
          strokeWidth="2.5"
        />
        <path
          d="M14 24c10-8 24-10 36-4"
          stroke="#fff"
          strokeWidth="2"
          opacity=".7"
        />
      </motion.svg>
    </span>
  );
}

/** Sparks (and rock chips) flying out of the middle of a cell. */
function Burst({
  sparks,
  chips,
  color,
}: {
  sparks: number;
  chips: number;
  color: string;
}) {
  const parts = useMemo(
    () =>
      Array.from({ length: sparks + chips }, (_, i) => {
        const spark = i < sparks;
        const a = spark
          ? Math.random() * Math.PI * 2
          : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 30 + Math.random() * 60;
        return {
          spark,
          dx: Math.cos(a) * sp * (spark ? 1.3 : 1),
          dy: Math.sin(a) * sp * (spark ? 1.3 : 1),
          rot: (a * 180) / Math.PI + 90,
          size: 3 + Math.random() * 5,
          len: 8 + Math.random() * 8,
          spin: Math.random() * 540,
        };
      }),
    [sparks, chips],
  );
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 size-0"
    >
      {parts.map((p, i) =>
        p.spark ? (
          <motion.i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, never reordered
            key={i}
            className="absolute block w-[2px] rounded-sm"
            style={{
              height: p.len,
              background: color,
              boxShadow: `0 0 6px ${color}`,
              rotate: p.rot,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scaleY: 1 }}
            animate={{ x: p.dx, y: p.dy, opacity: 0, scaleY: 0.3 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        ) : (
          <motion.i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, never reordered
            key={i}
            className="absolute block rounded-[2px] bg-[#8f7d66]"
            style={{ width: p.size, height: p.size }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: [0, p.dx, p.dx * 1.2],
              y: [0, p.dy - 20, p.dy + 60],
              opacity: [1, 1, 0],
              rotate: p.spin,
            }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        ),
      )}
    </span>
  );
}

/** Multiplier of the pick, big and green, floating up from the revealed cell. */
function MultPop({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2"
    >
      <motion.span
        className="block whitespace-nowrap font-display text-[26px] font-extrabold leading-none tracking-tight text-[color:var(--term-green)] [text-shadow:0_0_3px_rgba(255,255,255,.9),0_2px_8px_rgba(255,255,255,.8)] dark:[text-shadow:0_0_3px_rgba(0,0,0,.85),0_2px_8px_rgba(0,0,0,.8)] sm:text-[30px]"
        initial={{ opacity: 0, y: 10, scale: 0.4 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: [10, -6, -14, -48],
          scale: [0.4, 1.25, 1, 1],
        }}
        transition={{
          duration: 1.7,
          times: [0, 0.18, 0.6, 1],
          ease: "easeOut",
        }}
      >
        {text}
      </motion.span>
    </span>
  );
}

function CellContent({ cell }: { cell: Cell }) {
  if (cell.kind === "rock") {
    return <Mountain className="size-[56%] text-[color:var(--term-ink-mid)]" />;
  }
  if (cell.kind === "diamond") {
    return DIAMOND_IMG ? (
      <img
        src={DIAMOND_IMG}
        alt="Diamond"
        className="size-[72%] object-contain"
      />
    ) : (
      <Gem className={cn("size-[56%]", DIAMOND_TEXT)} />
    );
  }
  return (
    <img
      src={TOKENS[cell.token].logo}
      alt={cell.token}
      className="size-[62%] rounded-full object-contain"
    />
  );
}

function Sparkle() {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0.9, scale: 0.6 }}
      animate={{ opacity: 0, scale: 2.2 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="pointer-events-none absolute inset-0 rounded-lg border-2 border-[oklch(0.75_0.14_350)]"
    />
  );
}

/**
 * Number that rolls smoothly to its new value.
 * `scaled`: the roll lasts up to 5 s for small gains and gets faster as the
 * change grows. `tick`: plays a soft tick while the number moves.
 * `from`: value to start from on mount (default: the value itself).
 */
export function RollingNumber({
  value,
  className,
  scaled = false,
  tick = false,
  from,
  fixed2 = false,
  instant = false,
}: {
  value: number;
  className?: string;
  scaled?: boolean;
  tick?: boolean;
  from?: number;
  /** Always 2 decimals at rest too ("105.00"), not only while rolling. */
  fixed2?: boolean;
  /** Jump to the new value with no roll (used when the number goes down). */
  instant?: boolean;
}) {
  const mv = useMotionValue(from ?? value);
  const prev = useRef(from ?? value);
  const target = useRef(value);
  target.current = value;
  // Rolling: always 2 decimals, rounded down. At rest: exactly what fmtGoldao shows.
  const text = useTransform(mv, (v) => {
    if (Math.abs(v - target.current) < 0.005)
      return fixed2
        ? fmtFixed2Number(target.current)
        : fmtGoldaoNumber(target.current);
    const cents = Math.max(0, Math.floor(v * 100 + 1e-6));
    return `${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
  });
  useEffect(() => {
    const delta = Math.abs(value - prev.current);
    prev.current = value;
    if (instant) {
      mv.set(value);
      return;
    }
    const duration = scaled
      ? Math.min(5, Math.max(1.5, 5 * Math.sqrt(50 / Math.max(delta, 50))))
      : 0.7;
    const controls = animateValue(mv, value, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value, scaled, instant]);
  useEffect(() => {
    if (!tick) return;
    let lastStep = Math.round(mv.get());
    let lastAt = 0;
    return mv.on("change", (v) => {
      const step = Math.round(v);
      const now = performance.now();
      if (step === lastStep || now - lastAt < 60) return;
      lastStep = step;
      lastAt = now;
      playSound("count");
    });
  }, [mv, tick]);
  return <motion.span className={className}>{text}</motion.span>;
}

export function SaveButton({
  canSave,
  onSave,
  amount,
  className,
}: {
  canSave: boolean;
  onSave: () => void;
  amount?: string;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSave}
      disabled={!canSave}
      whileHover={canSave ? { y: -2 } : undefined}
      whileTap={canSave ? { scale: 0.94 } : undefined}
      animate={
        canSave
          ? {
              boxShadow: [
                "0 0 0 0 oklch(0.74 0.14 80 / 0.5)",
                "0 0 0 12px oklch(0.74 0.14 80 / 0)",
              ],
            }
          : { boxShadow: "0 0 0 0 oklch(0.74 0.14 80 / 0)" }
      }
      transition={
        canSave
          ? { boxShadow: { duration: 1.8, repeat: Number.POSITIVE_INFINITY } }
          : undefined
      }
      className={cn(
        "flex min-w-[9.5rem] flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 font-display text-base font-bold transition-opacity sm:flex-none",
        canSave
          ? "gradient-primary text-primary-foreground"
          : "cursor-not-allowed border border-[color:var(--term-border)] bg-[var(--term-alt)] text-[color:var(--term-ink-faint)]",
        className,
      )}
      aria-label="Save points"
    >
      <Shield className="size-4" />
      Save{canSave && amount ? ` ${amount}` : ""}
    </motion.button>
  );
}

export function StakeSelector({
  stakes,
  value,
  locked,
  paused,
  onChange,
}: {
  stakes: bigint[];
  value: 0 | 1 | 2;
  locked: boolean;
  paused: boolean;
  onChange: (v: 0 | 1 | 2) => void;
}) {
  if (paused || stakes.length !== 3) {
    return (
      <div className="rounded-md border border-[color:var(--term-border)] bg-[var(--term-alt)] px-3 py-2 font-mono text-xs text-[color:var(--term-ink-mid)]">
        Bets are paused
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex w-full rounded-[10px] border border-[color:var(--term-border)] p-[3px] transition-opacity",
        locked && "opacity-60",
      )}
    >
      {stakes.map((s, i) => (
        <button
          key={STAKE_LABELS[i]}
          type="button"
          disabled={locked}
          onClick={() => onChange(i as 0 | 1 | 2)}
          className={cn(
            "flex-1 rounded-md px-2 py-2.5 font-mono text-sm font-semibold transition-smooth disabled:cursor-not-allowed sm:text-base",
            value === i
              ? "gradient-primary text-primary-foreground"
              : cn(inkMid, "hover:text-[color:var(--term-ink)]"),
          )}
        >
          {STAKE_LABELS[i]} {fmtGoldao(s)}
        </button>
      ))}
    </div>
  );
}

/** Hint under the safe bar, based on the prize tiers (3 / 4-5 / 6+ picks). */
function pickHint(exc: ExcavationView | null, picks: number): string {
  if (!exc)
    return "Pick any cell to start. The first two picks are always safe.";
  if (picks < 2) return "Free pick: nothing at risk.";
  if (picks + 1 >= MAX_PICKS)
    return "Last pick: it is collected automatically.";
  if (!exc.canSave) return "First risky pick. Surviving it unlocks Save.";
  if (picks < 4) return "One more pick for Ingot.";
  if (picks < 6) return "Treasure is within reach.";
  return "Treasure. Every pick pays more.";
}

/** Tailwind `md` is 768px: below it the run card becomes a dock above the tab bar. */
function useBelowMd(): boolean {
  const supported =
    typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [below, setBelow] = useState(
    () => supported && window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    if (!supported) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setBelow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [supported]);
  return below;
}

export function PayoutStep({
  exc,
  className,
}: { exc: ExcavationView | null; className?: string }) {
  const picks = exc ? Number(exc.picks) : 0;
  const safe = exc ? Number(exc.safePctX100) / 100 : 100;
  const tone =
    safe > 75
      ? {
          text: "text-[color:var(--term-green)]",
          fill: "bg-gradient-to-r from-[oklch(0.6_0.13_160)] to-[color:var(--term-green)] shadow-[0_0_12px_oklch(0.7_0.15_155/0.45)]",
        }
      : safe > 60
        ? {
            text: "text-primary",
            fill: "bg-gradient-to-r from-[oklch(0.6_0.12_65)] to-primary shadow-[0_0_12px_oklch(0.71_0.122_83/0.4)]",
          }
        : {
            text: "text-destructive",
            fill: "bg-gradient-to-r from-[oklch(0.55_0.18_25)] to-destructive shadow-[0_0_12px_oklch(0.65_0.19_22/0.45)]",
          };
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 sm:px-4 md:py-3",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={picks}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 340, damping: 24 }}
          className="flex flex-col gap-1.5 md:gap-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn(eyebrow, gold)}>Next pick {picks + 1}</span>
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display text-xl font-bold leading-none tabular-nums md:text-[26px]",
                  tone.text,
                )}
              >
                {safe}%
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
                  inkMid,
                )}
              >
                Safe
              </span>
            </span>
          </div>
          {/* The track is the risk share (soft red), the fill is the safe share. */}
          <div className="h-2 overflow-hidden rounded-full bg-destructive/20 ring-1 ring-inset ring-white/5 md:h-2.5">
            <div
              className={cn(
                "relative h-full rounded-full transition-all duration-500",
                tone.fill,
              )}
              style={{ width: `${safe}%` }}
            >
              <span className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/20" />
            </div>
          </div>
          <span className={cn("hidden font-mono text-[11px] md:block", inkMid)}>
            {pickHint(exc, picks)}
          </span>
        </motion.div>
      </AnimatePresence>
      <motion.span
        key={`sweep-${picks}`}
        aria-hidden
        initial={{ x: "-120%" }}
        animate={{ x: "220%" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
    </div>
  );
}

/** One thin segment per pick (MAX_PICKS in total). */
function PickProgress({
  picks,
  className,
}: { picks: number; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${Math.min(picks, MAX_PICKS)} of ${MAX_PICKS} picks`}
      className={cn("flex flex-1 gap-[3px]", className)}
    >
      {Array.from({ length: MAX_PICKS }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of segments
          key={i}
          className={cn(
            "h-1 flex-1 rounded-sm transition-colors duration-300",
            i < picks ? "gradient-primary" : "bg-[color:var(--term-border)]",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Prize now, multiplier, what the next pick could add and the Save button.
 * From md up it is a card under the board; below md it is a dock that stays
 * above the mobile tab bar while the page scrolls.
 */
export function RunCard({
  exc,
  canSave,
  onSave,
  className,
}: {
  exc: ExcavationView | null;
  canSave: boolean;
  onSave: () => void;
  className?: string;
}) {
  const compact = useBelowMd();
  const picks = exc ? Number(exc.picks) : 0;
  const active = !!exc?.canSave;
  // Prizes include the stake, like the multiplier: 1.05x on 1,000 is 1,050.
  const prize = exc && active ? exc.runGross : 0n;
  const next = exc && exc.nextGross > 0n ? exc.nextGross : null;
  const lastPick = !!exc && picks + 1 >= MAX_PICKS;
  const mult = exc && active ? fmtMultOf(exc.runGross, exc.stake) : "0.00x";

  const prizeNumber = (
    <span
      className={cn(
        "font-display font-bold leading-none tabular-nums transition-colors",
        compact ? "text-[38px]" : "text-[64px]",
        prize > 0n ? "text-[color:var(--term-green)]" : ink,
      )}
    >
      <RollingNumber value={toGoldao(prize)} scaled tick fixed2 />
    </span>
  );

  if (compact) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2.5 border-t border-[color:var(--term-border)] bg-background px-3.5 pb-3 pt-3 shadow-[0_-10px_24px_rgba(0,0,0,0.35)]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className={cn(eyebrow, "text-[10px]", inkFaint)}>
              Prize now
            </span>
            {prizeNumber}
          </div>
          <SaveButton
            canSave={canSave}
            onSave={onSave}
            amount={exc ? fmtGoldao(exc.runGross) : undefined}
            className="max-w-[12rem] px-4 py-2.5"
          />
        </div>
        <div
          className={cn(
            "flex items-center gap-2.5 font-mono text-[11px]",
            inkMid,
          )}
        >
          {active && (
            <motion.span
              key={picks}
              initial={{ scale: 1.18 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="text-gradient-gold origin-left font-display text-lg font-bold leading-none tabular-nums"
            >
              {mult}
            </motion.span>
          )}
          <PickProgress picks={picks} className="min-w-[4.5rem]" />
          <span className="whitespace-nowrap">
            {next !== null ? (
              <>
                You could win{" "}
                <b className="font-semibold text-[color:var(--term-green)]">
                  {fmtGoldao2(next)}
                </b>
              </>
            ) : exc ? (
              "Maximum reached"
            ) : (
              "Save unlocks at pick 3"
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-[color:var(--term-border)] bg-[var(--term-alt)] p-4",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cn(eyebrow, "text-[10px]", inkFaint)}>
            Prize now
          </span>
          {prizeNumber}
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1">
          <span className={cn(eyebrow, "text-[10px]", inkFaint)}>
            Multiplier
          </span>
          <motion.span
            key={picks}
            initial={{ scale: 1.18 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 14 }}
            className={cn(
              "origin-right font-display text-[34px] font-bold leading-none tabular-nums",
              active ? "text-gradient-gold" : inkFaint,
            )}
          >
            {mult}
          </motion.span>
        </div>
      </div>
      <div
        className={cn(
          "flex items-center gap-2.5 font-mono text-[11px]",
          inkFaint,
        )}
      >
        <PickProgress picks={picks} />
        <span>
          {picks}/{MAX_PICKS}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2.5">
        {next !== null ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cn(eyebrow, "text-[10px]", gold)}>
              You could win
            </span>
            <motion.span
              key={`next-${picks}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-[30px] font-bold leading-none tabular-nums text-[color:var(--term-green)]"
            >
              {fmtGoldao2(next)}
            </motion.span>
            {lastPick && (
              <span className={cn("font-mono text-[10px]", inkMid)}>
                Last pick, collected automatically
              </span>
            )}
          </div>
        ) : (
          <span className={cn("font-mono text-xs", inkMid)}>
            {exc ? "Maximum reached" : "Save unlocks at pick 3"}
          </span>
        )}
        <SaveButton
          canSave={canSave}
          onSave={onSave}
          amount={exc ? fmtGoldao(exc.runGross) : undefined}
        />
      </div>
    </div>
  );
}

/** Medal look per tier: 1 gold, 2 silver, 3 bronze, 4 neutral (ranks 4 to 10 and outside). */
const MEDAL: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-[linear-gradient(145deg,#f3d58f,#d9a93f)] text-[#54360b] dark:bg-[linear-gradient(145deg,#e8c370,#a88130)] dark:text-[#2b1d06]",
  2: "bg-[linear-gradient(145deg,#f0f2f4,#b3bac2)] text-[#3b434b] dark:bg-[linear-gradient(145deg,#dde1e5,#868d96)] dark:text-[#1f2329]",
  3: "bg-[linear-gradient(145deg,#ecbc92,#bd7f4b)] text-[#4a2a10] dark:bg-[linear-gradient(145deg,#d9a273,#8f5b31)] dark:text-[#2a1608]",
  4: "bg-[linear-gradient(145deg,#ead8ca,#cbb2a0)] text-[#5c4f47] dark:bg-[linear-gradient(145deg,#505050,#3d3d3c)] dark:text-[#e6d9c3]",
};
const HEX_CLIP = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const LABEL = "text-[#7a6a60] dark:text-[#9b9a94]";
const NUM = "text-[#2a2520] dark:text-[#f0e6d6]";
const GOLD = "text-[#b08a2e] dark:text-[#c9a03c]";
const FOOT = "text-[#8a7a70] dark:text-[#8f8e88]";
const GREEN_RANK = "text-[#2d8a5e] dark:text-[#36c58a]";

/** Hex badge with the player's place in the volume ranking and what the Top 10 would pay now. */
function RankPanel({ dashboard }: { dashboard: Dashboard | undefined }) {
  const rank = dashboard ? Number(dashboard.top10Rank) : 0;
  const inTop = rank >= 1 && rank <= 10;
  const tier = (rank >= 1 && rank <= 3 ? rank : 4) as 1 | 2 | 3 | 4;
  const prize = dashboard && inTop ? dashboard.top10Prize : 0n;
  let gap = "";
  if (dashboard && rank > 10) gap = `${rank - 10} spots to Top 10`;
  else if (dashboard && rank === 0)
    gap = `Stake ${fmtGoldao(dashboard.top10Entry)} to enter`;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-4 rounded-[14px] border border-[rgba(92,79,71,.18)] bg-white/20 px-3.5 pb-3.5 pt-3 dark:border-white/[.07] dark:bg-black/[.18]">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-[.26em]",
            LABEL,
          )}
        >
          Your rank
        </span>
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label="Top 10 pool info"
            className={cn(
              "inline-flex size-[18px] cursor-help items-center justify-center rounded-full border border-[rgba(92,79,71,.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b08a2e] dark:border-white/[.07]",
              LABEL,
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[11px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <title>Info</title>
              <path d="M12 11v6" />
              <path d="M12 7h.01" />
            </svg>
          </button>
          <span
            className={cn(
              "pointer-events-none absolute -right-1 bottom-[calc(100%+8px)] z-10 translate-y-[3px] whitespace-nowrap rounded-[10px] border border-[rgba(201,160,60,.65)] bg-[#f1e1d6] px-2.5 py-[7px] text-[11px] opacity-0 shadow-[0_14px_34px_rgba(92,60,40,.18)] transition group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 dark:border-[rgba(174,137,58,.5)] dark:bg-[#232423] dark:shadow-[0_14px_34px_rgba(0,0,0,.45)]",
              NUM,
            )}
          >
            Top 10 pool{" "}
            <b className={GOLD}>
              {dashboard ? fmtGoldao(dashboard.top10Pool) : "-"} GOLDAO
            </b>
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-left">
        <div
          className={cn(
            "flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center gap-px",
            MEDAL[tier],
          )}
          style={{ clipPath: HEX_CLIP }}
        >
          {inTop ? (
            <svg
              viewBox="0 0 24 24"
              className="size-3"
              fill="currentColor"
              aria-hidden
            >
              <title>Rank</title>
              {rank <= 3 ? (
                <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
              ) : (
                <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
              )}
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="size-3 opacity-80"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <title>Rank</title>
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          )}
          <span
            className="font-display font-extrabold leading-none tracking-[-.02em]"
            style={{
              fontSize: inTop ? 18 : String(rank).length >= 3 ? 13 : 16,
            }}
          >
            {rank > 0 ? `#${rank}` : "-"}
          </span>
        </div>
        <div>
          <div
            className={cn(
              "font-display text-[26px] font-extrabold leading-none tracking-[-.01em]",
              inTop && prize > 0n ? GREEN_RANK : FOOT,
            )}
          >
            +{fmtGoldao2(prize)}
          </div>
          <div className={cn("mt-1 text-[11px]", FOOT)}>
            GOLDAO if it closed now
          </div>
          {gap && (
            <div
              className={cn(
                "mt-1 text-[11px] font-bold tracking-[.02em]",
                GOLD,
              )}
            >
              {gap}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreditBar({
  dashboard,
  className,
}: { dashboard: Dashboard | undefined; className?: string }) {
  // The stake of an excavation in play is already out of the Accumulated prize on screen.
  const { inPlay } = useBoard();
  const shown = dashboard
    ? dashboard.credit > inPlay
      ? dashboard.credit - inPlay
      : 0n
    : 0n;
  const credit = toGoldao(shown);
  // Last value that was really on screen (null until the dashboard has loaded).
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  const loaded = !!dashboard;
  useEffect(() => {
    if (!loaded) return;
    const before = prev.current;
    prev.current = credit;
    // Green only when the Accumulated prize really goes up. It never turns red, and a value
    // that does not change (a refetch) does nothing.
    if (before === null || credit <= before) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(t);
  }, [credit, loaded]);

  // Card width decides the layout (side by side from 520px) and how big the number can be.
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ wrap: 0, left: 0 });
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const left = leftRef.current;
    if (!wrap || !left) return;
    const measure = () =>
      setBox({ wrap: wrap.clientWidth, left: left.clientWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(left);
    return () => ro.disconnect();
  }, []);
  const narrow = box.wrap > 0 && box.wrap < 520;
  let em = 0;
  for (const ch of fmtGoldao2(shown))
    em += ch === "," || ch === "." ? 0.32 : 0.64;
  const wanted = box.wrap * (narrow ? 0.135 : 0.08);
  const room = box.left > 0 ? box.left / em : wanted;
  const size =
    box.wrap > 0
      ? Math.max(20, Math.min(narrow ? 40 : 48, wanted, Math.floor(room)))
      : 40;

  return (
    <div ref={wrapRef} className={cn("flex min-w-0 flex-col", className)}>
      <div
        className={cn(
          "grid flex-1 items-stretch gap-[22px] rounded-[18px] border border-[rgba(201,160,60,.65)] bg-[#e2cabc] px-[22px] pb-5 pt-[22px] shadow-[0_14px_34px_rgba(92,60,40,.18)] dark:border-[rgba(174,137,58,.5)] dark:bg-[#343433] dark:shadow-[0_14px_34px_rgba(0,0,0,.45)]",
          narrow ? "grid-cols-1 gap-4" : "grid-cols-[minmax(0,1fr)_230px]",
        )}
      >
        <div
          ref={leftRef}
          className={cn(
            "flex min-w-0 flex-col justify-between",
            narrow && "gap-1",
          )}
        >
          <div>
            <div
              className={cn(
                "text-[11px] font-bold uppercase tracking-[.26em]",
                LABEL,
              )}
            >
              Accumulated prize
            </div>
            <div
              className={cn(
                "flex flex-wrap items-baseline gap-x-2.5 gap-y-1",
                narrow ? "my-2.5 mb-3" : "mb-3.5 mt-3.5",
              )}
            >
              <span
                className={cn(
                  "whitespace-nowrap font-display font-extrabold leading-none tracking-[-.02em] tabular-nums transition-colors duration-1000",
                  flash ? GREEN_RANK : NUM,
                )}
                style={{ fontSize: size }}
              >
                <RollingNumber
                  value={credit}
                  scaled={prev.current !== null}
                  tick={prev.current !== null}
                  instant={prev.current !== null && credit < prev.current}
                  fixed2
                />
              </span>
              <span
                className={cn("text-[11px] font-bold tracking-[.12em]", GOLD)}
              >
                GOLDAO
              </span>
            </div>
          </div>
          <div className={cn("text-[11.5px]", FOOT)}>
            Paid when the tournament closes
            {dashboard ? ` · ${fmtCountdown(dashboard.endsAt)}` : ""}
          </div>
        </div>
        <RankPanel dashboard={dashboard} />
      </div>
    </div>
  );
}

/** One diamond with a subtle glint sweeping across it, clipped to the diamond silhouette. */
function ShinyDiamond({
  className,
  rotate,
  lift,
  delay,
  z,
}: {
  className?: string;
  rotate: number;
  lift: number;
  delay: number;
  z: number;
}) {
  const mask = `url(${DIAMOND_IMG})`;
  return (
    <span
      className={cn("relative block shrink-0", className)}
      style={{
        transform: `rotate(${rotate}deg) translateY(${lift}px)`,
        zIndex: z,
      }}
    >
      <img
        src={DIAMOND_IMG ?? ""}
        alt=""
        className="block w-full object-contain drop-shadow-[0_6px_14px_oklch(0.7_0.14_350/0.4)]"
      />
      <span
        className="diamond-shine"
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          animationDelay: `${delay}s`,
        }}
      />
    </span>
  );
}

/**
 * Fixed-width column so the 3-diamond and 2-diamond clusters share the same vertical axis.
 * Sizes follow the card width (container queries), not the screen, and it hides below ~260px.
 */
function DiamondColumn({ count }: { count: 2 | 3 }) {
  if (!DIAMOND_IMG) return null;
  const three = count === 3;
  const rot = three ? [-14, 0, 14] : [-9, 9];
  const lift = three ? [6, 0, 6] : [2, 2];
  return (
    <div
      aria-hidden
      className="hidden w-[60px] shrink-0 items-end justify-center @[260px]:flex @[340px]:w-[76px] @[380px]:w-[88px] @[480px]:w-[108px]"
    >
      {rot.map((r, i) => (
        <ShinyDiamond
          // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
          key={i}
          rotate={r}
          lift={lift[i]}
          delay={(three ? 0 : 1.6) + i * 0.5}
          z={three && i === 1 ? 2 : 1}
          className={cn(
            three
              ? "w-6 @[340px]:w-8 @[380px]:w-9 @[480px]:w-11"
              : "w-4 @[340px]:w-5 @[380px]:w-6 @[480px]:w-[30px]",
            i > 0 &&
              (three
                ? "-ml-1.5 @[340px]:-ml-2 @[380px]:-ml-2.5 @[480px]:-ml-3"
                : "-ml-1 @[380px]:-ml-1.5 @[480px]:-ml-2"),
          )}
        />
      ))}
    </div>
  );
}

export function JackpotCard({
  pool,
  miniBps,
  className,
}: {
  pool: bigint | undefined;
  /** Share of the pool that two diamonds win, in basis points. */
  miniBps?: number;
  className?: string;
}) {
  // Display only: the backend computes the real prize when the pick happens.
  const mini =
    pool !== undefined && miniBps !== undefined
      ? miniPrizeOf(pool, miniBps)
      : 0n;
  return (
    <div
      className={cn(
        "@container flex min-w-0 flex-col overflow-hidden rounded-xl border border-[oklch(0.68_0.16_350/0.45)] bg-[oklch(0.7_0.14_350/0.08)]",
        className,
      )}
    >
      <div className="flex flex-1 items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              eyebrow,
              DIAMOND_TEXT,
              "flex items-center gap-1.5 text-[10px] sm:text-xs",
            )}
          >
            <Gem className="size-3.5" /> Diamond jackpot
          </span>
          <span
            className={cn(
              "font-display text-[30px] font-bold leading-[1.05] tabular-nums @[380px]:text-[36px] @[480px]:text-[44px] @[540px]:text-[52px]",
              DIAMOND_TEXT,
            )}
          >
            <RollingNumber value={pool ? toGoldao(pool) : 0} />
            <span className={cn("ml-2 font-mono text-xs", inkFaint)}>
              GOLDAO
            </span>
          </span>
        </div>
        <DiamondColumn count={3} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-dashed border-[oklch(0.68_0.16_350/0.45)] bg-[oklch(0.7_0.14_350/0.05)] px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              eyebrow,
              DIAMOND_TEXT,
              "flex items-center gap-1.5 text-[10px]",
            )}
          >
            <Gem className="size-3" /> Mini Diamond jackpot
          </span>
          <span
            className={cn(
              "font-display text-[22px] font-bold leading-[1.05] tabular-nums @[380px]:text-[24px] @[480px]:text-[28px]",
              DIAMOND_TEXT,
            )}
          >
            <RollingNumber value={toGoldao(mini)} />
            <span className={cn("ml-2 font-mono text-xs", inkFaint)}>
              GOLDAO
            </span>
          </span>
        </div>
        <DiamondColumn count={2} />
      </div>
    </div>
  );
}

const PINK = "text-[#d6336c] dark:text-[#ff7ab8]";
const GREEN = "text-[color:var(--term-green)]";

/**
 * Big number that shrinks so it always fits the card (hundreds or thousands of
 * GOLDAO). Width is estimated from the final text, so it does not jump while rolling.
 */
function FitNumber({
  value,
  className,
  plus,
}: { value: bigint; className?: string; plus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const text = (plus ? "+" : "") + fmtGoldao2(value);
  // Digits are about 0.64em wide in the display font, "," and "." about 0.32em.
  let em = 0;
  for (const ch of text) em += ch === "," || ch === "." ? 0.32 : 0.64;
  const MAX = 74;
  const MIN = 22;
  const fit = width > 0 ? Math.floor(width / em) : MAX;
  const size = Math.max(MIN, Math.min(MAX, fit));
  return (
    <div ref={ref} className="w-full">
      <span
        className={cn(
          "block whitespace-nowrap font-display font-bold leading-none tabular-nums",
          className,
        )}
        style={{ fontSize: size }}
      >
        {plus && "+"}
        <RollingNumber value={toGoldao(value)} from={0} scaled tick fixed2 />
      </span>
    </div>
  );
}

/**
 * End of the excavation, shown over the board. Prize: pill + number + profit.
 * Collapse: label + number + how much of the stake was rescued. With a jackpot
 * (also after a collapse) the title is DIAMOND JACKPOT (MINI JACKPOT when the excavation only
 * found a mini jackpot) and prize + jackpot are added. Nothing here is ever red.
 */
export function ResultCard({
  result,
  mini = false,
  onNew,
}: { result: EndResult; mini?: boolean; onNew: () => void }) {
  const collapsed = result.kind === EndKind.collapsed;
  const jackpot = result.jackpotWon > 0n;
  const prize = prizeName(Number(result.picks));
  const PrizeIcon = prize.icon;
  const total = result.gross + (jackpot ? result.jackpotWon : 0n);
  const stake = result.stake;
  const gain = total > stake && stake > 0n;
  const pct = gain ? fmtPct1(total - stake, stake) : null;
  // Rescue bar of a collapse without jackpot: part of the stake that came back.
  const rescued = stake > 0n ? Number((result.gross * 1000n) / stake) / 10 : 0;
  const numberColor = jackpot ? PINK : GREEN;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/50 p-3 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ scale: 0.92, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className="flex w-full max-w-[400px] flex-col items-center gap-2.5 rounded-2xl border border-[color:var(--term-border)] bg-[oklch(var(--background)/0.96)] px-4 py-5 text-center shadow-2xl"
      >
        {jackpot ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#d6336c] px-4 py-1.5 font-display text-[clamp(16px,4.4vw,24px)] font-bold uppercase leading-none tracking-wider text-white dark:bg-[#b8337a] dark:text-[#fff5fa]">
            <Gem className="size-[1em]" />
            {mini ? "Mini jackpot" : "Diamond jackpot"}
          </span>
        ) : collapsed ? (
          <span className={cn(eyebrow, gold)}>Collapse · GOLDAO secured</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-display text-[clamp(20px,5vw,30px)] font-bold uppercase leading-none tracking-wider",
              prize.pill,
            )}
          >
            <PrizeIcon className="size-[1em]" />
            {prize.name}
          </span>
        )}
        {collapsed && (
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Collapsed on pick {Number(result.picks) + 1}
          </span>
        )}
        <FitNumber value={total} className={numberColor} plus={total > 0n} />
        {jackpot ? (
          <>
            {pct !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-[#d6336c]/40 bg-[#d6336c]/10 px-3 py-1 font-mono text-xs font-bold dark:border-[#ff7ab8]/40 dark:bg-[#ff7ab8]/10",
                  PINK,
                )}
              >
                <ArrowUp className="size-3" />+{pct}% profit
              </span>
            )}
            <span className={cn("font-mono text-[11px] font-bold", PINK)}>
              {fmtGoldao2(result.gross)} {collapsed ? "secured" : "prize"} +{" "}
              {fmtGoldao2(result.jackpotWon)} jackpot
            </span>
          </>
        ) : collapsed ? (
          <div className="flex w-full flex-col gap-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--term-border)]">
              <div
                className="h-full rounded-full bg-[color:var(--term-green)]"
                style={{ width: `${Math.max(0, Math.min(100, rescued))}%` }}
              />
            </div>
            <div
              className={cn(
                "flex justify-between font-mono text-[10.5px]",
                inkFaint,
              )}
            >
              <span>
                {Math.floor(rescued).toLocaleString("en-US")}% rescued
              </span>
              <span>of {fmtGoldao2(stake)}</span>
            </div>
          </div>
        ) : (
          pct !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-[color:var(--term-green)]/40 bg-[color:var(--term-green)]/10 px-3 py-1 font-mono text-xs font-bold",
                GREEN,
              )}
            >
              <ArrowUp className="size-3" />+{pct}% profit
            </span>
          )
        )}
        <button
          type="button"
          onClick={onNew}
          className="mt-1 flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 px-4 py-1.5 font-mono text-xs font-medium text-[color:var(--term-gold)] transition-colors hover:bg-primary/20"
        >
          <RotateCcw className="size-3.5" />
          New excavation
        </button>
      </motion.div>
    </motion.div>
  );
}

export function Legend() {
  const items: { label: string; node: React.ReactNode }[] = [
    ...(["GOLDAO", "OGY", "ICP", "GLDT"] as TokenKey[]).map((t) => ({
      label: t,
      node: <img src={TOKENS[t].logo} alt="" className="size-4 rounded-full" />,
    })),
    {
      label: "Diamond",
      node: DIAMOND_IMG ? (
        <img src={DIAMOND_IMG} alt="" className="size-4" />
      ) : (
        <Gem className={cn("size-3.5", DIAMOND_TEXT)} />
      ),
    },
    {
      label: "Collapse",
      node: <Mountain className="size-3.5 text-[color:var(--term-ink-mid)]" />,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((it) => (
        <span
          key={it.label}
          className={cn(
            "flex items-center gap-1.5 font-mono text-[11px]",
            inkMid,
          )}
        >
          {it.node}
          {it.label}
        </span>
      ))}
      <span className={cn("font-mono text-[11px]", inkFaint)}>
        Tokens are decoration: only depth and diamonds matter.
      </span>
    </div>
  );
}

export function BoardMessage({
  text,
  tone,
  icon,
  className,
}: {
  text: string;
  tone: "gold" | "rock" | "mid" | "err";
  icon?: "shield" | "rock";
  className?: string;
}) {
  const color = {
    gold: "text-[color:var(--term-gold)]",
    rock: "text-[color:var(--term-ink-mid)]",
    mid: "text-[color:var(--term-ink-faint)]",
    err: "text-destructive",
  }[tone];
  return (
    <div className={cn("flex min-h-8 items-center justify-center", className)}>
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className={cn("flex items-center gap-1.5 font-mono text-xs", color)}
        >
          {icon === "rock" && <Mountain className="size-3.5" />}
          {icon === "shield" && <ShieldCheck className="size-3.5" />}
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function AutoPicker({
  value,
  disabled,
  busy,
  onChange,
  onRun,
}: {
  value: number;
  disabled: boolean;
  busy: boolean;
  onChange: (n: number) => void;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-0.5">
      <span className={cn(eyebrow, gold)}>Auto dig</span>
      <span className={cn("font-mono text-xs", inkMid)}>Save at pick</span>
      <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5 font-mono text-xs">
        {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "rounded px-1.5 py-1 transition-smooth disabled:opacity-60",
              value === n ? "bg-primary text-primary-foreground" : inkMid,
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRun}
        className="min-w-24 flex-1 rounded-md border border-[color:var(--term-border)] px-3 py-2 font-display text-sm transition-colors hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Digging…" : "Auto dig"}
      </button>
    </div>
  );
}

export type { GameConfig };
