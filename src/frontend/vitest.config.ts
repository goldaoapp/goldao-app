import { fileURLToPath, URL } from "url";
import { defineConfig } from "vitest/config";

// The frontend test script runs `vitest run --environment jsdom`. In this
// sandbox the default `forks` pool derives its thread bounds from
// `os.availableParallelism()`, which can resolve to a value that makes
// Tinypool's computed minThreads exceed maxThreads and abort the whole run
// before any test executes ("options.minThreads and options.maxThreads must
// not conflict"). Pin the pool to a single fork so the suite can start.
//
// A vitest.config.ts replaces vite.config.js for the test run, so the `@`
// path alias that production components rely on must be re-declared here or
// imports like `@/lib/fairvalue-calc` fail to resolve.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },
  },
});
