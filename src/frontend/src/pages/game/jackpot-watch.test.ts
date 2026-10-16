import { beforeEach, describe, expect, it } from "vitest";
import {
  jackpotIsNew,
  observeJackpot,
  resetJackpotWatch,
} from "./jackpot-watch";

describe("jackpot watch", () => {
  beforeEach(resetJackpotWatch);

  it("stays quiet on the first reading, even with an old win", () => {
    expect(observeJackpot(500n, false)).toBe(false);
    expect(observeJackpot(500n, false)).toBe(false);
  });

  it("fires once when a newer stamp appears", () => {
    observeJackpot(500n, false);
    expect(observeJackpot(900n, false)).toBe(true);
    expect(observeJackpot(900n, false)).toBe(false);
  });

  it("a stamp that goes down is a new baseline, not a win", () => {
    observeJackpot(900n, false);
    expect(observeJackpot(0n, false)).toBe(false);
    expect(observeJackpot(10n, false)).toBe(true);
  });

  it("does not announce while the game is paused, and does not repeat later", () => {
    observeJackpot(500n, false);
    expect(observeJackpot(900n, true)).toBe(false);
    expect(observeJackpot(900n, false)).toBe(false);
  });

  it("needs a previous reading", () => {
    expect(jackpotIsNew(null, 5n)).toBe(false);
    expect(jackpotIsNew(5n, 5n)).toBe(false);
    expect(jackpotIsNew(5n, 6n)).toBe(true);
  });
});
