/**
 * Detects that someone won a jackpot, from the public pool alone.
 *
 * The pool only grows (every excavation adds to it) unless a jackpot is paid: a full jackpot
 * reseeds it and a mini jackpot takes a share of it. So a lower pool than the one seen before
 * means a win. The backend stays the only source of the number; this file only compares two
 * values it handed out.
 */

/** Two readings further apart than this tell nothing (a background tab stops polling). */
export const MAX_GAP_MS = 45_000;

interface Reading {
  tournament: bigint;
  pool: bigint;
  at: number;
}

let last: Reading | null = null;

/** Pure rule: did the pool fall between two readings of the same tournament, close in time? */
export function poolFell(prev: Reading | null, next: Reading): boolean {
  return (
    prev !== null &&
    prev.tournament === next.tournament &&
    next.at - prev.at <= MAX_GAP_MS &&
    next.pool < prev.pool
  );
}

/** Feed every pool reading from the server. True when it shows that a jackpot was paid. */
export function observePool(reading: Reading): boolean {
  const fell = poolFell(last, reading);
  last = reading;
  return fell;
}

export function resetPoolWatch(): void {
  last = null;
}
