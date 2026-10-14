import { trustedSpender } from "@/lib/session";
import { describe, expect, it } from "vitest";

describe("trustedSpender", () => {
  it("accepts the address of the canister the page talks to", () => {
    expect(trustedSpender("aaaaa-aa", "aaaaa-aa")).toBe("aaaaa-aa");
  });
  it("refuses any other address", () => {
    expect(trustedSpender("bbbbb-bb", "aaaaa-aa")).toBe("");
  });
  it("refuses when either side is missing", () => {
    expect(trustedSpender(undefined, "aaaaa-aa")).toBe("");
    expect(trustedSpender("aaaaa-aa", undefined)).toBe("");
    expect(trustedSpender("", "")).toBe("");
  });
});
