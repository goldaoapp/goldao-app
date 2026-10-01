import type { Dashboard, ExcavationView, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  Gem,
  Mountain,
  Pickaxe,
  Save,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useAnimate,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  ROCK_CELL,
  TOKENS,
  type TokenKey,
  eyebrow,
  fmtGoldao,
  fmtPct,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  tierOf,
  tokenForPick,
} from "./game-utils";
import { playSound, preloadSounds, useSoundToggle } from "./sounds";
import { errorMessage, useGameAction, useRanking } from "./useGame";

type Cell =
  | { kind: "token"; token: TokenKey }
  | { kind: "diamond" }
  | { kind: "rock" };

type RunResult = { kind: "saved" | "collapse" | "emptied"; points: number };

/** Personal records at the start of the current excavation. */
type RecordBase = { best: number; deepest: number; depthShown: boolean };

const CELLS = 25;

/** Where already-dug cells are drawn when an open excavation is restored after a reload. */
const RESTORE_ORDER = [
  12, 6, 18, 8, 16, 2, 22, 10, 14, 0, 24, 4, 20, 7, 17, 11, 13, 1, 23, 3,
];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function MineBoard({ dashboard, config }: Props) {
  const { actor, isAuthenticated, login } = useAuth();
  const { run, refreshAll } = useGameAction();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  const [exc, setExc] = useState<ExcavationView | null>(null);
  const [cells, setCells] = useState<Record<number, Cell>>({});
  const [digging, setDigging] = useState<number | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipRestoreUntil = useRef(0);
  const { muted, toggleMuted } = useSoundToggle();
  const { data: ranking } = useRanking();
  const [record, setRecord] = useState<string | null>(null);
  const recordBase = useRef<RecordBase | null>(null);
  const recordTimer = useRef<number | undefined>(undefined);

  const showRecord = useCallback((text: string) => {
    window.clearTimeout(recordTimer.current);
    setRecord(text);
    recordTimer.current = window.setTimeout(() => setRecord(null), 3500);
  }, []);

  useEffect(() => () => window.clearTimeout(recordTimer.current), []);

  useEffect(() => {
    preloadSounds();
  }, []);

  const excPerChip = config ? Number(config.excavationsPerChip) : 5;
  const safePicks = config ? Number(config.safePicks) : 2;
  const table = useMemo(
    () => (config ? config.pointsTable.map(Number) : []),
    [config],
  );
  const weekOpen = dashboard?.status === "open";
  const excavationsLeft = dashboard ? Number(dashboard.excavationsLeft) : 0;
  const busy = digging !== null;

  // Restore an excavation left open (reload, another tab) from the backend.
  const open = dashboard?.open;
  useEffect(() => {
    if (!open || exc || busy || Date.now() < skipRestoreUntil.current) return;
    const picks = Number(open.picks);
    const restored: Record<number, Cell> = {};
    RESTORE_ORDER.slice(0, picks).forEach((idx, i) => {
      restored[idx] = { kind: "token", token: tokenForPick(i + 1) };
    });
    recordBase.current = dashboard
      ? {
          best: Number(dashboard.stats.best),
          deepest: Number(dashboard.stats.deepest),
          depthShown: false,
        }
      : null;
    setExc(open);
    setCells(restored);
    setResult(null);
  }, [open, exc, busy, dashboard]);

  const endRun = useCallback(
    (r: RunResult) => {
      skipRestoreUntil.current = Date.now() + 8000;
      const base = recordBase.current;
      if (base && base.best > 0 && r.points > base.best) {
        showRecord(`New record: ${r.points} pts in one excavation`);
      }
      recordBase.current = null;
      setExc(null);
      setResult(r);
      void refreshAll();
    },
    [refreshAll, showRecord],
  );

  const shake = useCallback(() => {
    if (!scope.current) return;
    void animate(
      scope.current,
      { x: [0, -10, 10, -7, 7, -3, 3, 0] },
      { duration: 0.55 },
    );
  }, [animate, scope]);

  const dig = async (index: number) => {
    if (!actor || busy || cells[index]) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    setError(null);

    let current = exc;
    if (!current) {
      if (!weekOpen) {
        setError("The week is closed. Wait for the next one to open.");
        return;
      }
      if (excavationsLeft === 0) {
        setError("No excavations left. Buy a chip to keep digging.");
        return;
      }
      setDigging(index);
      setCells({});
      setResult(null);
      recordBase.current = dashboard
        ? {
            best: Number(dashboard.stats.best),
            deepest: Number(dashboard.stats.deepest),
            depthShown: false,
          }
        : null;
      try {
        current = await run("start", () => actor.gameStartExcavation());
        setExc(current);
      } catch (e) {
        setDigging(null);
        setError(errorMessage(e));
        return;
      }
    }

    setDigging(index);
    try {
      const r = await run("pick", () => actor.gamePick(), false);
      if (r.collapsed) {
        setCells((c) => ({ ...c, [index]: { kind: "rock" } }));
        shake();
        endRun({ kind: "collapse", points: Number(r.pointsSaved) });
        return;
      }
      const cell: Cell = r.diamond
        ? { kind: "diamond" }
        : { kind: "token", token: tokenForPick(Number(r.picks)) };
      setCells((c) => ({ ...c, [index]: cell }));
      playSound(r.diamond ? "diamond" : "success");
      const base = recordBase.current;
      if (
        base &&
        !base.depthShown &&
        base.deepest > 0 &&
        Number(r.picks) > base.deepest
      ) {
        base.depthShown = true;
        showRecord(`New depth record: pick ${Number(r.picks)}`);
      }
      if (r.ended) {
        endRun({ kind: "emptied", points: Number(r.pointsSaved) });
      } else {
        setExc(r.excavation ?? null);
      }
    } catch (e) {
      setError(errorMessage(e));
      void refreshAll();
    } finally {
      setDigging(null);
    }
  };

  const save = async () => {
    if (!actor || !exc?.canSave || busy) return;
    setError(null);
    try {
      const pts = await run("save", () => actor.gameSave(), false);
      endRun({ kind: "saved", points: Number(pts) });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const chips = dashboard?.chips ?? [];
  const currentChip = exc
    ? chips.find((c) => c.id === exc.chipId)
    : chips.find((c) => Number(c.used) < excPerChip);
  const chipNumber = currentChip ? chips.indexOf(currentChip) + 1 : null;
  const picks = exc ? Number(exc.picks) : 0;
  const excNumber = Math.min(excPerChip, Number(currentChip?.used ?? 0) + 1);

  // Live prize of the current chip, using this week's cutoffs.
  const cuts = ranking?.cutsX100;
  const hasCuts = !!cuts?.some((c) => c != null);
  const tierFor = (pts: number): number | null => {
    if (!currentChip || !cuts || !hasCuts) return null;
    const avgX100 =
      ((Number(currentChip.points) + pts) * 100) /
      (Number(currentChip.used) + 1);
    for (let t = 0; t < 4; t++) {
      const c = cuts[t];
      if (c != null && avgX100 >= Number(c)) return t;
    }
    return 4;
  };
  const tierNow = exc?.canSave ? tierFor(table[picks] ?? 0) : null;
  const tierNext = exc ? tierFor(Number(exc.nextPoints)) : null;
  const tierCollapse =
    exc && picks >= safePicks ? tierFor(Number(exc.ifCollapse)) : null;
  return (
    <div className={cn(panel, "overflow-hidden")}>
      <div className={panelHeader}>
        <span
          className={cn(
            eyebrow,
            gold,
            "flex shrink-0 items-center gap-2 whitespace-nowrap",
          )}
        >
          <Pickaxe className="size-3.5" /> Gold mine
        </span>
        <div className="flex items-center gap-3">
          <span
            className={cn("whitespace-nowrap font-mono text-[11px]", inkFaint)}
          >
            {chipNumber ? (
              <>
                <span className="sm:hidden">
                  Chip {chipNumber} · {excNumber}/{excPerChip}
                </span>
                <span className="hidden sm:inline">
                  Chip {chipNumber} · excavation {excNumber} of {excPerChip}
                </span>
              </>
            ) : (
              "No active chip"
            )}
          </span>
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            title={muted ? "Sound off" : "Sound on"}
            className={cn(
              "rounded-md p-1 transition-smooth hover:text-[color:var(--term-ink)]",
              muted ? inkFaint : gold,
            )}
          >
            {muted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Board */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-[420px]">
            <AnimatePresence>
              {record && (
                <motion.div
                  key={record}
                  initial={{ opacity: 0, y: -12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="pointer-events-none absolute inset-x-0 -top-3 z-10 flex justify-center"
                >
                  <span className="gradient-primary flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-xs font-semibold text-primary-foreground shadow-lg">
                    <Trophy className="size-3.5" />
                    {record}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            <div
              ref={scope}
              className="grid w-full grid-cols-5 gap-2 sm:gap-2.5"
            >
              {Array.from({ length: CELLS }, (_, i) => (
                <MineCell
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5x5 board
                  key={i}
                  cell={cells[i]}
                  digging={digging === i}
                  disabled={busy && digging !== i}
                  idle={!exc && !result}
                  onClick={() => void dig(i)}
                />
              ))}
            </div>
          </div>
          <BoardMessage
            exc={exc}
            result={result}
            error={error}
            busy={busy}
            safePicks={safePicks}
            canPlay={excavationsLeft > 0 && weekOpen}
            isAuthenticated={isAuthenticated}
          />
        </div>

        {/* Run panel */}
        <div className="flex flex-col gap-4">
          <Stat label="This excavation">
            <RollingNumber
              value={exc ? (table[picks] ?? 0) : 0}
              className={cn(
                "font-display text-4xl font-semibold tabular-nums",
                ink,
              )}
            />
            <span className={cn("ml-1.5 font-mono text-xs", inkFaint)}>
              pts
            </span>
          </Stat>

          <Stat label="If it collapses now">
            <span className={cn("font-mono text-sm", inkMid)}>
              {!exc
                ? "—"
                : picks < safePicks
                  ? "Nothing at risk yet"
                  : `You keep ${Number(exc.ifCollapse)} pts`}
              {tierCollapse !== null && (
                <span className={inkFaint}> · {tierOf(tierCollapse).name}</span>
              )}
            </span>
          </Stat>

          <Stat label="Next pick">
            <span className={cn("font-mono text-sm", inkMid)}>
              {!exc
                ? "—"
                : picks < safePicks
                  ? `${Number(exc.nextPoints)} pts · safe`
                  : `${Number(exc.nextPoints)} pts · ${fmtPct(exc.safePctX100)} safe`}
            </span>
          </Stat>

          <Stat label="Chip prize if you save now">
            <ChipPrize
              active={!!exc}
              canSave={!!exc?.canSave}
              tierNow={tierNow}
              tierNext={tierNext}
            />
          </Stat>

          <Button
            onClick={() => void save()}
            disabled={!exc?.canSave || busy}
            className="gradient-primary text-primary-foreground"
          >
            <Save className="size-4" />
            Save {exc?.canSave ? `${table[picks]} pts` : "points"}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              label="Excavations left"
              value={dashboard ? String(excavationsLeft) : "—"}
            />
            <MiniStat
              label="Diamonds"
              value={dashboard ? String(Number(dashboard.diamonds)) : "—"}
              accent
            />
          </div>

          <DrawCard
            prize={ranking?.drawPrize}
            mine={dashboard ? Number(dashboard.diamonds) : 0}
            total={dashboard ? Number(dashboard.totalDiamonds) : 0}
          />
        </div>
      </div>

      {/* Points table */}
      <div className="border-t border-[color:var(--term-border-faint)] px-4 py-4 sm:px-6">
        <span className={cn(eyebrow, inkFaint)}>Points when saving</span>
        <SavingStep
          picks={exc ? picks : null}
          points={exc ? (table[picks] ?? 0) : 0}
          nextPoints={exc ? (table[picks + 1] ?? null) : null}
          safePicks={safePicks}
          canSave={!!exc?.canSave}
        />
        <Legend />
      </div>
    </div>
  );
}

function MineCell({
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

/** Short burst of light around a diamond. */
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

function BoardMessage({
  exc,
  result,
  error,
  busy,
  safePicks,
  canPlay,
  isAuthenticated,
}: {
  exc: ExcavationView | null;
  result: RunResult | null;
  error: string | null;
  busy: boolean;
  safePicks: number;
  canPlay: boolean;
  isAuthenticated: boolean;
}) {
  let content: { text: string; tone: "gold" | "rock" | "mid" | "err" };
  if (error) content = { text: error, tone: "err" };
  else if (busy) content = { text: "Digging…", tone: "mid" };
  else if (result?.kind === "collapse")
    content = {
      text: `Collapse. You keep ${result.points} points.`,
      tone: "rock",
    };
  else if (result?.kind === "saved")
    content = { text: `Saved ${result.points} points.`, tone: "gold" };
  else if (result?.kind === "emptied")
    content = {
      text: `You emptied the mine: ${result.points} points.`,
      tone: "gold",
    };
  else if (exc && Number(exc.picks) < safePicks)
    content = { text: "The first two picks are always safe.", tone: "mid" };
  else if (exc)
    content = { text: "Keep digging or save your points.", tone: "mid" };
  else if (!isAuthenticated)
    content = { text: "Sign in to start digging.", tone: "mid" };
  else if (!canPlay)
    content = { text: "Buy a chip to get excavations.", tone: "mid" };
  else content = { text: "Pick any cell to start an excavation.", tone: "mid" };

  const tone = {
    gold: "text-[color:var(--term-gold)]",
    rock: "text-[color:var(--term-ink-mid)]",
    mid: "text-[color:var(--term-ink-faint)]",
    err: "text-destructive",
  }[content.tone];

  return (
    <div className="flex h-6 items-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={content.text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className={cn("flex items-center gap-1.5 font-mono text-xs", tone)}
        >
          {result?.kind === "collapse" && !error && (
            <Mountain className="size-3.5" />
          )}
          {result && result.kind !== "collapse" && !error && (
            <ShieldCheck className="size-3.5" />
          )}
          {content.text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function Stat({
  label,
  children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[color:var(--term-border-faint)] pb-3">
      <span className={cn(eyebrow, inkFaint)}>{label}</span>
      <div className="flex items-baseline">{children}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: { label: string; value: string; accent?: boolean }) {
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

/** Single card with the current step of the excavation; animates on every pick. */
function SavingStep({
  picks,
  points,
  nextPoints,
  safePicks,
  canSave,
}: {
  picks: number | null;
  points: number;
  nextPoints: number | null;
  safePicks: number;
  canSave: boolean;
}) {
  const note =
    picks === null
      ? "Pick any cell to start"
      : canSave
        ? "Yours if you save now"
        : picks < safePicks
          ? "Free picks · nothing at risk"
          : "Free · you can save from the next pick";

  return (
    <div className="mt-3 flex flex-wrap items-stretch gap-3">
      <div className="relative min-w-[220px] overflow-hidden rounded-xl border border-primary/50 bg-primary/10 px-6 py-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={picks ?? "idle"}
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="flex flex-col gap-1"
          >
            <span className={cn(eyebrow, gold)}>
              {picks === null ? "Not digging" : `Pick ${picks}`}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-display text-5xl font-semibold tabular-nums",
                  ink,
                )}
              >
                {points.toLocaleString("en-US")}
              </span>
              <span className={cn("font-mono text-xs", inkFaint)}>pts</span>
            </span>
            <span className={cn("font-mono text-[11px]", inkMid)}>{note}</span>
          </motion.div>
        </AnimatePresence>
        {/* Light sweep on every change */}
        <motion.span
          key={`sweep-${picks ?? "idle"}`}
          aria-hidden
          initial={{ x: "-120%" }}
          animate={{ x: "220%" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
      </div>

      {nextPoints !== null && (
        <motion.div
          key={`next-${picks ?? "idle"}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="flex flex-col justify-center gap-1 rounded-xl border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] px-5 py-4"
        >
          <span className={cn(eyebrow, inkFaint)}>
            Next · pick {(picks ?? 0) + 1}
          </span>
          <span
            className={cn(
              "font-display text-2xl font-semibold tabular-nums",
              inkMid,
            )}
          >
            {nextPoints.toLocaleString("en-US")}
            <span className={cn("ml-1 font-mono text-[10px]", inkFaint)}>
              pts
            </span>
          </span>
        </motion.div>
      )}
    </div>
  );
}

/** Number that rolls smoothly to its new value. */
function RollingNumber({
  value,
  className,
}: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("en-US"));
  useEffect(() => {
    const controls = animateValue(mv, value, {
      duration: 0.6,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Prize this chip would get if the excavation were saved now, and after one more safe pick. */
function ChipPrize({
  active,
  canSave,
  tierNow,
  tierNext,
}: {
  active: boolean;
  canSave: boolean;
  tierNow: number | null;
  tierNext: number | null;
}) {
  if (!active)
    return <span className={cn("font-mono text-sm", inkMid)}>—</span>;
  if (tierNext === null) {
    return (
      <span className={cn("font-mono text-xs", inkFaint)}>
        Shown once the week has more chips
      </span>
    );
  }
  const next = tierOf(tierNext);
  const improves = tierNow !== null && tierNext < tierNow;
  return (
    <div className="flex flex-col gap-1.5">
      {canSave && tierNow !== null ? (
        <motion.span
          key={tierNow}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            tierOf(tierNow).pill,
          )}
        >
          {(() => {
            const Icon = tierOf(tierNow).icon;
            return <Icon className="size-3" />;
          })()}
          {tierOf(tierNow).name}
        </motion.span>
      ) : (
        <span className={cn("font-mono text-xs", inkMid)}>
          You can save from pick 3
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[11px]",
          improves ? "text-[color:var(--term-gold)]" : inkFaint,
        )}
      >
        One more safe pick: {next.name}
        {improves ? " ↑" : ""}
      </span>
    </div>
  );
}

/** Diamond draw jackpot with the player's current odds. */
function DrawCard({
  prize,
  mine,
  total,
}: { prize: bigint | undefined; mine: number; total: number }) {
  const chance = total > 0 ? (mine / total) * 100 : 0;
  return (
    <div className="relative overflow-hidden rounded-md border border-[oklch(0.75_0.14_350/0.35)] bg-[oklch(0.75_0.14_350/0.08)] px-3 py-3">
      <div
        className={cn(
          "flex items-center gap-1.5 font-mono text-[10px] uppercase",
          DIAMOND_TEXT,
        )}
      >
        <Gem className="size-3" /> Diamond draw
      </div>
      <div className="flex items-baseline gap-1.5">
        <motion.span
          key={prize === undefined ? "none" : String(prize)}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className={cn(
            "font-display text-2xl font-semibold tabular-nums",
            DIAMOND_TEXT,
          )}
        >
          {prize === undefined ? "—" : fmtGoldao(prize)}
        </motion.span>
        <span className={cn("font-mono text-[10px]", inkFaint)}>GOLDAO</span>
      </div>
      <div className={cn("font-mono text-[10px]", inkFaint)}>
        {mine > 0
          ? `Your chance ${chance.toFixed(1)}% · ${mine} of ${total} tickets`
          : "Find a diamond to enter the draw"}
      </div>
    </div>
  );
}

function Legend() {
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
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
        Tokens are decoration: your prize depends only on your average.
      </span>
    </div>
  );
}
