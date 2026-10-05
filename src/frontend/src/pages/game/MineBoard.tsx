import { EndKind, type EndResult, StakeOption } from "@/backend";
import type { Dashboard, GameConfig } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Pickaxe, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinRain, JackpotOverlay } from "./JackpotOverlay";
import {
  AutoPicker,
  BoardMessage,
  CreditBar,
  JackpotCard,
  Legend,
  MineCell,
  PayoutStep,
  ResultCard,
  RunCard,
  StakeSelector,
} from "./MineParts";
import { BoardLoader } from "./Spinner";
import {
  TreasureOverlay,
  isTreasure,
} from "./TreasureOverlay";
import {
  type Cell,
  clearBoardCells,
  getBoard,
  loadBoardCells,
  resetBoard,
  saveBoardCells,
  setBoard,
  useBoard,
} from "./board-store";
import {
  PAYOUT_BPS,
  eyebrow,
  fmtCountdown,
  fmtGoldao,
  gold,
  inkFaint,
  panel,
  panelHeader,
  tokenForPick,
} from "./game-utils";
import { playSound, preloadSounds, useSoundToggle } from "./sounds";
import { errorMessage, useGameAction } from "./useGame";

const CELLS = 25;
/** The board splits after this many cells when a diamond opens the jackpot. */
const SPLIT_AT = 15;
const STAKE_KEYS = [StakeOption.min, StakeOption.mid, StakeOption.max];
const AUTO_STEP_MS = 450;
/** Coins fall from this multiplier up. */
const COIN_MULT = 1.1;
/** A collapse that still pays resets the board after this delay. */
const AUTO_RESET_MS = 5000;
const RESTORE_ORDER = [
  12, 6, 18, 8, 16, 2, 22, 10, 14, 0, 24, 4, 20, 7, 17, 11, 13, 1, 23, 3,
];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function MineBoard({ dashboard }: Props) {
  const { actor, isAuthenticated, isLoading, login, principalId } = useAuth();
  const { run, refreshAll, setOpenExcavation, setCredit } = useGameAction();
  const board = useBoard();
  const { exc, cells, digging, result, error, notice, jackpot, treasure } =
    board;
  const { muted, toggleMuted } = useSoundToggle();
  const [autoStop, setAutoStop] = useState(3);
  const [autoBusy, setAutoBusy] = useState(false);
  const [bandHost, setBandHost] = useState<HTMLDivElement | null>(null);
  const busyRef = useRef(false);
  const jackpotResolve = useRef<(() => void) | null>(null);

  const stakes = dashboard?.stakes ?? [];
  const paused = !!dashboard?.paused;
  const credit = dashboard?.credit ?? 0n;
  const excNo = dashboard ? Number(dashboard.stats.excavations) : 0;
  const busy = digging !== null || autoBusy || busyRef.current;
  const locked = busy || jackpot !== null;
  const booting = isLoading || (isAuthenticated && !dashboard);

  useEffect(() => {
    preloadSounds();
    return () => {
      jackpotResolve.current?.();
      jackpotResolve.current = null;
    };
  }, []);

  useEffect(() => {
    if (getBoard().owner !== principalId) resetBoard(principalId);
  }, [principalId]);

  // Restore an excavation left open (reload, another tab) from the backend.
  const open = dashboard?.open;
  useEffect(() => {
    if (!dashboard || busyRef.current || autoBusy) return;
    if (board.owner !== principalId || !principalId) return;
    if (Date.now() < board.skipRestoreUntil) return;
    if (open && !exc) {
      const picks = Number(open.picks);
      const saved =
        loadBoardCells(principalId, dashboard.tournament, excNo) ?? {};
      const restored: Record<number, Cell> = { ...saved };
      let n = Object.keys(saved).length;
      for (const idx of RESTORE_ORDER) {
        if (n >= picks) break;
        if (restored[idx]) continue;
        n += 1;
        restored[idx] = { kind: "token", token: tokenForPick(n) };
      }
      setBoard({
        exc: open,
        cells: restored,
        result: null,
        inPlay: open.stake,
      });
    }
    if (!open && exc && digging === null) setBoard({ exc: null, inPlay: 0n });
  }, [
    dashboard,
    open,
    exc,
    digging,
    excNo,
    principalId,
    board.owner,
    board.skipRestoreUntil,
    autoBusy,
  ]);

  // A collapse that still pays shows the green result, then clears the board.
  useEffect(() => {
    if (!result || exc) return;
    if (result.kind !== EndKind.collapsed || result.won <= 0n) return;
    const t = window.setTimeout(
      () => setBoard({ cells: {}, result: null, error: null }),
      AUTO_RESET_MS,
    );
    return () => window.clearTimeout(t);
  }, [result, exc]);

  // The stake is always covered by To collect: the wallet is only used to load it.
  const coversStake = (stake: bigint): boolean => {
    if (credit >= stake) return true;
    setBoard({
      error: `Load at least ${fmtGoldao(stake - credit)} GOLDAO into To collect to start.`,
    });
    return false;
  };

  const finish = (end: EndResult, stake: bigint) => {
    setBoard({
      exc: null,
      inPlay: 0n,
      digging: null,
      result: end,
      skipRestoreUntil: Date.now() + 6000,
    });
    clearBoardCells();
    setOpenExcavation(null);
    const treasureWin = end.won > 0n && isTreasure(Number(end.points));
    if (end.kind === EndKind.collapsed) playSound("collapse");
    else if (end.won > 0n && !treasureWin) playSound("success");
    if (end.gross >= stake * 2n) setBoard((s) => ({ rain: s.rain + 1 }));
    if (treasureWin) {
      setBoard({
        treasure: {
          gross: end.gross,
          won: end.won,
          points: Number(end.points),
        },
      });
    }
    void refreshAll();
  };

  const dig = async (index: number) => {
    if (!actor || busyRef.current || locked || cells[index]) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    if (paused) return;
    busyRef.current = true;
    setBoard({ error: null });
    try {
      const starting = !exc;
      const stakeAmount = exc ? exc.stake : (stakes[board.stake] ?? 0n);
      if (stakeAmount === 0n) {
        setBoard({ error: "Bets are paused. Try again later." });
        return;
      }
      if (!coversStake(stakeAmount)) return;
      setBoard((s) => ({
        inPlay: stakeAmount,
        digging: index,
        cells: starting ? {} : s.cells,
        result: null,
      }));
      const res = await run(
        "pick",
        () => actor.gamePick(starting ? STAKE_KEYS[board.stake] : null),
        false,
      );
      const picks = Number(res.picks);
      const stage = Number(res.diamond.stage);
      const cell: Cell = res.collapsed
        ? { kind: "rock" }
        : stage > 0
          ? { kind: "diamond" }
          : { kind: "token", token: tokenForPick(picks) };
      setBoard((s) => ({ cells: { ...s.cells, [index]: cell } }));
      // A jackpot is revealed slot by slot: keep the old balance on screen until it closes.
      if (stage >= 3 && res.diamond.won > 0n) {
        setBoard({
          hold: true,
          heldBalance: { credit: res.credit, pool: res.pool },
        });
      } else {
        setCredit(res.credit, res.pool);
      }
      if (!res.collapsed) playSound(stage > 0 ? "diamond" : "success");
      if (stage > 0) {
        setBoard({
          jackpot: {
            stage,
            won: res.diamond.won,
            held: (res.excavation?.held ?? 0n) > 0n,
          },
        });
        if (stage >= 3 && res.diamond.won > 0n) {
          setBoard((s) => ({ rain: s.rain + 1 }));
        }
      }
      if (res.end) {
        finish(res.end, stakeAmount);
      } else {
        setBoard({ exc: res.excavation ?? null });
        if (res.excavation) setOpenExcavation(res.excavation);
        if (
          res.excavation &&
          (Number(res.excavation.runPoints) * PAYOUT_BPS) / 1_000_000 >
            COIN_MULT
        ) {
          setBoard((s) => ({ rain: s.rain + 1 }));
        }
        if (principalId && dashboard) {
          saveBoardCells(
            principalId,
            dashboard.tournament,
            starting ? excNo : excNo,
            getBoard().cells,
          );
        }
      }
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      void refreshAll();
    } finally {
      busyRef.current = false;
      setBoard({ digging: null });
      if (!getBoard().exc) setBoard({ inPlay: 0n });
    }
  };

  const save = async () => {
    if (!actor || !exc?.canSave || busyRef.current) return;
    busyRef.current = true;
    setBoard({ error: null });
    try {
      const end = await run("save", () => actor.gameSave(), false);
      setCredit(end.credit, dashboard?.pool ?? 0n);
      finish(end, exc.stake);
    } catch (e) {
      setBoard({ error: errorMessage(e) });
    } finally {
      busyRef.current = false;
    }
  };

  const runAuto = async () => {
    if (!actor || busyRef.current || locked || exc) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    const stakeAmount = stakes[board.stake] ?? 0n;
    if (stakeAmount === 0n || paused) return;
    busyRef.current = true;
    setAutoBusy(true);
    setBoard({
      error: null,
      result: null,
      cells: {},
      hold: true,
      inPlay: stakeAmount,
    });
    try {
      if (!coversStake(stakeAmount)) return;
      const out = await run(
        "auto",
        () => actor.gameAuto(STAKE_KEYS[board.stake], BigInt(autoStop)),
        false,
      );
      const free = Array.from({ length: CELLS }, (_, i) => i).sort(
        () => Math.random() - 0.5,
      );
      for (let i = 0; i < out.steps.length; i++) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, AUTO_STEP_MS),
        );
        const step = out.steps[i];
        const stage = Number(step.diamond.stage);
        const cell: Cell = step.collapsed
          ? { kind: "rock" }
          : stage > 0
            ? { kind: "diamond" }
            : { kind: "token", token: tokenForPick(Number(step.pick)) };
        setBoard((s) => ({ cells: { ...s.cells, [free[i]]: cell } }));
        if (step.collapsed) playSound("collapse");
        else playSound(stage > 0 ? "diamond" : "success");
        if (stage > 0) {
          // The auto run waits here until the player opens the three slots.
          await new Promise<void>((resolve) => {
            jackpotResolve.current = resolve;
            setBoard({
              jackpot: { stage, won: step.diamond.won, held: false },
            });
            if (stage >= 3 && step.diamond.won > 0n) {
              setBoard((s) => ({ rain: s.rain + 1 }));
            }
          });
        }
      }
      setCredit(out.end.credit, out.pool);
      finish(out.end, stakeAmount);
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      void refreshAll();
    } finally {
      busyRef.current = false;
      setAutoBusy(false);
      setBoard({ hold: false });
      if (!getBoard().exc) setBoard({ inPlay: 0n });
    }
  };

  const newGame = () => setBoard({ cells: {}, result: null, error: null });
  const closeJackpot = useCallback(() => {
    const held = getBoard().heldBalance;
    setBoard({ jackpot: null });
    if (held) {
      // Now the new balance can roll up on screen.
      setCredit(held.credit, held.pool);
      setBoard({ hold: false, heldBalance: null });
      void refreshAll();
    }
    jackpotResolve.current?.();
    jackpotResolve.current = null;
  }, [setCredit, refreshAll]);
  const closeTreasure = useCallback(() => setBoard({ treasure: null }), []);

  const message = (() => {
    if (error) return { text: error, tone: "err" as const };
    if (notice) return { text: notice, tone: "mid" as const };
    if (!isAuthenticated)
      return { text: "Sign in to start digging.", tone: "mid" as const };
    if (paused)
      return {
        text: "Bets are paused. Try again later.",
        tone: "err" as const,
      };
    if (busy) return { text: "Digging…", tone: "mid" as const };
    if (exc && Number(exc.picks) < 2)
      return {
        text: "The first two picks are always safe.",
        tone: "mid" as const,
      };
    if (exc)
      return {
        text: "Keep digging or save your points.",
        tone: "mid" as const,
      };
    if (dashboard && credit < (stakes[board.stake] ?? 0n))
      return {
        text: "Load credit into To collect to start digging.",
        tone: "mid" as const,
      };
    return {
      text: "Pick any cell to start an excavation.",
      tone: "mid" as const,
    };
  })();

  const idle = !exc && !result && !locked;
  const split = jackpot !== null;

  const renderCell = (i: number) => (
    <MineCell
      key={i}
      cell={cells[i]}
      digging={digging === i}
      disabled={locked || paused || !dashboard}
      onClick={() => void dig(i)}
    />
  );
  const indexes = Array.from({ length: CELLS }, (_, i) => i);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(panel, "relative overflow-hidden")}>
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
              className={cn(
                "whitespace-nowrap font-mono text-[11px]",
                inkFaint,
              )}
            >
              {dashboard
                ? `Tournament #${Number(dashboard.tournament)} · ${fmtCountdown(dashboard.endsAt)}`
                : ""}
            </span>
            <button
              type="button"
              onClick={toggleMuted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
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

        <div className="relative p-2.5 sm:p-6">
          <JackpotOverlay
            view={jackpot}
            onClose={closeJackpot}
            bandHost={bandHost}
            pool={dashboard?.pool}
          />
          <TreasureOverlay
            view={jackpot ? null : treasure}
            onClose={closeTreasure}
          />
          <AnimatePresence>
            {board.rain > 0 && !jackpot && (
              <motion.div
                key={board.rain}
                className="pointer-events-none absolute inset-0 z-20"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 3.4 }}
              >
                <CoinRain seed={board.rain} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-y-10">
            {/* Board */}
            <div className="relative col-span-2 mx-auto w-full max-w-[460px] md:col-span-1 md:col-start-1 md:row-start-1 md:mx-0">
              {booting && <BoardLoader />}
              {idle && !booting && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-[3] rounded-lg bg-[linear-gradient(115deg,transparent_42%,oklch(0.74_0.14_80/0.2)_50%,transparent_58%)] bg-[length:250%_100%] bg-no-repeat"
                  initial={{ backgroundPositionX: "130%" }}
                  animate={{ backgroundPositionX: "-30%" }}
                  transition={{
                    duration: 4.5,
                    ease: "linear",
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                />
              )}
              <div
                className={cn(
                  "grid grid-cols-5 gap-1.5 transition-[transform,opacity] duration-700 sm:gap-2.5",
                  split && "-translate-y-1.5 opacity-40",
                )}
              >
                {indexes.slice(0, SPLIT_AT).map(renderCell)}
              </div>
              <div ref={setBandHost} />
              <div
                className={cn(
                  "mt-1.5 grid grid-cols-5 gap-1.5 transition-[transform,opacity] duration-700 sm:mt-2.5 sm:gap-2.5",
                  split && "translate-y-1.5 opacity-40",
                )}
              >
                {indexes.slice(SPLIT_AT).map(renderCell)}
              </div>
              {result && !exc && !treasure && <ResultCard result={result} onNew={newGame} />}
              <BoardMessage
                text={message.text}
                tone={message.tone}
                className="mt-1 md:absolute md:inset-x-0 md:top-[calc(100%+4px)] md:mt-0"
              />
            </div>

            {/* Winning now, multiplier, next pick and save */}
            <RunCard
              exc={exc}
              canSave={!!exc?.canSave && !locked}
              onSave={() => void save()}
              className="col-span-2 md:col-span-1 md:col-start-1 md:row-start-2"
            />

            <CreditBar
              dashboard={dashboard}
              className="col-span-1 md:col-start-2 md:row-start-2"
            />
            <JackpotCard pool={dashboard?.pool} className="md:hidden" />

            {/* Stake, progress and extras */}
            <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-1 md:col-start-2 md:row-start-1 md:flex md:flex-col md:justify-between md:gap-2.5">
              <PayoutStep exc={exc} />
              <JackpotCard pool={dashboard?.pool} className="hidden md:flex" />
              <div className="col-span-2">
                <StakeSelector
                  stakes={stakes}
                  value={board.stake}
                  locked={!!exc || locked}
                  paused={paused}
                  onChange={(v) => setBoard({ stake: v })}
                />
              </div>
              <div className="col-span-2">
                <AutoPicker
                  value={autoStop}
                  disabled={locked || !!exc || paused || !dashboard}
                  busy={autoBusy}
                  onChange={setAutoStop}
                  onRun={() => void runAuto()}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[color:var(--term-border-faint)] px-4 py-4 sm:px-6">
          <Legend />
        </div>
      </div>

      <p className={cn("text-center font-mono text-[11px]", inkFaint)}>
        Your stake leaves To collect when you start digging. Every prize shown
        includes your stake, and the balance is paid when the tournament
        closes.
      </p>
    </div>
  );
}
