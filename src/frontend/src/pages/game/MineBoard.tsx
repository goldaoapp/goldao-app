import { EndKind, type EndResult, StakeOption } from "@/backend";
import type { Dashboard, GameConfig } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Pickaxe, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JackpotOverlay } from "./JackpotOverlay";
import { CoinRain } from "./JackpotOverlay";
import {
  AutoPicker,
  BoardMessage,
  CreditBar,
  JackpotCard,
  Legend,
  MineCell,
  MiniStat,
  PayoutStep,
  ResultCard,
  RollingNumber,
  SaveButton,
  StakeSelector,
} from "./MineParts";
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
  eyebrow,
  fmtCountdown,
  gold,
  inkFaint,
  panel,
  panelHeader,
  tokenForPick,
} from "./game-utils";
import { playSound, preloadSounds, useSoundToggle } from "./sounds";
import { errorMessage, useGameAction } from "./useGame";
import { useWallet } from "./useWallet";

const CELLS = 25;
const STAKE_KEYS = [StakeOption.min, StakeOption.mid, StakeOption.max];
const AUTO_STEP_MS = 450;
const RESTORE_ORDER = [
  12, 6, 18, 8, 16, 2, 22, 10, 14, 0, 24, 4, 20, 7, 17, 11, 13, 1, 23, 3,
];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function MineBoard({ dashboard, config }: Props) {
  const { actor, isAuthenticated, login, principalId } = useAuth();
  const { run, refreshAll, setOpenExcavation, setCredit } = useGameAction();
  const wallet = useWallet(dashboard, config);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const board = useBoard();
  const { exc, cells, digging, result, error, notice, jackpot } = board;
  const { muted, toggleMuted } = useSoundToggle();
  const [autoStop, setAutoStop] = useState(3);
  const [autoBusy, setAutoBusy] = useState(false);
  const busyRef = useRef(false);
  const timers = useRef<number[]>([]);

  const table = useMemo(
    () => (config ? config.pointsTable.map(Number) : []),
    [config],
  );
  const fee = config?.feeE8s ?? 1_000_000_000n;
  const stakes = dashboard?.stakes ?? [];
  const paused = !!dashboard?.paused;
  const blocked = !!dashboard?.blocked;
  const credit = dashboard?.credit ?? 0n;
  const excNo = dashboard ? Number(dashboard.stats.excavations) : 0;
  const busy = digging !== null || autoBusy || busyRef.current;
  const locked = busy || jackpot !== null;

  useEffect(() => {
    preloadSounds();
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
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
      setBoard({ exc: open, cells: restored, result: null });
    }
    if (!open && exc && digging === null) setBoard({ exc: null });
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

  const shake = useCallback(() => {
    if (!scope.current) return;
    void animate(
      scope.current,
      { x: [0, -10, 10, -7, 7, -3, 3, 0] },
      { duration: 0.55 },
    );
  }, [animate, scope]);

  // Authorizes the game when the wallet has to back this excavation.
  const authorize = async (stake: bigint): Promise<boolean> => {
    if (credit >= stake) return true;
    const need = stake - credit + fee;
    setBoard({ notice: "Preparing your wallet…" });
    try {
      await wallet.ensureAllowance(need);
      return true;
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      return false;
    } finally {
      setBoard({ notice: null });
    }
  };

  const finish = (end: EndResult, stake: bigint) => {
    setBoard({
      exc: null,
      digging: null,
      result: end,
      skipRestoreUntil: Date.now() + 6000,
    });
    clearBoardCells();
    setOpenExcavation(null);
    if (end.kind === EndKind.collapsed) shake();
    else if (end.won > 0n) playSound("success");
    if (end.gross >= stake * 2n) setBoard((s) => ({ rain: s.rain + 1 }));
    void refreshAll();
  };

  const dig = async (index: number) => {
    if (!actor || busyRef.current || locked || cells[index]) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    if (paused || blocked) return;
    busyRef.current = true;
    setBoard({ error: null });
    try {
      const starting = !exc;
      const stakeAmount = exc ? exc.stake : (stakes[board.stake] ?? 0n);
      if (stakeAmount === 0n) {
        setBoard({ error: "Bets are paused. Try again later." });
        return;
      }
      if (!(await authorize(stakeAmount))) return;
      setBoard((s) => ({
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
      setCredit(res.credit, res.pool);
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
    if (stakeAmount === 0n || paused || blocked) return;
    busyRef.current = true;
    setAutoBusy(true);
    setBoard({ error: null, result: null, cells: {} });
    try {
      if (!(await authorize(stakeAmount))) return;
      const out = await run(
        "auto",
        () => actor.gameAuto(STAKE_KEYS[board.stake], BigInt(autoStop)),
        false,
      );
      const free = Array.from({ length: CELLS }, (_, i) => i).sort(
        () => Math.random() - 0.5,
      );
      await new Promise<void>((resolve) => {
        out.steps.forEach((step, i) => {
          timers.current.push(
            window.setTimeout(
              () => {
                const stage = Number(step.diamond.stage);
                const cell: Cell = step.collapsed
                  ? { kind: "rock" }
                  : stage > 0
                    ? { kind: "diamond" }
                    : { kind: "token", token: tokenForPick(Number(step.pick)) };
                setBoard((s) => ({ cells: { ...s.cells, [free[i]]: cell } }));
                if (step.collapsed) shake();
                else if (stage > 0) playSound("diamond");
                if (i === out.steps.length - 1) resolve();
              },
              (i + 1) * AUTO_STEP_MS,
            ),
          );
        });
        if (out.steps.length === 0) resolve();
      });
      const hit = out.steps.find(
        (s) => Number(s.diamond.stage) >= 3 && s.diamond.won > 0n,
      );
      setCredit(out.end.credit, out.pool);
      finish(out.end, stakeAmount);
      if (hit) {
        setBoard((s) => ({
          jackpot: { stage: 3, won: hit.diamond.won, held: false },
          rain: s.rain + 1,
        }));
      }
    } catch (e) {
      setBoard({ error: errorMessage(e) });
      void refreshAll();
    } finally {
      busyRef.current = false;
      setAutoBusy(false);
    }
  };

  const newGame = () => setBoard({ cells: {}, result: null, error: null });
  const closeJackpot = useCallback(() => setBoard({ jackpot: null }), []);

  const message = (() => {
    if (error) return { text: error, tone: "err" as const };
    if (notice) return { text: notice, tone: "mid" as const };
    if (!isAuthenticated)
      return { text: "Sign in to start digging.", tone: "mid" as const };
    if (blocked)
      return {
        text: "Your account is under review. Contact the admins.",
        tone: "err" as const,
      };
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
    return {
      text: "Pick any cell to start an excavation.",
      tone: "mid" as const,
    };
  })();

  const picks = exc ? Number(exc.picks) : 0;

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

        <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <JackpotOverlay view={jackpot} onClose={closeJackpot} />
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
                  disabled={locked || paused || blocked || !dashboard}
                  idle={!exc && !result}
                  onClick={() => void dig(i)}
                />
              ))}
            </div>
            <BoardMessage text={message.text} tone={message.tone} />
            <SaveButton
              canSave={!!exc?.canSave && !locked}
              onSave={() => void save()}
            />
          </div>

          <div className="flex flex-col gap-4">
            <StakeSelector
              stakes={stakes}
              value={board.stake}
              locked={!!exc || locked}
              paused={paused}
              table={table}
              onChange={(v) => setBoard({ stake: v })}
            />
            <PayoutStep exc={exc} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Picks" value={<RollingNumber value={picks} />} />
              <MiniStat
                label="Diamonds"
                value={<RollingNumber value={exc ? Number(exc.diamonds) : 0} />}
                accent
              />
            </div>
            <JackpotCard pool={dashboard?.pool} />
            <AutoPicker
              value={autoStop}
              disabled={locked || !!exc || paused || blocked || !dashboard}
              busy={autoBusy}
              onChange={setAutoStop}
              onRun={() => void runAuto()}
            />
          </div>
        </div>

        <div className="border-t border-[color:var(--term-border-faint)] px-4 py-4 sm:px-6">
          <Legend />
        </div>
      </div>

      {result && !exc && <ResultCard result={result} onNew={newGame} />}
      <CreditBar dashboard={dashboard} />
      <p className={cn("text-center font-mono text-[11px]", inkFaint)}>
        Playing authorizes the game to charge only your losses from your wallet.
        You can revoke it at any time from your wallet.
      </p>
    </div>
  );
}
