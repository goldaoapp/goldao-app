import { describe, expect, it } from "vitest";
import { miniPrizeOf } from "../pages/game/game-utils";

const GOLDAO = 100_000_000n;
const CENT = 1_000_000n;

describe("miniPrizeOf", () => {
  it("is 20% of the pool for miniBps 2000", () => {
    expect(miniPrizeOf(5_000n * GOLDAO, 2_000n)).toBe(1_000n * GOLDAO);
    expect(miniPrizeOf(10_000n * GOLDAO, 2_000)).toBe(2_000n * GOLDAO);
  });

  it("rounds down to whole cents, like the backend", () => {
    // Pool 12,345.67 GOLDAO: 20% is 2,469.134, which is paid as 2,469.13.
    const pool = 1_234_567n * CENT;
    expect(miniPrizeOf(pool, 2_000n)).toBe(246_913n * CENT);
    // A pool of 0.07 GOLDAO gives 0.014, paid as 0.01.
    expect(miniPrizeOf(7n * CENT, 2_000n)).toBe(1n * CENT);
  });

  it("is 0 for an empty pool or a pool too small for one cent", () => {
    expect(miniPrizeOf(0n, 2_000n)).toBe(0n);
    expect(miniPrizeOf(4n * CENT, 2_000n)).toBe(0n);
  });

  it("follows miniBps instead of a fixed 20%", () => {
    expect(miniPrizeOf(5_000n * GOLDAO, 1_000n)).toBe(500n * GOLDAO);
  });
});
