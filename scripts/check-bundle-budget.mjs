import path from "node:path";

import {
  auditBundleBudget,
  PHASE_1_BUDGET_PROFILE,
} from "./bundle-budget.mjs";

const report = await auditBundleBudget({
  distDir: path.resolve("dist"),
  profile: PHASE_1_BUDGET_PROFILE,
});

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  throw new Error(`Bundle budget failed: ${report.failures.join("; ")}`);
}
