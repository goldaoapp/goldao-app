import type { ExcavationView } from "@/backend";
import { useSyncExternalStore } from "react";
import type { TokenKey } from "./game-utils";

/**
 * State of the mine board, kept outside the component so it survives leaving the
 * page (other tab, other menu) and coming back, even with a pick still in flight.
 * The cell positions are also saved in the browser so a full reload shows the
 * same board. The backend only stores how many picks were made, not where.
 */

export type Cell =
  | { kind: "token"; token: TokenKey }
  | { kind: "diamond" }
  | { kind: "rock" };

export type RunResult = {
  kind: "saved" | "collapse" | "emptied";
  points: number;
};

export interface BoardState {
  owner: string | null;
  exc: ExcavationView | null;
  cells: Record<number, Cell>;
  digging: number | null;
  result: RunResult | null;
  error: string | null;
  /** Ignore the backend's open excavation until this time (ms), right after one ends. */
  skipRestoreUntil: number;
}

const EMPTY: BoardState = {
  owner: null,
  exc: null,
  cells: {},
  digging: null,
  result: null,
  error: null,
  skipRestoreUntil: 0,
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

/** Clears the board for a different signed-in principal (or sign out). */
export function resetBoard(owner: string | null) {
  state = { ...EMPTY, owner };
  for (const l of listeners) l();
}

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, getBoard, getBoard);
}

// Saved cell positions (browser only), so a reload restores the same board.

const STORAGE_KEY = "goldao.game.board";

interface SavedBoard {
  owner: string;
  chipId: string;
  /** Excavations the chip had already finished when this one started. */
  excNo: number;
  cells: Record<number, Cell>;
}

export function saveBoardCells(
  owner: string,
  chipId: bigint,
  excNo: number,
  cells: Record<number, Cell>,
) {
  try {
    const data: SavedBoard = { owner, chipId: String(chipId), excNo, cells };
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

/** Saved cells for this exact excavation, or null when they belong to another one. */
export function loadBoardCells(
  owner: string,
  chipId: bigint,
  excNo: number,
): Record<number, Cell> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedBoard;
    if (
      data.owner !== owner ||
      data.chipId !== String(chipId) ||
      data.excNo !== excNo
    ) {
      return null;
    }
    return data.cells ?? null;
  } catch {
    return null;
  }
}
