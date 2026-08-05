import path from "node:path";
import { pathToFileURL } from "node:url";

export function rejectStandaloneRunnerBrowserMatrixInvocation(): never {
  throw new TypeError(
    "standalone browser-matrix execution cannot generate canonical evidence; " +
      "use runner:generate or runner:validate so the evaluator builds and owns its managed local preview. " +
      "Use runner:smoke only for explicitly non-canonical diagnostics.",
  );
}

const invoked = process.argv[1] === undefined
  ? false
  : import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  try {
    rejectStandaloneRunnerBrowserMatrixInvocation();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
