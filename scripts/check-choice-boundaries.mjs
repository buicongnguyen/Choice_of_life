import { auditChoiceBoundaries } from "./choice-boundaries.mjs";

const result = auditChoiceBoundaries();
if (result.errors.length) {
  throw new Error(`Choice of Life boundary check failed:\n- ${result.errors.join("\n- ")}`);
}

console.log(
  JSON.stringify(
    { productionFiles: result.productionFiles, count: result.productionFiles.length },
    null,
    2
  )
);
