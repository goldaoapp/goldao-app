import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The acceptance criterion for this build is that the logo PNG files ship
// under the frontend public logos directory. They are static assets not
// referenced by any component, so the only observable contract is their
// presence on disk. The frontend test script runs from src/frontend, so the
// public logos directory sits directly under the current working directory.
const logosDir = join(process.cwd(), "public", "logos");

const logoFiles = ["ogy.png", "icp.png", "goldao.png", "gldt.png"];

describe("frontend public logos", () => {
  it("ships the required logo PNG files", () => {
    for (const file of logoFiles) {
      expect(existsSync(join(logosDir, file)), `${file} should exist`).toBe(
        true,
      );
    }
  });

  // The logos directory must hold exactly the token logos as PNG files and
  // nothing else. This invariant is what the set of shipped logos must
  // preserve.
  it("keeps exactly the expected PNG logo files in the logos directory", () => {
    const pngFiles = readdirSync(logosDir).filter((f) => f.endsWith(".png"));
    expect(pngFiles.sort()).toEqual([...logoFiles].sort());
  });
});
