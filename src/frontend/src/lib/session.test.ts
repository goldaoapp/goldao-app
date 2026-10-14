import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_MS,
  PLAYER_SESSION_MS,
  sessionEndsAtMs,
  sessionTooLongForAdmin,
} from "./session";

const chain = (...expirationsMs: number[]) =>
  ({
    getDelegation: () => ({
      delegations: expirationsMs.map((ms) => ({
        delegation: { expiration: BigInt(ms) * 1_000_000n },
      })),
    }),
  }) as never;

describe("session length", () => {
  it("players get 7 days and the admin 8 hours", () => {
    expect(PLAYER_SESSION_MS).toBe(7 * 24 * 3600 * 1000);
    expect(ADMIN_SESSION_MS).toBe(8 * 3600 * 1000);
  });

  it("reads the earliest expiry of the delegation chain", () => {
    expect(sessionEndsAtMs(chain(5000, 3000, 9000))).toBe(3000);
  });

  it("returns null when there is nothing to read", () => {
    expect(sessionEndsAtMs(null)).toBeNull();
    expect(sessionEndsAtMs({} as never)).toBeNull();
    expect(sessionEndsAtMs(chain())).toBeNull();
  });

  it("a 7-day sign-in is too long for the admin, an 8-hour one is not", () => {
    const now = 1_000_000_000;
    expect(sessionTooLongForAdmin(now + PLAYER_SESSION_MS, now)).toBe(true);
    expect(sessionTooLongForAdmin(now + ADMIN_SESSION_MS, now)).toBe(false);
    expect(sessionTooLongForAdmin(now + 60_000, now)).toBe(false);
    expect(sessionTooLongForAdmin(null, now)).toBe(false);
  });
});
