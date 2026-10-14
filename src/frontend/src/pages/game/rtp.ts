import type { GameConfig } from "@/backend";
import { collapsePoints, multX100 } from "./game-utils";

/** RTP range shown to players: it depends on the jackpot pool size. */
export const RTP_RANGE_TEXT = "~98.5% to 105%";

/** Chance of making `picks` safe picks in a row: the first `safe` picks are always safe. */
function reachProb(
  picks: number,
  cells: number,
  mines: number,
  safe: number,
): number {
  let p = 1;
  for (let n = safe; n < picks; n++) p *= 1 - mines / (cells - n);
  return p;
}

/**
 * Average of the base game for a player who saves at any pick from `safe + 1` to `maxPicks`
 * with the same frequency: `base` is the return as a fraction of the stake (prizes and collapse
 * rescues, without jackpot or Top 10) and `safePicks` the expected number of safe picks, each of
 * them a roll of the diamond chain.
 */
export function averagePlay(config: GameConfig): {
  base: number;
  safePicks: number;
} {
  const cells = Number(config.cells);
  const mines = Number(config.mines);
  const safe = Number(config.safePicks);
  const maxPicks = Number(config.maxPicks);
  const pts = config.pointsTable.map(Number);
  const bps = Number(config.payoutBps);
  let base = 0;
  let safePicks = 0;
  let stops = 0;
  for (let stop = safe + 1; stop <= maxPicks; stop++) {
    let ret = 0;
    for (let j = safe; j < stop; j++) {
      const collapse = mines / (cells - j);
      ret +=
        reachProb(j, cells, mines, safe) *
        collapse *
        (multX100(collapsePoints(pts[j]), bps) / 100);
    }
    ret +=
      reachProb(stop, cells, mines, safe) * (multX100(pts[stop], bps) / 100);
    let rolls = 0;
    for (let j = 1; j <= stop; j++) rolls += reachProb(j, cells, mines, safe);
    base += ret;
    safePicks += rolls;
    stops += 1;
  }
  return { base: base / stops, safePicks: safePicks / stops };
}

/** Chance (0 to 1) per safe pick of exactly two diamonds (mini) and of three (full jackpot) for a stake in e8s. */
export function diamondChances(
  config: GameConfig,
  stake: bigint,
): { mini: number; full: number } {
  const d1 = Number(config.diamond1Bps) / 10_000;
  const d2 = Math.min(
    1,
    (Number(stake / 100_000_000n) * Number(config.diamond2PerGoldao)) / 1e8,
  );
  const odds = Number(config.diamond3Odds);
  return {
    mini: (d1 * d2 * (odds - 1)) / odds,
    full: (d1 * d2) / odds,
  };
}
