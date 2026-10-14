import type { GameConfig } from "@/backend";
import { describe, expect, it } from "vitest";
import { averagePlay, diamondChances } from "../pages/game/rtp";

// Only the fields the RTP calculation reads are real; the rest is filler for the type.
const config = {
  cells: 25n,
  mines: 5n,
  safePicks: 2n,
  maxPicks: 10n,
  pointsTable: [0n, 50n, 100n, 114n, 131n, 151n, 176n, 208n, 248n, 299n, 367n],
  payoutBps: 9_250n,
  diamond1Bps: 200n,
  diamond2PerGoldao: 18_750n,
  diamond3Odds: 6n,
  miniBps: 2_000n,
  top10Bps: 135n,
} as unknown as GameConfig;

const GOLDAO = 100_000_000n;

describe("average play", () => {
  it("matches the exact reference model", () => {
    const { base, safePicks } = averagePlay(config);
    expect(base).toBeCloseTo(0.9224762994, 9);
    expect(safePicks).toBeCloseTo(4.1131905852, 9);
  });
});

describe("diamond chances", () => {
  it("keeps the full jackpot at 6.25e-7 per GOLDAO staked", () => {
    for (const stake of [100n, 300n, 500n, 1000n]) {
      const { full } = diamondChances(config, stake * GOLDAO);
      expect(full).toBeCloseTo(6.25e-7 * Number(stake), 12);
    }
  });

  it("makes exactly two diamonds five times as frequent as three", () => {
    const { mini, full } = diamondChances(config, 100n * GOLDAO);
    expect(mini / full).toBeCloseTo(5, 9);
  });
});
