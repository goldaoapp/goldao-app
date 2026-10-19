import { describe, expect, it } from "vitest";
import {
  GOLDAO_LEDGER,
  GOLDAO_TEST_LEDGER,
  assertKnownLedger,
} from "./goldao-ledger";

describe("assertKnownLedger", () => {
  it("accepts the real ledger, the test ledger and no id", () => {
    expect(() => assertKnownLedger(GOLDAO_LEDGER)).not.toThrow();
    expect(() => assertKnownLedger(GOLDAO_TEST_LEDGER)).not.toThrow();
    expect(() => assertKnownLedger(undefined)).not.toThrow();
  });

  it("rejects any other ledger", () => {
    expect(() => assertKnownLedger("aaaaa-aa")).toThrow(/Unknown ledger/);
  });
});
