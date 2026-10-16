/**
 * Detects that someone won a jackpot, from the public summary.
 *
 * The backend stamps the time of the last jackpot it paid (`lastJackpotAt`). A later stamp than
 * the one seen before means a new win. The first reading only sets the baseline, so opening the
 * page never announces an old win. A stamp that goes down (new tournament, game reset) is a new
 * baseline, not a win. The backend stays the only source of the value; this file only compares
 * two values it handed out.
 */

let last: bigint | null = null;

/** Pure rule: is `next` a newer jackpot stamp than the baseline `prev`? */
export function jackpotIsNew(prev: bigint | null, next: bigint): boolean {
  return prev !== null && next > prev;
}

/**
 * Feed every summary reading. True when it shows a jackpot paid since the previous reading.
 * While the game is paused nothing is announced, but the baseline still follows the server.
 */
export function observeJackpot(
  lastJackpotAt: bigint,
  paused: boolean,
): boolean {
  const isNew = jackpotIsNew(last, lastJackpotAt);
  last = lastJackpotAt;
  return isNew && !paused;
}

export function resetJackpotWatch(): void {
  last = null;
}
