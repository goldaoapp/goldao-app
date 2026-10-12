import { describe, expect, it } from "vitest";
import { creditOnScreen } from "./game-utils";

describe("creditOnScreen", () => {
  it("shows the backend credit when no stake is pending", () => {
    expect(creditOnScreen(3_000n, 0n)).toBe(3_000n);
  });

  it("shows the stake as spent until the balance from the backend arrives", () => {
    expect(creditOnScreen(3_000n, 100n)).toBe(2_900n);
  });

  it("never goes below zero", () => {
    expect(creditOnScreen(50n, 100n)).toBe(0n);
  });

  it("does not subtract twice once the backend balance is applied", () => {
    // The backend balance already has the stake taken; the pending part is cleared with it.
    const backendCredit = 2_900n;
    expect(creditOnScreen(backendCredit, 0n)).toBe(2_900n);
  });
});
