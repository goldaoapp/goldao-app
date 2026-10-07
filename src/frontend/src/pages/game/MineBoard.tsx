import { EndKind, type EndResult, StakeOption } from "@/backend";
import type { Dashboard, GameConfig } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Pickaxe, Volume2, VolumeX } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinRain, JackpotOverlay } from "./JackpotOverlay";
import {
  AutoPicker,
  BoardMessage,
  type CellPop,
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
import { TreasureOverlay, isTreasure } from "./TreasureOverlay";
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
  fmtMult,
  fmtMultOf,
  gold,
  inkFaint,
  multX100,
  panel,
  panelHeader,
  tokenForPick,
} from "./game-utils";
import {
  playSound,
  preloadSounds,
  revealSound,
  useSoundToggle,
} from "./sounds";
import { errorMessage, useGameAction, useGameConfig } from "./useGame";

const CELLS = 25;
/** The board splits after this many cells when a diamond opens the jackpot. */
const SPLIT_AT = 15;
const STAKE_KEYS = [StakeOption.min, StakeOption.mid, StakeOption.max];
const AUTO_STEP_MS = 450;
/** Start of the backend message sent when the open excavation is not the one on screen. */
const EXC_CHANGED = "Your excavation changed";
/** Coins fall from this multiplier up. */
const COIN_MULT_X100 = 110;
/** A collapse that still pays resets the board after this delay. */
const AUTO_RESET_MS = 5000;
/** The coin shower is removed from the page after this time. */
const RAIN_MS = 4200;
const RESTORE_ORDER = [
  12, 6, 18, 8, 16, 2, 22, 10, 14, 0, 24, 4, 20, 7, 17, 11, 13, 1, 23, 3,
];

/**
 * Cells for an excavation with `picks` picks: keeps the ones already known (up to `picks`) and
 * fills the missing ones with plain tokens, because the backend only stores how many picks were made.
 */
function fillCells(
  known: Record<number, Cell>,
  picks: number,
): Record<number, Cell> {
  const out: Record<number, Cell> = {};
  let n = 0;
  for (const key of Object.keys(known)) {
    if (n >= picks) break;
    out[Number(key)] = known[Number(key)];
    n += 1;
  }
  for (const idx of RESTORE_ORDER) {
    if (n >= picks) break;
    if (out[idx]) continue;
    n += 1;
    out[idx] = { kind: "token", token: tokenForPick(n) };
  }
  return out;
}

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function MineBoard({ dashboard }: Props) {
  const { actor, isAuthenticated, isLoading, login, principalId } = useAuth();
  const { run, refreshAll, setOpenExcavation, setCredit } = useGameAction();
  const board = useBoard();
  const {
    exc,
    cells,
    digging,
    result,
    error,
    notice,
    jackpot,
    treasure,
    working,
    autoRun,
  } = board;
  const { muted, toggleMuted } = useSoundToggle();
  const [autoStop, setAutoStop] = useState(3);
  const [bandHost, setBandHost] = useState<HTMLDivElement | null>(null);
  const jackpotResolve = useRef<(() => void) | null>(null);
  const reduceMotion = useReducedMotion();
  // Counts the times a fresh board was loaded (first visit, new game). Above 0 the board
  // "descends" into place and the cells rise one row after another.
  const [enterNo, setEnterNo] = useState(0);
  const descentCtl = useAnimationControls();
  const shakeCtl = useAnimationControls();
  // Multiplier of the pick just revealed, floating up from its cell for a moment.
  const [pop, setPop] = useState<CellPop | null>(null);
  // The coin shower plays once per new `board.rain` value seen while this view is mounted. The
  // counter lives in the board store, so coming back to the tab must not replay an old shower.
  const seenRain = useRef(board.rain);
  const [rainSeed, setRainSeed] = useState(0);

  const { data: config } = useGameConfig();
  const payoutBps = config ? Number(config.payoutBps) : PAYOUT_BPS;
  const stakes = dashboard?.stakes ?? [];
  // With the fund under its floor no new excavation can start, but one already open can be
  // finished (the backend allows it), so the board stays usable for it.
  const paused = !!dashboard?.paused && !exc && !dashboard?.open;
  const credit = dashboard?.credit ?? 0n;
  const excNo = dashboard ? Number(dashboard.stats.excavations) : 0;
  const busy = digging !== null || autoRun || working;
  const locked = busy || jackpot !== null;
  const booting = isLoading || (isAuthenticated && !dashboard);

  useEffect(() => {
    preloadSounds();
    return () => {
      jackpotResolve.current?.();
      jackpotResolve.current = null;
    };
  }, []);

  // First visit: the board descends into place, unless an excavation is being restored.
  const entered = useRef(false);
  useEffect(() => {
    if (booting || entered.current) return;
    entered.current = true;
    if (Object.keys(getBoard().cells).length === 0) setEnterNo((n) => n + 1);
  }, [booting]);
  // A used board that gets cleared (new game, automatic reset) is replaced by a fresh one. Not
  // while a pick or an auto dig is under way: that board is already in use.
  const cellCount = Object.keys(cells).length;
  const prevCellCount = useRef(cellCount);
  useEffect(() => {
    const was = prevCellCount.current;
    prevCellCount.current = cellCount;
    if (was === 0 || cellCount > 0 || booting) return;
    const b = getBoard();
    if (b.digging === null && !b.autoRun) setEnterNo((n) => n + 1);
  }, [cellCount, booting]);
  useEffect(() => {
    if (enterNo === 0 || reduceMotion) return;
    playSound("enter");
    void descentCtl.start({
      y: [110, 0],
      opacity: [0, 1, 1],
      transition: {
        duration: 1.3,
        ease: [0.2, 0.8, 0.2, 1],
        opacity: { times: [0, 0.5, 1] },
      },
    });
  }, [enterNo, reduceMotion, descentCtl]);
  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => setPop(null), 1900);
    return () => window.clearTimeout(t);
  }, [pop]);
  const shakeBoard = useCallback(() => {
    if (reduceMotion) return;
    void shakeCtl.start({
      x: [0, -4, 4, -2, 0],
      y: [0, 3, -3, 2, 0],
      transition: { duration: 0.22 },
    });
  }, [reduceMotion, shakeCtl]);

  useEffect(() => {
    if (getBoard().owner !== principalId) resetBoard(principalId);
  }, [principalId]);

  // Start a shower when the counter went up and no jackpot is covering the board; remove it
  // from the page when it is over so nothing stays floating.
  useEffect(() => {
    if (jackpot || board.rain === seenRain.current) return;
    seenRain.current = board.rain;
    setRainSeed(board.rain);
  }, [board.rain, jackpot]);
  useEffect(() => {
    if (rainSeed === 0) return;
    const t = window.setTimeout(() => setRainSeed(0), RAIN_MS);
    return () => window.clearTimeout(t);
  }, [rainSeed]);

  // Keeps the board in step with the backend's open excavation: restores it after a reload or
  // from another tab, and rebuilds it when the backend is further along than the screen (a pick
  // that timed out, an action from another tab). A cache that is behind never rewinds the board;
  // the next pick is checked by the backend itself (expectedPicks).
  const open = dashboard?.open;
  // Tournament an on-screen excavation belongs to, to tell a close from a finish elsewhere.
  const excTournament = useRef<number | null>(null);
  useEffect(() => {
    if (!exc) excTournament.current = null;
    else if (excTournament.current === null && dashboard)
      excTournament.current = Number(dashboard.tournament);
  }, [exc, dashboard]);
  useEffect(() => {
    if (!dashboard || working || getBoard().working || autoRun) return;
    if (board.owner !== principalId || !principalId) return;
    if (Date.now() < board.skipRestoreUntil) return;
    if (open && (!exc || Number(open.picks) > Number(exc.picks))) {
      const base = exc
        ? cells
        : (loadBoardCells(principalId, dashboard.tournament, excNo) ?? {});
      setBoard({
        exc: open,
        cells: fillCells(base, Number(open.picks)),
        result: null,
        inPlay: open.stake,
      });
    }
    if (!open && exc && digging === null) {
      // The excavation is gone. If a new tournament started meanwhile, the close settled it
      // (saved to the Accumulated prize when it could be): say so instead of silently clearing the board.
      const closed =
        excTournament.current !== null &&
        excTournament.current !== Number(dashboard.tournament);
      setBoard({
        exc: null,
        inPlay: 0n,
        notice: closed
          ? "The tournament closed. Your excavation was settled: check your Accumulated prize."
          : null,
      });
    }
  }, [
    dashboard,
    open,
    exc,
    cells,
    digging,
    excNo,
    principalId,
    board.owner,
    board.skipRestoreUntil,
    autoRun,
    working,
  ]);

  // A collapse that still pays shows the green result, then clears the board. Only while the
  // card is really on screen: not behind a jackpot or Treasure celebration, and never after a
  // jackpot (that card stays until the player closes it).
  useEffect(() => {
    if (!result || exc || treasure || jackpot) return;
    if (result.kind !== EndKind.collapsed || result.won <= 0n) return;
    if (result.jackpotWon > 0n) return;
    const t = window.setTimeout(
      () => setBoard({ cells: {}, result: null, error: null }),
      AUTO_RESET_MS,
    );
    return () => window.clearTimeout(t);
  }, [result, exc, treasure, jackpot]);

  // The stake is always covered by the Accumulated prize: the wallet is only used to load it.
  const coversStake = (stake: bigint): boolean => {
    if (credit >= stake) return true;
    setBoard({
      error: `Load at least ${fmtGoldao(stake - credit)} GOLDAO of balance to start.`,
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
    void setOpenExcavation(null);
    // One celebration at a time: a jackpot already had its own, so no Treasure on top of it.
    const treasureWin =
      end.won > 0n &&
      end.jackpotWon === 0n &&
      end.kind !== EndKind.collapsed &&
      isTreasure(Number(end.picks));
    if (end.kind === EndKind.collapsed) playSound("collapse");
    else if (end.won > 0n && end.jackpotWon === 0n && !treasureWin)
      playSound("success");
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
    if (!actor || getBoard().working || locked || cells[index]) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    if (paused) return;
    setBoard({ working: true, error: null, notice: null });
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
        () =>
          actor.gamePick(
            starting ? STAKE_KEYS[board.stake] : null,
            stakeAmount,
            exc ? exc.picks : 0n,
          ),
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
        void setCredit(res.credit, res.pool);
      }
      if (!res.collapsed) {
        playSound(stage > 0 ? "diamond" : revealSound(picks));
        const gross = res.excavation?.runGross ?? res.end?.gross;
        if (gross !== undefined)
          setPop({
            index,
            text: fmtMultOf(gross, stakeAmount),
            id: Date.now(),
          });
      }
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
        // Awaited: the cache must hold this excavation before the board is released, or the
        // sync effect would see "no open excavation" and clear the board.
        if (res.excavation) await setOpenExcavation(res.excavation);
        if (
          res.excavation &&
          multX100(Number(res.excavation.runPoints), payoutBps) > COIN_MULT_X100
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
      const m = errorMessage(e);
      setBoard({ error: m });
      await refreshAll();
      // Another tab or device moved the excavation on: rebuild the board from the backend.
      if (m.startsWith(EXC_CHANGED)) {
        clearBoardCells();
        setBoard({ exc: null, cells: {}, inPlay: 0n, skipRestoreUntil: 0 });
      }
    } finally {
      setBoard({ working: false, digging: null });
      if (!getBoard().exc) setBoard({ inPlay: 0n });
    }
  };

  const save = async () => {
    if (!actor || !exc?.canSave || getBoard().working) return;
    setBoard({ working: true, error: null });
    try {
      const end = await run("save", () => actor.gameSave(), false);
      void setCredit(end.credit, dashboard?.pool ?? 0n);
      finish(end, exc.stake);
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      void refreshAll();
    } finally {
      setBoard({ working: false });
    }
  };

  const runAuto = async () => {
    if (!actor || getBoard().working || locked || exc) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    const stakeAmount = stakes[board.stake] ?? 0n;
    if (stakeAmount === 0n || paused) return;
    setBoard({
      working: true,
      autoRun: true,
      error: null,
      notice: null,
      result: null,
      cells: {},
      hold: true,
      inPlay: stakeAmount,
    });
    try {
      if (!coversStake(stakeAmount)) return;
      const out = await run(
        "auto",
        () =>
          actor.gameAuto(
            STAKE_KEYS[board.stake],
            BigInt(autoStop),
            stakeAmount,
          ),
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
        // A collapse sound is played once by finish(), not per step.
        if (!step.collapsed) {
          playSound(stage > 0 ? "diamond" : revealSound(Number(step.pick)));
          const points = config?.pointsTable[Number(step.pick)];
          if (points !== undefined)
            setPop({
              index: free[i],
              text: fmtMult(Number(points), payoutBps),
              id: Date.now(),
            });
        }
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
      void setCredit(out.end.credit, out.pool);
      finish(out.end, stakeAmount);
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      void refreshAll();
    } finally {
      setBoard({ working: false, autoRun: false, hold: false });
      if (!getBoard().exc) setBoard({ inPlay: 0n });
    }
  };

  const newGame = () =>
    setBoard({ cells: {}, result: null, error: null, notice: null });
  const closeJackpot = useCallback(() => {
    const held = getBoard().heldBalance;
    setBoard({ jackpot: null });
    if (held) {
      // Now the new balance can roll up on screen.
      void setCredit(held.credit, held.pool);
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
    if (dashboard && credit < (stakes[board.stake] ?? 0n))
      return {
        text: "Load balance to start digging.",
        tone: "mid" as const,
      };
    return null;
  })();

  const idle = !exc && !result && !locked;
  const split = jackpot !== null;

  const renderCell = (i: number) => (
    <MineCell
      key={`${i}-${enterNo}`}
      cell={cells[i]}
      enterNo={enterNo}
      enterDelay={Math.floor(i / 5) * 0.14 + (i % 5) * 0.02}
      pop={pop?.index === i ? pop : null}
      onStrike={shakeBoard}
      digging={digging === i}
      disabled={locked || paused || !dashboard}
      onClick={() => void dig(i)}
    />
  );
  const indexes = Array.from({ length: CELLS }, (_, i) => i);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(panel, "relative overflow-clip")}>
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
            {rainSeed > 0 && !jackpot && (
              <motion.div
                key={rainSeed}
                className="pointer-events-none absolute inset-0 z-20"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 3.4 }}
              >
                <CoinRain seed={rainSeed} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-y-4">
            {/* Board */}
            <div className="relative order-2 col-span-2 mx-auto w-full max-w-[460px] md:order-none md:col-span-1 md:col-start-1 md:row-start-1 md:mx-0 md:mb-5">
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
              {enterNo > 0 && !reduceMotion && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-1.5 z-[1] overflow-hidden rounded-xl"
                >
                  <motion.div
                    key={enterNo}
                    className="absolute inset-x-0 -inset-y-24 bg-[repeating-linear-gradient(180deg,rgba(120,90,50,.28)_0_34px,rgba(176,136,48,.3)_34px_52px,transparent_52px_70px,rgba(120,90,50,.28)_70px_96px)] dark:bg-[repeating-linear-gradient(180deg,rgba(0,0,0,.55)_0_34px,rgba(199,154,59,.2)_34px_52px,transparent_52px_70px,rgba(0,0,0,.55)_70px_96px)]"
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -96 }}
                    transition={{
                      duration: 1.5,
                      ease: [0.5, 0, 0.2, 1],
                      opacity: { times: [0, 0.2, 0.8, 1] },
                    }}
                  />
                </div>
              )}
              <motion.div animate={descentCtl} className="relative z-[2]">
                <motion.div animate={shakeCtl}>
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
                </motion.div>
              </motion.div>
              {result && !exc && !treasure && !jackpot && (
                <ResultCard result={result} onNew={newGame} />
              )}
              {message && (
                <BoardMessage
                  text={message.text}
                  tone={message.tone}
                  className="mt-1 md:absolute md:inset-x-0 md:top-[calc(100%+4px)] md:mt-0"
                />
              )}
            </div>

            {/* Next pick, jackpot and setup: one column from md up, flattened into the page order below md */}
            <div className="contents md:col-start-2 md:row-start-1 md:flex md:flex-col md:gap-3">
              <PayoutStep
                exc={exc}
                className="order-1 col-span-2 md:order-none"
              />
              <JackpotCard
                pool={dashboard?.pool}
                className="order-3 col-span-2 md:order-none md:flex-1"
              />
              {/* Stake and auto dig share one card. No stake options while the fund is under
                  its floor, but an open excavation can still be finished, so the "paused"
                  notice is not shown over it. */}
              <div className="order-4 col-span-2 flex flex-col gap-2.5 rounded-xl border border-[color:var(--term-border)] bg-[var(--term-alt)] p-2.5 md:order-none">
                {(stakes.length === 3 || !exc) && (
                  <StakeSelector
                    stakes={stakes}
                    value={board.stake}
                    locked={!!exc || locked}
                    paused={paused}
                    onChange={(v) => setBoard({ stake: v })}
                  />
                )}
                <AutoPicker
                  value={autoStop}
                  disabled={locked || !!exc || paused || !dashboard}
                  busy={autoRun}
                  onChange={setAutoStop}
                  onRun={() => void runAuto()}
                />
              </div>
            </div>

            <CreditBar
              dashboard={dashboard}
              className="order-5 col-span-2 md:order-none md:col-span-1 md:col-start-2 md:row-start-2"
            />

            {/* Prize now and Save: a card under the board on desktop, a dock above the tab bar on mobile */}
            <RunCard
              exc={exc}
              canSave={!!exc?.canSave && !locked}
              onSave={() => void save()}
              className="sticky bottom-[calc(3.4rem+max(env(safe-area-inset-bottom,0px),0.5rem))] z-30 order-6 col-span-2 -mx-2.5 sm:-mx-6 md:static md:order-none md:mx-0 md:col-span-1 md:col-start-1 md:row-start-2"
            />
          </div>
        </div>

        <div className="border-t border-[color:var(--term-border-faint)] px-4 py-4 sm:px-6">
          <Legend />
        </div>
      </div>

      <p className={cn("text-center font-mono text-[11px]", inkFaint)}>
        Your stake leaves your Accumulated prize when you start digging. Every
        prize shown includes your stake, and the balance is paid when the
        tournament closes.
      </p>
    </div>
  );
}
