import type { GameConfig } from "@/backend";
import { describe, expect, it } from "vitest";
import {
  LIVE_RTP_MIN_POOL,
  averagePlay,
  diamondChances,
  liveRtpPct,
} from "../pages/game/rtp";

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

describe("live RTP", () => {
  // Reference values from the exact Python model:
  // (base + top10 + safePicks * 6.25e-7 * 2 * pool) * 100.
  const cases: [bigint, number][] = [
    [5_000n, 96.168374],
    [8_000n, 97.710821],
    [10_000n, 98.739118],
    [13_000n, 100.281565],
    [17_000n, 102.33816],
    [26_000n, 106.965499],
  ];
  for (const [pool, expected] of cases) {
    it(`pool ${pool}`, () => {
      expect(liveRtpPct(config, pool * GOLDAO)).toBeCloseTo(expected, 4);
    });
  }

  it("is only shown above 10,000 GOLDAO", () => {
    expect(LIVE_RTP_MIN_POOL).toBe(10_000n * GOLDAO);
  });
});
