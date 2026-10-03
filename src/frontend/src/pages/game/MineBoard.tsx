import { EndKind, type EndResult, StakeOption } from "@/backend";
import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  Bot,
  Gem,
  Hand,
  Mountain,
  Pickaxe,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./Spinner";
import { resetBoard, setBoard, useBoard } from "./board-store";
import type { Cell, RunResult } from "./board-store";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  ROCK_CELL,
  STAKE_LABEL,
  TOKENS,
  eyebrow,
  fmtGoldao,
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

const CELLS = 25;
const STAKE_KEYS: StakeOption[] = [
  StakeOption.min,
  StakeOption.mid,
  StakeOption.max,
];
const AUTO_STOPS = [3, 4, 5, 6, 7, 8];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

function toRun(e: EndResult): RunResult {
  return {
    kind:
      e.kind === EndKind.collapsed
        ? "collapse"
        : e.kind === EndKind.maxed
          ? "maxed"
          : "saved",
    points: Number(e.points),
    won: e.won,
    lost: e.lost,
    jackpotWon: e.jackpotWon,
  };
}

export function MineBoard({ dashboard, config }: Props) {
  const { actor, principalId } = useAuth();
  const { run, pending, setOpenExcavation } = useGameAction();
  const board = useBoard();
  const { muted, toggleMuted } = useSoundToggle();
  const [stake, setStake] = useState<StakeOption>(StakeOption.min);
  const [autoStop, setAutoStop] = useState(3);
  const busy = useRef(false);

  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    if (board.owner !== (principalId ?? null)) resetBoard(principalId ?? null);
  }, [board.owner, principalId]);

  // Restore the backend's open excavation after a reload.
  useEffect(() => {
    if (!dashboard || busy.current) return;
    if (Date.now() < board.skipRestoreUntil) return;
    if (dashboard.open && !board.exc) setBoard({ exc: dashboard.open });
    if (!dashboard.open && board.exc && board.digging === null) {
      setBoard({ exc: null });
    }
  }, [dashboard, board.exc, board.digging, board.skipRestoreUntil]);

  const exc = board.exc;
  const stakes = dashboard?.stakes ?? [];
  const stakeIdx = STAKE_KEYS.indexOf(stake);
  const stakeAmount = exc ? exc.stake : (stakes[stakeIdx] ?? 0n);
  const credit = dashboard?.credit ?? 0n;
  const wallet = dashboard?.balance ?? 0n;
  const canAfford = credit >= stakeAmount || wallet >= stakeAmount;
  const locked = !!pending || busy.current || board.digging !== null;
  const unavailable = !!dashboard?.paused || !!dashboard?.blocked;

  const finish = (end: EndResult) => {
    const r = toRun(end);
    setBoard({
      exc: null,
      digging: null,
      result: r,
      skipRestoreUntil: Date.now() + 4000,
    });
    setOpenExcavation(null);
    if (r.kind !== "collapse") playSound("success");
  };

  const dig = async (index: number) => {
    if (!actor || busy.current || board.cells[index]) return;
    if (unavailable) return;
    busy.current = true;
    setBoard((s) => ({
      digging: index,
      error: null,
      result: s.exc ? s.result : null,
    }));
    try {
      const res = await run("pick", () => actor.gamePick(exc ? null : stake));
      const picks = Number(res.picks);
      let cell: Cell;
      if (res.collapsed) cell = { kind: "rock" };
      else if (Number(res.diamond.stage) > 0) cell = { kind: "diamond" };
      else cell = { kind: "token", token: tokenForPick(picks) };
      if (Number(res.diamond.stage) > 0) playSound("diamond");
      if (res.end) {
        setBoard((s) => ({ cells: { ...s.cells, [index]: cell } }));
        finish(res.end);
      } else {
        setBoard((s) => ({
          cells: { ...s.cells, [index]: cell },
          exc: res.excavation ?? null,
          digging: null,
        }));
        if (res.excavation) setOpenExcavation(res.excavation);
      }
    } catch (e) {
      setBoard({ digging: null, error: errorMessage(e) });
    } finally {
      busy.current = false;
      setBoard({ digging: null });
    }
  };

  const save = async () => {
    if (!actor || busy.current) return;
    busy.current = true;
    setBoard({ error: null });
    try {
      const end = await run("save", () => actor.gameSave());
      finish(end);
    } catch (e) {
      setBoard({ error: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  const auto = async () => {
    if (!actor || busy.current) return;
    busy.current = true;
    setBoard({ error: null, result: null, cells: {} });
    try {
      const out = await run("auto", () =>
        actor.gameAuto(stake, BigInt(autoStop)),
      );
      const cells: Record<number, Cell> = {};
      out.steps.forEach((s, i) => {
        cells[i] = s.collapsed
          ? { kind: "rock" }
          : Number(s.diamond.stage) > 0
            ? { kind: "diamond" }
            : { kind: "token", token: tokenForPick(Number(s.pick)) };
      });
      setBoard({ cells, exc: null, result: toRun(out.end) });
      setOpenExcavation(null);
      if (out.steps.some((s) => Number(s.diamond.stage) > 0)) {
        playSound("diamond");
      } else if (out.end.kind !== EndKind.collapsed) playSound("success");
    } catch (e) {
      setBoard({ error: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  const newRun = () => setBoard({ cells: {}, result: null, error: null });

  const ended = !!board.result && !exc;
  const stateText = unavailable
    ? dashboard?.blocked
      ? "Your account is under review. Contact the admins."
      : "The game is paused."
    : exc
      ? "Keep digging or save your points."
      : ended
        ? "Start a new excavation."
        : "Choose a stake and dig any cell.";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Pickaxe className="size-3.5" /> Excavation
          </span>
          <button
            type="button"
            onClick={toggleMuted}
            className={cn("rounded p-1", inkMid)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5">
              {STAKE_KEYS.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  disabled={!!exc || locked}
                  onClick={() => setStake(k)}
                  className={cn(
                    "rounded px-3 py-1 font-mono text-xs transition-smooth disabled:opacity-60",
                    (exc ? exc.stake === stakes[i] : stake === k)
                      ? "bg-primary text-primary-foreground"
                      : inkMid,
                  )}
                >
                  {STAKE_LABEL[k]}{" "}
                  {stakes[i] !== undefined ? fmtGoldao(stakes[i]) : ""}
                </button>
              ))}
            </div>
            <span className={cn("font-mono text-xs", inkFaint)}>
              Credit <span className={ink}>{fmtGoldao(credit)}</span> GOLDAO
            </span>
          </div>

          <p className={cn("font-mono text-xs", inkMid)}>{stateText}</p>

          <div className="mx-auto grid w-full max-w-[420px] grid-cols-5 gap-2">
            {Array.from({ length: CELLS }, (_, i) => {
              const c = board.cells[i];
              const disabled =
                !!c ||
                locked ||
                unavailable ||
                !dashboard ||
                (!exc && !canAfford);
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed grid
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => void dig(i)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border transition-smooth",
                    !c &&
                      "border-[color:var(--term-border)] bg-[var(--term-header)] hover:border-[color:var(--term-gold)] disabled:opacity-60",
                    c?.kind === "rock" && ROCK_CELL,
                    c?.kind === "diamond" && DIAMOND_CELL,
                    c?.kind === "token" && TOKENS[c.token].cell,
                  )}
                >
                  {board.digging === i ? (
                    <Spinner />
                  ) : c?.kind === "rock" ? (
                    <Mountain className={cn("size-5", inkMid)} />
                  ) : c?.kind === "diamond" ? (
                    DIAMOND_IMG ? (
                      <img
                        src={DIAMOND_IMG}
                        alt=""
                        className="size-6 object-contain"
                      />
                    ) : (
                      <Gem className={cn("size-5", DIAMOND_TEXT)} />
                    )
                  ) : c?.kind === "token" ? (
                    <img
                      src={TOKENS[c.token].logo}
                      alt=""
                      className="size-6 rounded-full object-contain"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              disabled={!exc || !exc.canSave || locked}
              onClick={() => void save()}
              className="gradient-primary text-primary-foreground"
            >
              <Hand className="size-4" />
              Save{exc ? ` ${Number(exc.runPoints)} pts` : ""}
            </Button>
            {ended && (
              <Button variant="outline" onClick={newRun}>
                New excavation
              </Button>
            )}
          </div>

          {board.error && (
            <p className="font-mono text-xs text-destructive">{board.error}</p>
          )}

          <AnimatePresence>
            {board.result && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-[color:var(--term-border)] bg-[var(--term-header)] p-4 font-mono text-xs"
              >
                <ResultCard r={board.result} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>Current run</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 p-4 font-mono text-xs">
            <Stat label="Stake" value={fmtGoldao(stakeAmount)} />
            <Stat label="Picks" value={exc ? String(Number(exc.picks)) : "0"} />
            <Stat
              label="Points"
              value={exc ? String(Number(exc.runPoints)) : "0"}
            />
            <Stat label="Value" value={exc ? fmtGoldao(exc.runGross) : "0"} />
            <Stat
              label="If it collapses"
              value={exc ? fmtGoldao(exc.collapseGross) : "0"}
            />
            <Stat
              label="Next pick"
              value={exc ? fmtGoldao(exc.nextGross) : "0"}
            />
            <Stat
              label="Safe chance"
              value={
                exc ? `${Math.round(Number(exc.safePctX100) / 100)}%` : "-"
              }
            />
            <Stat
              label="Diamonds"
              value={exc ? String(Number(exc.diamonds)) : "0"}
            />
          </dl>
          {exc && exc.held > 0n && (
            <p
              className={cn(
                "border-t border-[color:var(--term-border-faint)] px-4 py-3 font-mono text-[11px]",
                DIAMOND_TEXT,
              )}
            >
              Jackpot on hold: {fmtGoldao(exc.held)} GOLDAO. It is confirmed
              from the third pick.
            </p>
          )}
          {exc && exc.jackpotWon > 0n && (
            <p
              className={cn(
                "border-t border-[color:var(--term-border-faint)] px-4 py-3 font-mono text-[11px]",
                DIAMOND_TEXT,
              )}
            >
              Jackpot won: {fmtGoldao(exc.jackpotWon)} GOLDAO
            </p>
          )}
        </div>

        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <Bot className="size-3.5" /> Auto dig
            </span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className={inkMid}>Save at</span>
              <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5">
                {AUTO_STOPS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={locked || !!exc}
                    onClick={() => setAutoStop(n)}
                    className={cn(
                      "rounded px-2 py-1 transition-smooth disabled:opacity-60",
                      autoStop === n
                        ? "bg-primary text-primary-foreground"
                        : inkMid,
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              disabled={
                locked || !!exc || unavailable || !dashboard || !canAfford
              }
              onClick={() => void auto()}
            >
              {pending === "auto" ? "Digging…" : "Run auto dig"}
            </Button>
          </div>
        </div>
        {config && (
          <p className={cn("font-mono text-[11px]", inkFaint)}>
            {Number(config.cells)} cells · {Number(config.mines)} rocks ·{" "}
            {Number(config.maxPicks)} picks max
          </p>
        )}
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: RunResult }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={cn("text-sm font-semibold", ink)}>
        {r.kind === "collapse"
          ? "Collapse"
          : r.kind === "maxed"
            ? "Mine emptied"
            : "Saved"}
        {" · "}
        {r.points} pts
      </span>
      {r.won > 0n && (
        <span className="text-[color:var(--term-green)]">
          +{fmtGoldao(r.won, 2)} GOLDAO to your credit
        </span>
      )}
      {r.lost > 0n && (
        <span className="text-destructive">-{fmtGoldao(r.lost, 2)} GOLDAO</span>
      )}
      {r.jackpotWon > 0n && (
        <span className={DIAMOND_TEXT}>
          Jackpot {fmtGoldao(r.jackpotWon, 2)} GOLDAO
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={cn("text-[10px] uppercase tracking-wider", inkFaint)}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", ink)}>{value}</dd>
    </div>
  );
}
