/**
 * Tiny provenance registry shared by evaluator-only replay code and the
 * production Automatic-oracle bridge. Keeping the registry here prevents the
 * browser graph from importing the large evaluator implementation.
 */
const AUTHENTIC_MODE_EVALUATION_SUPPORTS = new WeakSet<object>();
const AUTHENTIC_MODE_PROJECTIONS = new WeakSet<object>();

export function registerAuthenticRunnerModeEvaluationSupport<T extends object>(
  value: T,
): T {
  AUTHENTIC_MODE_EVALUATION_SUPPORTS.add(value);
  return value;
}

export function hasAuthenticRunnerModeEvaluationSupport(
  value: unknown,
): value is object {
  return typeof value === "object" && value !== null &&
    AUTHENTIC_MODE_EVALUATION_SUPPORTS.has(value);
}

export function registerAuthenticRunnerModeProjection<T extends object>(
  value: T,
): T {
  AUTHENTIC_MODE_PROJECTIONS.add(value);
  return value;
}

export function hasAuthenticRunnerModeProjection(
  value: unknown,
): value is object {
  return typeof value === "object" && value !== null &&
    AUTHENTIC_MODE_PROJECTIONS.has(value);
}
