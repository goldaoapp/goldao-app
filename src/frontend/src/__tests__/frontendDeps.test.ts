import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The accepted change adds html2canvas as a frontend runtime dependency "for
// future use" without changing app behavior. The frontend test script runs
// from src/frontend, so package.json sits directly under the current working
// directory. This characterizes the dependency manifest that the change must
// preserve: the existing runtime dependencies must remain intact while the
// new dependency is added.
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("frontend dependency manifest", () => {
  it("keeps the core runtime dependencies that the app renders with", () => {
    for (const dep of [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "lucide-react",
      "zustand",
    ]) {
      expect(
        pkg.dependencies,
        `${dep} should be a runtime dependency`,
      ).toHaveProperty(dep);
    }
  });

  it("declares html2canvas as a runtime dependency for future use", () => {
    expect(pkg.dependencies).toHaveProperty("html2canvas");
  });

  it("keeps the test tooling in devDependencies", () => {
    for (const dep of ["vitest", "jsdom", "@testing-library/react"]) {
      expect(
        pkg.devDependencies,
        `${dep} should be a devDependency`,
      ).toHaveProperty(dep);
    }
  });
});
