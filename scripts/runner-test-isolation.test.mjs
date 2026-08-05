import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPLAY_TEST = "src/choice-of-life/core/runner/evaluation-replay.test.ts";
const EVALUATOR_TEST = "scripts/runner-laboratory-evaluator.test.ts";
const REPLAY_COMMAND =
  `vitest run ${REPLAY_TEST} --pool=threads --poolOptions.threads.singleThread`;

describe("long synchronous runner test isolation", () => {
  it("runs replay and evaluator proofs in separate Vitest worker lifetimes", async () => {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
    for (const scriptName of ["test", "test:runner-evaluator"]) {
      const script = packageJson.scripts?.[scriptName];
      expect(typeof script, scriptName).toBe("string");
      const segments = script.split(" && ");
      expect(segments, scriptName).toHaveLength(3);
      if (scriptName === "test") {
        expect(segments[0]).toBe(
          `vitest run --exclude ${REPLAY_TEST} --exclude ${EVALUATOR_TEST}`,
        );
      } else {
        expect(segments[0], scriptName).not.toContain(REPLAY_TEST);
        expect(segments[0], scriptName).not.toContain(EVALUATOR_TEST);
      }
      expect(segments[1], scriptName).toBe(REPLAY_COMMAND);
      expect(segments[2], scriptName).toBe(`vitest run ${EVALUATOR_TEST}`);
    }
  });
});
