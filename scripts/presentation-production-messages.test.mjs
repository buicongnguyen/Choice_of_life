import { build as esbuild } from "esbuild";
import { minify } from "terser";
import { describe, expect, it } from "vitest";

const HARNESS = `
  export { mountRunnerView } from "./src/choice-of-life/presentation/runner-view.ts";
  export { createRunnerPresentationModel } from "./src/choice-of-life/presentation/runner-model.ts";
  export * from "./src/choice-of-life/core/run-state-codec.ts";
  export * from "./src/choice-of-life/core/runner/automatic-oracle.ts";
  export * from "./src/choice-of-life/core/runner/neutral-policy.ts";
  export * from "./src/choice-of-life/core/runner/save-invariants.ts";
  export * from "./src/choice-of-life/core/runner/settlement.ts";
  export * from "./src/choice-of-life/core/runner/simulation.ts";
  export * from "./src/choice-of-life/platform/runner-input-dom.ts";
`;

describe("presentation production invariant diagnostics", () => {
  it("prunes detailed DEV-only messages without erasing built-in Error semantics", async () => {
    const bundled = await esbuild({
      stdin: {
        contents: HARNESS,
        loader: "ts",
        resolveDir: process.cwd(),
        sourcefile: "presentation-production-message-entry.ts",
      },
      bundle: true,
      define: { "import.meta.env.DEV": "false" },
      format: "esm",
      // Vite owns stylesheet imports; this harness only inspects the JavaScript
      // messages. Without the empty loader, `import "./polish.css"` in
      // runner-view.ts aborts the bundle because `write: false` gives esbuild no
      // output path for a CSS chunk.
      loader: { ".css": "empty" },
      platform: "browser",
      target: "es2022",
      treeShaking: true,
      write: false,
    });
    const source = bundled.outputFiles[0]?.text;
    if (source === undefined) throw new TypeError("Harness emitted no JavaScript");
    const output = await minify(source, {
      compress: { passes: 3 },
      mangle: { module: true, toplevel: true },
      module: true,
      format: { comments: false },
    });
    expect(output.code).toBeTypeOf("string");
    for (const detailedMessage of [
      "character body set is unsupported",
      "visual text scale multiplier is unsupported",
      "generated warning entity lacks an exact scoring definition",
      "run ID does not match the deterministic runner setup",
      "Runner laboratory saves cannot contain credentials",
      "rolling reachability proof must contain three authentic patterns",
      "runner simulation:",
    ]) {
      expect(output.code).not.toContain(detailedMessage);
    }
    // The test deliberately supplies no `pure_funcs`, `drop_console`, or
    // constructor rewriting: native TypeError construction remains present.
    expect(output.code).toContain("TypeError");
  });
});
