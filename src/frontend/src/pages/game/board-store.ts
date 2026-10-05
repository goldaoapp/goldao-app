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
  auto: AutoView | null;
  rain: number;
  /** Ignore the backend's open excavation until this time (ms), right after one ends. */
  skipRestoreUntil: number;
  /** While true, refetches keep showing the credit and pool already on screen. */
  hold: boolean;
  /** Balance to show once the jackpot reveal is closed. */
  heldBalance: HeldBalance | null;
  /** Stake of the excavation in play. To collect shows it as already spent. */
  inPlay: bigint;
  /** Treasure celebration to show; kept here so it survives leaving the tab. */
  treasure: TreasureView | null;
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
  auto: null,
  rain: 0,
  skipRestoreUntil: 0,
  hold: false,
  heldBalance: null,
  inPlay: 0n,
  treasure: null,
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
