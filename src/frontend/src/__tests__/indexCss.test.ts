import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The build adds six @keyframes animation definitions to index.css "without
// making any other changes". The stylesheet is a static asset, so the only
// observable contract is its on-disk content. The frontend test script runs
// from src/frontend, so index.css sits directly under the current working
// directory.
const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

describe("index.css", () => {
  it("keeps the existing base layer and design tokens unchanged", () => {
    expect(css).toContain("@tailwind base;");
    expect(css).toContain("@tailwind components;");
    expect(css).toContain("@tailwind utilities;");
    expect(css).toContain("@layer base");
    expect(css).toContain('--font-display: "Space Grotesk", sans-serif;');
    expect(css).toContain("--primary: 0.78 0.15 85;");
  });

  it("keeps the dark theme tokens unchanged", () => {
    expect(css).toContain(".dark");
    expect(css).toContain("--background: 0.145 0 0;");
    expect(css).toContain("--primary: 0.82 0.15 85;");
  });

  it("keeps the existing utility classes unchanged", () => {
    expect(css).toContain(".transition-smooth");
    expect(css).toContain(".gradient-primary");
    expect(css).toContain(".gradient-subtle");
    expect(css).toContain(".text-gradient-gold");
  });

  it("appends the six @keyframes animation definitions", () => {
    for (const name of [
      "dotTravel",
      "glowPulse",
      "burnGlow",
      "fireFlicker",
      "stakeOrbit",
      "compoundPulse",
    ]) {
      expect(css).toContain(`@keyframes ${name}`);
    }
  });
});
