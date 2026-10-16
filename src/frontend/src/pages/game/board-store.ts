import type { AutoStep, EndResult, ExcavationView } from "@/backend";
import { useSyncExternalStore } from "react";
import type { TokenKey } from "./game-utils";

/**
 * Board state kept outside the component so it survives leaving the page and
 * coming back, even with a pick in flight. Cell positions are also saved in the
 * browser so a reload shows the same board; the backend only stores how many
 * picks were made.
 */

export type Cell =
  | { kind: "token"; token: TokenKey }
  | { kind: "diamond" }
  | { kind: "rock" };

/** Biggest jackpot the current excavation found: nothing, a mini jackpot (two diamonds) or the full one. */
export type JackpotKind = "none" | "mini" | "full";

export interface JackpotView {
  stage: number;
  won: bigint;
  held: boolean;
}

/** Credit and pool known to the backend but not shown yet (a jackpot is being revealed). */
export interface HeldBalance {
  credit: bigint;
  pool: bigint;
}

/** A big win (Treasure) waiting to be celebrated. gross includes the stake. */
export interface TreasureView {
  gross: bigint;
  won: bigint;
  points: number;
}

export interface AutoView {
  steps: AutoStep[];
  index: number;
  end: EndResult;
}

export interface BoardState {
  owner: string | null;
  exc: ExcavationView | null;
  cells: Record<number, Cell>;
  digging: number | null;
  result: EndResult | null;
  error: string | null;
  notice: string | null;
  /** Stake option remembered between excavations: 0 min, 1 mid, 2 max. */
  stake: 0 | 1 | 2;
  jackpot: JackpotView | null;
  /** Shown on the result card; the backend result does not tell a mini from a full jackpot. */
  jackpotKind: JackpotKind;
  auto: AutoView | null;
  rain: number;
  /** Ignore the backend's open excavation until this time (ms), right after one ends. */
  skipRestoreUntil: number;
  /** While true, refetches keep showing the credit and pool already on screen. */
  hold: boolean;
  /** Balance to show once the jackpot reveal is closed. */
  heldBalance: HeldBalance | null;
  /** Stake of the excavation in play. */
  inPlay: bigint;
  /**
   * Part of the stake that the Accumulated prize on screen does not reflect yet: the backend takes
   * the stake at the first pick, and the screen shows it as spent right away. Cleared when the
   * balance from the backend is applied.
   */
  pendingCharge: bigint;
  /** Treasure celebration to show; kept here so it survives leaving the tab. */
  treasure: TreasureView | null;
  /** A pick, save or auto run is in progress. Kept here so leaving the tab does not unlock the board. */
  working: boolean;
  /** An auto run is in progress (a subset of working). */
  autoRun: boolean;
}

const EMPTY: BoardState = {
  owner: null,
  exc: null,
  cells: {},
  digging: null,
  result: null,
  error: null,
  notice: null,
  stake: 0,
  jackpot: null,
  jackpotKind: "none",
  auto: null,
  rain: 0,
  skipRestoreUntil: 0,
  hold: false,
  heldBalance: null,
  inPlay: 0n,
  pendingCharge: 0n,
  treasure: null,
  working: false,
  autoRun: false,
};

let state: BoardState = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBoard(): BoardState {
  return state;
}

export function setBoard(
  patch: Partial<BoardState> | ((s: BoardState) => Partial<BoardState>),
) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function resetBoard(owner: string | null) {
  state = { ...EMPTY, owner, stake: state.stake };
  for (const l of listeners) l();
}

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, getBoard, getBoard);
}

const STORAGE_KEY = "goldao.game.board";

interface SavedBoard {
  owner: string;
  tournament: string;
  excNo: number;
  cells: Record<number, Cell>;
}

export function saveBoardCells(
  owner: string,
  tournament: bigint,
  excNo: number,
  cells: Record<number, Cell>,
) {
  try {
    const data: SavedBoard = {
      owner,
      tournament: String(tournament),
      excNo,
      cells,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: the board is still kept in memory.
  }
}

export function clearBoardCells() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function loadBoardCells(
  owner: string,
  tournament: bigint,
  excNo: number,
): Record<number, Cell> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedBoard;
    if (
      data.owner !== owner ||
      data.tournament !== String(tournament) ||
      data.excNo !== excNo
    ) {
      return null;
    }
    return data.cells ?? null;
  } catch {
    return null;
  }
}

const RESULT_KEY = "goldao.game.lastResult";

interface SavedResult {
  owner: string;
  tournament: string;
  at: number;
  end: Record<string, string>;
}

/** Remember the last finished excavation in this browser, so a reload still shows how it ended. */
export function saveLastResult(
  owner: string,
  tournament: bigint,
  end: EndResult,
) {
  try {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(end)) flat[k] = String(v);
    const data: SavedResult = {
      owner,
      tournament: String(tournament),
      at: Date.now(),
      end: flat,
    };
    localStorage.setItem(RESULT_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: the result is still on screen.
  }
}

export function clearLastResult() {
  try {
    localStorage.removeItem(RESULT_KEY);
  } catch {
    // Nothing to clear.
  }
}

const RESULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The saved result of this player in this tournament, if it is recent. */
export function loadLastResult(
  owner: string,
  tournament: bigint,
): EndResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SavedResult;
    if (
      d.owner !== owner ||
      d.tournament !== String(tournament) ||
      Date.now() - d.at > RESULT_MAX_AGE_MS
    ) {
      return null;
    }
    const e = d.end;
    return {
      won: BigInt(e.won),
      jackpotWon: BigInt(e.jackpotWon),
      kind: e.kind as EndResult["kind"],
      lost: BigInt(e.lost),
      credit: BigInt(e.credit),
      stake: BigInt(e.stake),
      gross: BigInt(e.gross),
      picks: BigInt(e.picks),
      points: BigInt(e.points),
    };
  } catch {
    return null;
  }
}
