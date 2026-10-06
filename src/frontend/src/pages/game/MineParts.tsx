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
  Pickaxe,
  RotateCcw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  panel,
  prizeName,
  toGoldao,
} from "./game-utils";
import { playSound } from "./sounds";

export function MineCell({
  cell,
  digging,
  disabled,
  onClick,
}: {
  cell: Cell | undefined;
  digging: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const style = !cell
    ? "border-[color:var(--term-border)] bg-[var(--term-header)] hover:border-primary/60"
    : cell.kind === "rock"
      ? ROCK_CELL
      : cell.kind === "diamond"
        ? DIAMOND_CELL
        : TOKENS[cell.token].cell;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || !!cell}
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border transition-[transform,colors] duration-200 disabled:cursor-default enabled:hover:-translate-y-[3px] enabled:active:scale-95",
        style,
      )}
      aria-label={cell ? cell.kind : "Dig this cell"}
    >
      {digging && !cell && (
        <motion.span
          animate={{ rotate: [-28, 18, -28] }}
          transition={{
            duration: 0.45,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className={gold}
        >
          <Pickaxe className="size-6" />
        </motion.span>
      )}
      <AnimatePresence>
        {cell && (
          <motion.span
            key={cell.kind}
            initial={{ opacity: 0, scale: 0.4, rotateY: 90 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
            className="flex items-center justify-center"
          >
            <CellContent cell={cell} />
          </motion.span>
        )}
      </AnimatePresence>
      {cell?.kind === "diamond" && <Sparkle />}
    </motion.button>
  );
}

function CellContent({ cell }: { cell: Cell }) {
  if (cell.kind === "rock") {
    return <Mountain className="size-7 text-[color:var(--term-ink-mid)]" />;
  }
  if (cell.kind === "diamond") {
    return DIAMOND_IMG ? (
      <img src={DIAMOND_IMG} alt="Diamond" className="size-9 object-contain" />
    ) : (
      <Gem className={cn("size-7", DIAMOND_TEXT)} />
    );
  }
  return (
    <img
      src={TOKENS[cell.token].logo}
      alt={cell.token}
      className="size-8 rounded-full object-contain sm:size-9"
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
}: {
  value: number;
  className?: string;
  scaled?: boolean;
  tick?: boolean;
  from?: number;
  /** Always 2 decimals at rest too ("105.00"), not only while rolling. */
  fixed2?: boolean;
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
    const duration = scaled
      ? Math.min(5, Math.max(1.5, 5 * Math.sqrt(50 / Math.max(delta, 50))))
      : 0.7;
    const controls = animateValue(mv, value, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value, scaled]);
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
}: { canSave: boolean; onSave: () => void; amount?: string }) {
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

export function PayoutStep({ exc }: { exc: ExcavationView | null }) {
  const picks = exc ? Number(exc.picks) : 0;
  const safe = exc ? Number(exc.safePctX100) / 100 : 100;
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/50 bg-primary/10 px-3 py-2.5 sm:px-4">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={picks}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 340, damping: 24 }}
          className="flex flex-col gap-1.5"
        >
          <span className={cn(eyebrow, gold)}>Next pick {picks + 1}</span>
          <div
            className={cn("flex justify-between font-mono text-[11px]", inkMid)}
          >
            <span>Safe</span>
            <span>{safe}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--term-border)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                safe > 75
                  ? "bg-[color:var(--term-green)]"
                  : safe > 60
                    ? "bg-primary"
                    : "bg-destructive",
              )}
              style={{ width: `${safe}%` }}
            />
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

/**
 * Winning now, multiplier, what the next pick could add and the Save button,
 * all in one card.
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
  const picks = exc ? Number(exc.picks) : 0;
  const active = !!exc?.canSave;
  // Prizes include the stake, like the multiplier: 1.05x on 1,000 is 1,050.
  const prize = exc && active ? exc.runGross : 0n;
  const next = exc && exc.nextGross > 0n ? exc.nextGross : null;
  const lastPick = !!exc && picks + 1 >= MAX_PICKS;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-[color:var(--term-border)] bg-[var(--term-alt)] p-3 sm:p-4",
        className,
      )}
    >
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn(eyebrow, "text-[10px]", inkFaint)}>
            Prize now
          </span>
          <span
            className={cn(
              "font-display text-[28px] font-bold leading-none tabular-nums transition-colors sm:text-[40px]",
              prize > 0n ? "text-[color:var(--term-green)]" : ink,
            )}
          >
            <RollingNumber value={toGoldao(prize)} scaled tick fixed2 />
          </span>
          <span className="min-h-3.5 font-mono text-[10px] text-destructive">
            {exc && active
              ? `If it collapses you get ${fmtGoldao(exc.collapseGross)}`
              : "No risk on the first 2 picks"}
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className={cn(eyebrow, "text-[10px]", inkFaint)}>
            Multiplier
          </span>
          <motion.span
            key={picks}
            initial={{ scale: 1.18 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 14 }}
            className="text-gradient-gold origin-left font-display text-[32px] font-bold leading-none tabular-nums sm:text-[44px]"
          >
            {exc && active ? fmtMultOf(exc.runGross, exc.stake) : "0.00x"}
          </motion.span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--term-border)]">
            <motion.div
              className="gradient-primary h-full rounded-full"
              animate={{ width: `${Math.min(100, picks * 10)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn(eyebrow, "text-[10px]", gold)}>
            You could win
          </span>
          <motion.span
            key={`next-${picks}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-[26px] font-bold leading-none tabular-nums text-[color:var(--term-green)] sm:text-[32px]"
          >
            {next !== null ? fmtGoldao2(next) : "-"}
          </motion.span>
          <span className={cn("font-mono text-[10px]", inkMid)}>
            {exc && next !== null
              ? `${lastPick ? "Last pick, collected automatically" : "If the next pick is safe"} · ${fmtMultOf(exc.nextGross, exc.stake)}`
              : exc
                ? "Maximum reached"
                : "Saving unlocks at pick 3"}
          </span>
        </div>
        <SaveButton
          canSave={canSave}
          onSave={onSave}
          amount={exc ? fmtGoldao(exc.runGross) : undefined}
        />
      </div>
    </div>
  );
}

/** The player's place in the weekly volume ranking and the extra prize it would pay now. */
function TopRank({ dashboard }: { dashboard: Dashboard | undefined }) {
  if (!dashboard) return null;
  const rank = Number(dashboard.top10Rank);
  const staked = dashboard.stats.staked;
  const need =
    dashboard.top10Entry > staked ? dashboard.top10Entry - staked : 0n;
  const inTop = rank >= 1 && rank <= 10 && dashboard.top10Prize > 0n;
  let text: string;
  if (inTop) {
    text = `Top 10 #${rank} · +${fmtGoldao(dashboard.top10Prize)} if it closed now`;
  } else if (rank === 0) {
    text = `Top 10 · stake ${fmtGoldao(dashboard.top10Entry)} to qualify`;
  } else {
    text = `Rank #${rank} · ${fmtGoldao(need > 0n ? need : 1n)}+ more volume to reach the Top 10`;
  }
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] leading-snug",
        inTop
          ? "border-[color:var(--term-green)]/50 bg-[color:var(--term-green)]/10 text-[color:var(--term-green)]"
          : "border-[color:var(--term-border)]",
        inTop ? "" : inkMid,
      )}
    >
      <span>{text}</span>
      <span className={inTop ? "opacity-80" : inkFaint}>
        Top 10 pool {fmtGoldao(dashboard.top10Pool)} GOLDAO
      </span>
    </div>
  );
}

export function CreditBar({
  dashboard,
  className,
}: { dashboard: Dashboard | undefined; className?: string }) {
  // The stake of an excavation in play is already out of To collect on screen.
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
    // Green only when To collect really goes up. It never turns red, and a value
    // that does not change (a refetch) does nothing.
    if (before === null || credit <= before) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(t);
  }, [credit, loaded]);
  return (
    <div
      className={cn(
        panel,
        "flex min-w-0 flex-col justify-between gap-2 border-primary/50 bg-[var(--term-alt)] p-3 sm:p-6",
        className,
      )}
    >
      <span className={cn(eyebrow, inkFaint)}>To collect</span>
      <span
        className={cn(
          "flex flex-wrap items-baseline gap-x-3 font-display text-[34px] font-bold leading-none tabular-nums transition-colors duration-1000 md:text-[clamp(48px,6vw,84px)]",
          flash ? "text-[color:var(--term-green)]" : ink,
        )}
      >
        <RollingNumber
          value={credit}
          scaled={prev.current !== null}
          tick={prev.current !== null}
        />
        <span className={cn("font-mono text-xs font-semibold", gold)}>
          GOLDAO
        </span>
      </span>
      <TopRank dashboard={dashboard} />
      <span className={cn("font-mono text-[11px]", inkFaint)}>
        Paid when the tournament closes
        {dashboard ? ` · ${fmtCountdown(dashboard.endsAt)}` : ""}
      </span>
    </div>
  );
}

export function JackpotCard({
  pool,
  className,
}: { pool: bigint | undefined; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-xl border border-[oklch(0.68_0.16_350/0.45)] bg-[oklch(0.7_0.14_350/0.08)] px-3 py-2.5 sm:px-4",
        className,
      )}
    >
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
          "font-display text-[30px] font-bold leading-tight tabular-nums sm:text-[clamp(34px,5vw,46px)]",
          DIAMOND_TEXT,
        )}
      >
        <RollingNumber value={pool ? toGoldao(pool) : 0} />
        <span className={cn("ml-2 font-mono text-xs", inkFaint)}>GOLDAO</span>
      </span>
      <span className={cn("font-mono text-[11px]", inkMid)}>
        3 diamonds win it all
      </span>
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
}: { value: bigint; className?: string }) {
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
  const text = fmtGoldao2(value);
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
        <RollingNumber value={toGoldao(value)} from={0} scaled tick fixed2 />
      </span>
    </div>
  );
}

/**
 * End of the excavation, shown over the board. Prize: pill + number + profit.
 * Collapse: label + number + how much of the stake was rescued. With a jackpot
 * (also after a collapse) the title is DIAMOND JACKPOT and prize + jackpot are added.
 * Nothing here is ever red.
 */
export function ResultCard({
  result,
  onNew,
}: { result: EndResult; onNew: () => void }) {
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
            Diamond jackpot
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
        <FitNumber value={total} className={numberColor} />
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
    <div
      className={cn(
        panel,
        "flex flex-wrap items-center gap-2 bg-[var(--term-alt)] px-3 py-2",
      )}
    >
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
