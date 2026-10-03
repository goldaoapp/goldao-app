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
  grossOf,
  ink,
  inkFaint,
  inkMid,
  panel,
  prizeName,
} from "./game-utils";

export function MineCell({
  cell,
  digging,
  disabled,
  idle,
  onClick,
}: {
  cell: Cell | undefined;
  digging: boolean;
  disabled: boolean;
  idle: boolean;
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
      whileHover={!cell && !disabled ? { y: -3 } : undefined}
      whileTap={!cell && !disabled ? { scale: 0.94 } : undefined}
      animate={{ opacity: idle && !cell ? 0.85 : 1 }}
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border transition-colors duration-300 disabled:cursor-default",
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

/** Number that rolls smoothly to its new value. */
export function RollingNumber({
  value,
  className,
  digits = 0,
}: { value: number; className?: string; digits?: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );
  useEffect(() => {
    const controls = animateValue(mv, value, {
      duration: 0.7,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

export function MiniStat({
  label,
  value,
  accent,
}: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] px-3 py-2">
      <div className={cn("font-mono text-[10px] uppercase", inkFaint)}>
        {label}
      </div>
      <div
        className={cn(
          "font-display text-lg font-semibold tabular-nums",
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
}: { canSave: boolean; onSave: () => void }) {
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
                "0 0 0 0 oklch(0.74 0.14 80 / 0.45)",
                "0 0 0 8px oklch(0.74 0.14 80 / 0)",
              ],
            }
          : { boxShadow: "0 0 0 0 oklch(0.74 0.14 80 / 0)" }
      }
      transition={
        canSave
          ? { boxShadow: { duration: 1.6, repeat: Number.POSITIVE_INFINITY } }
          : undefined
      }
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-display text-sm font-semibold transition-opacity",
        canSave
          ? "gradient-primary text-primary-foreground"
          : "cursor-not-allowed border border-[color:var(--term-border)] bg-[var(--term-alt)] text-[color:var(--term-ink-faint)]",
      )}
      aria-label="Save points"
    >
      <Shield className="size-4" />
      Save
    </motion.button>
  );
}

export function StakeSelector({
  stakes,
  value,
  locked,
  paused,
  table,
  onChange,
}: {
  stakes: bigint[];
  value: 0 | 1 | 2;
  locked: boolean;
  paused: boolean;
  table: number[];
  onChange: (v: 0 | 1 | 2) => void;
}) {
  if (paused || stakes.length !== 3) {
    return (
      <div className="rounded-md border border-[color:var(--term-border)] bg-[var(--term-alt)] px-3 py-2 font-mono text-xs text-[color:var(--term-ink-mid)]">
        Bets are paused
      </div>
    );
  }
  const stake = stakes[value];
  const net = (pts: number) => grossOf(stake, pts) - stake;
  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit rounded-md border border-[color:var(--term-border)] p-0.5">
        {stakes.map((s, i) => (
          <button
            key={STAKE_LABELS[i]}
            type="button"
            disabled={locked}
            onClick={() => onChange(i as 0 | 1 | 2)}
            className={cn(
              "rounded px-3 py-1.5 font-mono text-xs transition-smooth disabled:cursor-not-allowed",
              value === i
                ? "bg-primary text-primary-foreground"
                : cn(inkMid, "hover:text-[color:var(--term-ink)]"),
              locked && value !== i && "opacity-50",
            )}
          >
            {STAKE_LABELS[i]} {fmtGoldao(s)}
          </button>
        ))}
      </div>
      {table.length > 10 && (
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          Save at 3: {fmtSigned(net(table[3]))} · Save at 10:{" "}
          {fmtSigned(net(table[10]))} GOLDAO
        </span>
      )}
    </div>
  );
}

export function PayoutStep({ exc }: { exc: ExcavationView | null }) {
  if (!exc) {
    return (
      <div className="rounded-xl border border-primary/50 bg-primary/10 px-5 py-4">
        <span className={cn(eyebrow, gold)}>Ready to dig</span>
        <p className={cn("mt-1 font-mono text-xs", inkMid)}>
          Pick any cell to start. The first two picks are always safe.
        </p>
      </div>
    );
  }
  const picks = Number(exc.picks);
  const save = exc.runGross - exc.stake;
  const collapse = exc.collapseGross - exc.stake;
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/50 bg-primary/10 px-5 py-4">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={picks}
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 340, damping: 24 }}
          className="flex flex-col gap-1.5"
        >
          <span className={cn(eyebrow, gold)}>Pick {picks}</span>
          {exc.canSave ? (
            <span className={cn("font-display text-2xl font-semibold", ink)}>
              Save now: {fmtSigned(save, 2)} GOLDAO{" "}
              <span className={cn("font-mono text-xs", inkFaint)}>
                ({fmtMult(Number(exc.runPoints))})
              </span>
            </span>
          ) : (
            <span className={cn("font-display text-xl font-semibold", ink)}>
              Free picks: nothing at risk
            </span>
          )}
          {exc.nextGross > 0n && (
            <span className={cn("font-mono text-xs", inkMid)}>
              Next pick:{" "}
              {(Number(exc.nextGross) / Number(exc.stake)).toFixed(2)}x
            </span>
          )}
          {exc.canSave && (
            <span className={cn("font-mono text-xs", inkFaint)}>
              If it collapses: {fmtSigned(collapse, 2)} GOLDAO ·{" "}
              {Number(exc.safePctX100) / 100}% safe
            </span>
          )}
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

export function CreditBar({ dashboard }: { dashboard: Dashboard | undefined }) {
  const credit = dashboard ? Number(dashboard.credit) / 1e8 : 0;
  const prev = useRef(credit);
  const dir =
    credit > prev.current ? "up" : credit < prev.current ? "down" : "same";
  useEffect(() => {
    prev.current = credit;
  }, [credit]);
  return (
    <div
      className={cn(
        panel,
        "flex flex-wrap items-center justify-between gap-3 px-5 py-4",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className={cn(eyebrow, inkFaint)}>To collect</span>
        <motion.span
          key={`${credit}-${dir}`}
          initial={{
            scale: dir === "same" ? 1 : 1.08,
            color:
              dir === "up"
                ? "oklch(0.78 0.15 85)"
                : dir === "down"
                  ? "oklch(0.62 0.2 25)"
                  : undefined,
          }}
          animate={{ scale: 1, color: "var(--term-ink)" }}
          transition={{ duration: 1.1 }}
          className="flex items-baseline gap-2 font-display text-3xl font-semibold tabular-nums"
        >
          <RollingNumber value={credit} digits={2} />
          <span className={cn("font-mono text-xs", gold)}>GOLDAO</span>
        </motion.span>
      </div>
      <span className={cn("font-mono text-[11px]", inkFaint)}>
        Paid when the tournament closes
        {dashboard ? ` · ${fmtCountdown(dashboard.endsAt)}` : ""}
      </span>
    </div>
  );
}

export function JackpotCard({ pool }: { pool: bigint | undefined }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[oklch(0.68_0.16_350/0.45)] bg-[oklch(0.7_0.14_350/0.08)] px-4 py-3">
      <span className={cn(eyebrow, DIAMOND_TEXT, "flex items-center gap-1.5")}>
        <Gem className="size-3.5" /> Diamond jackpot
      </span>
      <span
        className={cn(
          "font-display text-3xl font-semibold tabular-nums",
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

export function ResultCard({
  result,
  onNew,
}: { result: EndResult; onNew: () => void }) {
  const collapsed = result.kind === EndKind.collapsed;
  const prize = prizeName(Number(result.picks));
  const Icon = collapsed ? Mountain : prize.icon;
  const net = result.won > 0n ? result.won : -result.lost;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        panel,
        "flex flex-wrap items-center justify-between gap-4 px-5 py-4",
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <Icon className={cn("size-5", collapsed ? inkMid : "text-primary")} />
          <span className={cn("font-display text-lg font-semibold", ink)}>
            {collapsed ? "Collapse" : prize.name}
          </span>
          <span className={cn("font-mono text-xs", inkFaint)}>
            {Number(result.points)} pts
          </span>
        </span>
        <span
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            net >= 0n ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {fmtSigned(net, 2)} <span className="text-sm">GOLDAO</span>
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
      </div>
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 px-4 py-1.5 font-mono text-xs font-medium text-[color:var(--term-gold)] transition-colors hover:bg-primary/20"
      >
        <RotateCcw className="size-3.5" />
        New excavation
      </button>
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
}: {
  text: string;
  tone: "gold" | "rock" | "mid" | "err";
  icon?: "shield" | "rock";
}) {
  const color = {
    gold: "text-[color:var(--term-gold)]",
    rock: "text-[color:var(--term-ink-mid)]",
    mid: "text-[color:var(--term-ink-faint)]",
    err: "text-destructive",
  }[tone];
  return (
    <div className="flex min-h-8 items-center justify-center">
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
    <div className={cn(panel, "flex flex-col gap-3 p-4")}>
      <span className={cn(eyebrow, gold)}>Auto dig</span>
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className={inkMid}>Save at pick</span>
        <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5">
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
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRun}
        className="rounded-md border border-[color:var(--term-border)] px-3 py-2 font-display text-sm transition-colors hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Digging…" : "Auto dig"}
      </button>
    </div>
  );
}

export type { GameConfig };
