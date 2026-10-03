import type { ExcavationView } from "@/backend";
import { useSyncExternalStore } from "react";
import type { TokenKey } from "./game-utils";

export type Cell =
  | { kind: "token"; token: TokenKey }
  | { kind: "diamond" }
  | { kind: "rock" };

export type RunResult = {
  kind: "saved" | "collapse" | "maxed";
  points: number;
  won: bigint;
  lost: bigint;
  jackpotWon: bigint;
};

export interface BoardState {
  owner: string | null;
  exc: ExcavationView | null;
  cells: Record<number, Cell>;
  digging: number | null;
  result: RunResult | null;
  error: string | null;
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

export function resetBoard(owner: string | null) {
  state = { ...EMPTY, owner };
  for (const l of listeners) l();
}

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, getBoard, getBoard);
}
