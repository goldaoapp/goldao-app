import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_GAP_MS,
  observePool,
  poolFell,
  rebasePool,
  resetPoolWatch,
} from "./jackpot-watch";

const read = (pool: bigint, at: number, tournament = 1n) => ({
  tournament,
  pool,
  at,
});

describe("jackpot watch", () => {
  beforeEach(resetPoolWatch);

  it("stays quiet on the first reading and while the pool grows", () => {
    expect(observePool(read(100n, 0))).toBe(false);
    expect(observePool(read(100n, 20_000))).toBe(false);
    expect(observePool(read(150n, 40_000))).toBe(false);
  });

  it("fires when the pool falls", () => {
    observePool(read(500n, 0));
    expect(observePool(read(100n, 20_000))).toBe(true);
    // the new level is the baseline: no second notice
    expect(observePool(read(120n, 40_000))).toBe(false);
  });

  it("ignores a fall seen after a long gap", () => {
    observePool(read(500n, 0));
    expect(observePool(read(100n, MAX_GAP_MS + 1))).toBe(false);
  });

  it("ignores a change of tournament", () => {
    observePool(read(500n, 0));
    expect(observePool(read(100n, 20_000, 2n))).toBe(false);
  });

  it("does not fire for the player's own win", () => {
    observePool(read(500n, Date.now()));
    rebasePool(50n);
    expect(observePool(read(50n, Date.now() + 1_000))).toBe(false);
  });

  it("poolFell needs a previous reading", () => {
    expect(poolFell(null, read(1n, 0))).toBe(false);
  });
});
