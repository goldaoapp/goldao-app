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
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  ROCK_CELL,
  TOKENS,
  type TokenKey,
  eyebrow,
  fmtPct,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  tokenForPick,
} from "./game-utils";
import { playSound, preloadSounds, useSoundToggle } from "./sounds";
import { errorMessage, useGameAction } from "./useGame";

type Cell =
  | { kind: "token"; token: TokenKey }
  | { kind: "diamond" }
  | { kind: "rock" };

type RunResult = { kind: "saved" | "collapse" | "emptied"; points: number };

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
    setExc(open);
    setCells(restored);
    setResult(null);
  }, [open, exc, busy]);

  const endRun = useCallback(
    (r: RunResult) => {
      skipRestoreUntil.current = Date.now() + 8000;
      setExc(null);
      setResult(r);
      void refreshAll();
    },
    [refreshAll],
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

  return (
    <div className={cn(panel, "overflow-hidden")}>
      <div className={panelHeader}>
        <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
          <Pickaxe className="size-3.5" /> Gold mine
        </span>
        <div className="flex items-center gap-3">
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            {chipNumber
              ? `Chip ${chipNumber} · excavation ${Math.min(excPerChip, Number(currentChip?.used ?? 0) + 1)} of ${excPerChip}`
              : "No active chip"}
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
          <div
            ref={scope}
            className="grid w-full max-w-[420px] grid-cols-5 gap-2 sm:gap-2.5"
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
            <motion.span
              key={exc ? picks : "idle"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "font-display text-4xl font-semibold tabular-nums",
                ink,
              )}
            >
              {exc ? (table[picks] ?? 0) : 0}
            </motion.span>
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
        </div>
      </div>

      {/* Points table */}
      <div className="border-t border-[color:var(--term-border-faint)] px-4 py-4 sm:px-6">
        <span className={cn(eyebrow, inkFaint)}>Points when saving</span>
        <div className="mt-3 flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6, 8, 10].map((k) => (
            <div
              key={k}
              className={cn(
                "min-w-[76px] rounded-md border px-3 py-2 text-center transition-smooth",
                exc && picks === k
                  ? "border-primary/70 bg-primary/10"
                  : "border-[color:var(--term-border-faint)] bg-[var(--term-alt)]",
              )}
            >
              <div className={cn("font-mono text-[10px] uppercase", inkFaint)}>
                {k} picks
              </div>
              <div
                className={cn(
                  "font-display text-lg font-semibold tabular-nums",
                  ink,
                )}
              >
                {table[k] ?? "—"}
              </div>
              <div className={cn("font-mono text-[10px]", inkFaint)}>
                {k === safePicks
                  ? "free"
                  : `collapse ${Math.ceil((table[k - 1] ?? 0) / 2)}`}
              </div>
            </div>
          ))}
        </div>
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
