import type {
  Dashboard,
  EndResult,
  ExcavationView,
  GameConfig,
} from "@/backend";
import { EndKind } from "@/backend";
import { cn } from "@/lib/utils";
import {
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
import { useEffect, useRef } from "react";
import type { Cell } from "./board-store";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  ROCK_CELL,
  STAKE_LABELS,
  TOKENS,
  type TokenKey,
  eyebrow,
  fmtCountdown,
  fmtGoldao,
  fmtMult,
  fmtSigned,
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
  digits = 0,
  scaled = false,
  tick = false,
  from,
}: {
  value: number;
  className?: string;
  digits?: number;
  scaled?: boolean;
  tick?: boolean;
  from?: number;
}) {
  const mv = useMotionValue(from ?? value);
  const prev = useRef(from ?? value);
  const text = useTransform(mv, (v) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );
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

export function MiniStat({
  label,
  value,
  accent,
}: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] px-3 py-1.5">
      <div className={cn("font-mono text-[10px] uppercase", inkFaint)}>
        {label}
      </div>
      <div
        className={cn(
          "font-display text-lg font-semibold leading-tight tabular-nums",
          accent ? DIAMOND_TEXT : ink,
        )}
      >
        {value}
      </div>
    </div>
  );
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
  if (!exc.canSave) return "Free picks: nothing at risk.";
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
          <span className={cn(eyebrow, gold)}>Pick {picks}</span>
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
  const win = exc && active ? exc.runGross - exc.stake : 0n;
  const nextNet = exc && exc.nextGross > 0n ? exc.nextGross - exc.stake : null;
  const next = nextNet !== null && nextNet > 0n ? nextNet : null;
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
            Winning now
          </span>
          <span
            className={cn(
              "font-display text-[28px] font-bold leading-none tabular-nums transition-colors sm:text-[40px]",
              win > 0n ? "text-[color:var(--term-green)]" : ink,
            )}
          >
            {win > 0n && "+"}
            <RollingNumber value={toGoldao(win)} digits={2} scaled tick />
          </span>
          <span className="min-h-3.5 font-mono text-[10px] text-destructive">
            {exc && active
              ? `If it collapses: ${fmtSigned(exc.collapseGross - exc.stake, 2)}`
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
            {exc && active ? fmtMult(Number(exc.runPoints)) : "0.00x"}
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
            {next !== null ? fmtSigned(next, 2) : "-"}
          </motion.span>
          <span className={cn("font-mono text-[10px]", inkMid)}>
            {exc && next !== null
              ? `If the next pick is safe · ${(Number(exc.nextGross) / Number(exc.stake)).toFixed(2)}x`
              : exc && nextNet === null
                ? "Maximum reached"
                : "Saving unlocks at pick 3"}
          </span>
        </div>
        <SaveButton
          canSave={canSave}
          onSave={onSave}
          amount={exc ? fmtSigned(exc.runGross - exc.stake, 2) : undefined}
        />
      </div>
    </div>
  );
}

export function CreditBar({
  dashboard,
  className,
}: { dashboard: Dashboard | undefined; className?: string }) {
  const credit = dashboard ? Number(dashboard.credit) / 1e8 : 0;
  const prev = useRef(credit);
  const settled = useRef(false);
  const dir =
    credit > prev.current ? "up" : credit < prev.current ? "down" : "same";
  useEffect(() => {
    prev.current = credit;
  }, [credit]);
  useEffect(() => {
    if (dashboard) settled.current = true;
  }, [dashboard]);
  return (
    <div
      className={cn(
        panel,
        "flex min-w-0 flex-col justify-between gap-2 border-primary/50 bg-[var(--term-alt)] p-3 sm:p-6",
        className,
      )}
    >
      <span className={cn(eyebrow, inkFaint)}>To collect</span>
      <motion.span
        key={`${credit}-${dir}`}
        initial={{
          scale: dir === "same" ? 1 : 1.06,
          color:
            dir === "up"
              ? "oklch(0.78 0.15 85)"
              : dir === "down"
                ? "oklch(0.62 0.2 25)"
                : undefined,
        }}
        animate={{ scale: 1, color: "var(--term-ink)" }}
        transition={{ duration: 1.1 }}
        className="flex origin-left flex-wrap items-baseline gap-x-3 font-display text-[34px] font-bold leading-none tabular-nums md:text-[clamp(48px,6vw,84px)]"
      >
        <RollingNumber
          value={credit}
          digits={2}
          scaled={settled.current}
          tick={settled.current}
        />
        <span className={cn("font-mono text-xs font-semibold", gold)}>
          GOLDAO
        </span>
      </motion.span>
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
        <RollingNumber value={pool ? Number(pool) / 1e8 : 0} />
        <span className={cn("ml-2 font-mono text-xs", inkFaint)}>GOLDAO</span>
      </span>
      <span className={cn("font-mono text-[11px]", inkMid)}>
        3 diamonds win it all
      </span>
    </div>
  );
}

/** End of the excavation, shown over the board. */
export function ResultCard({
  result,
  onNew,
}: { result: EndResult; onNew: () => void }) {
  const collapsed = result.kind === EndKind.collapsed;
  const prize = prizeName(Number(result.picks));
  const PrizeIcon = prize.icon;
  const net = result.won > 0n ? result.won : -result.lost;
  const title = collapsed
    ? result.won > 0n
      ? "Collapse · you keep half"
      : "Collapse"
    : prize.name;
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
        className="flex w-full max-w-[400px] flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--term-border)] bg-[oklch(var(--background)/0.96)] px-4 py-5 text-center shadow-2xl"
      >
        {collapsed ? (
          <span className={cn(eyebrow, gold)}>{title}</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-display text-[clamp(20px,5vw,30px)] font-bold uppercase leading-none tracking-wider",
              prize.pill,
            )}
          >
            <PrizeIcon className="size-[1em]" />
            {title}
          </span>
        )}
        <span
          className={cn(
            "font-display text-[clamp(52px,14vw,84px)] font-bold leading-none tabular-nums",
            net > 0n ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {net > 0n ? (
            <>
              +
              <RollingNumber
                value={toGoldao(net)}
                digits={2}
                from={0}
                scaled
                tick
              />
            </>
          ) : (
            fmtSigned(net, 2)
          )}
        </span>
        <span className={cn("font-mono text-xs", inkMid)}>
          GOLDAO · {Number(result.points)} pts
        </span>
        {result.charged > 0n && (
          <span className={cn("font-mono text-xs", inkMid)}>
            Charged from wallet: {fmtGoldao(result.charged, 2)}
          </span>
        )}
        {result.jackpotWon > 0n && (
          <span className={cn("font-mono text-xs", DIAMOND_TEXT)}>
            Jackpot: +{fmtGoldao(result.jackpotWon, 2)} GOLDAO
          </span>
        )}
        <button
          type="button"
          onClick={onNew}
          className="mt-2 flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 px-4 py-1.5 font-mono text-xs font-medium text-[color:var(--term-gold)] transition-colors hover:bg-primary/20"
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
