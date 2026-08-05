import { describe, expect, it } from "vitest";

import type { Lane } from "../run-state";
import {
  assertRunnerReachability,
  clearRunnerReachabilityCache,
  requiredWarningTicksForLane,
  runnerReachabilityCacheStats,
  RUNNER_REACHABILITY_CACHE_LIMIT,
  RUNNER_WARNING_LEAD_TICKS,
  validateRunnerReachability,
  validateRunnerWarningContract,
  type AbstractLaneRequirement,
  type AbstractReachabilityPattern,
} from "./reachability-validator";
import type { LaneControllerState } from "./lane-controller";

function requirement(
  kind: AbstractLaneRequirement["kind"],
  lane: Lane,
  contactTick: number,
  safeTick: number,
): AbstractLaneRequirement {
  return { kind, lane, contactTick, safeTick };
}

function pattern(
  patternKey: string,
  anchorTick: number,
  safeBoundaryTick: number,
  laneRequirements: readonly AbstractLaneRequirement[],
): AbstractReachabilityPattern {
  return { patternKey, anchorTick, safeBoundaryTick, laneRequirements };
}

const IDLE_LANE_ZERO: LaneControllerState = {
  motion: {
    kind: "idle",
    currentLane: 0,
    sourceLane: 0,
    targetLane: 0,
    elapsedTicks: 0,
    totalTicks: 11,
  },
  inputBuffer: null,
};

describe("runner reachability validator", () => {
  it("accepts a three-pattern course from every one of the 107 incoming states", () => {
    const result = validateRunnerReachability([
      pattern("benefit-at-zero", 50, 61, [
        requirement("benefit", 0, 50, 61),
        requirement("required-hazard", 2, 50, 61),
      ]),
      pattern("benefit-at-one", 120, 131, [
        requirement("required-hazard", 0, 120, 131),
        requirement("benefit", 1, 120, 131),
      ]),
      pattern("benefit-at-two", 190, 201, [
        requirement("required-hazard", 0, 190, 201),
        requirement("required-hazard", 1, 190, 201),
        requirement("benefit", 2, 190, 201),
      ]),
    ], { startTick: 0 });

    expect(result).toMatchObject({
      accepted: true,
      incomingStateCount: 107,
      firstStepInputCaseCount: 321,
      patternCount: 3,
      startTick: 0,
      checkedThroughTick: 201,
      failures: [],
    });
    expect(result.minimumViableStateCount).toBeGreaterThan(0);
    expect(result.transitionCount).toBeGreaterThan(321);
    expect(() =>
      assertRunnerReachability([
        pattern("quiet-a", 1, 1, []),
        pattern("quiet-b", 2, 2, []),
        pattern("quiet-c", 3, 3, []),
      ], { startTick: 0 }),
    ).not.toThrow();
  });

  it("rejects an impossible pattern even when two safe tail patterns follow", () => {
    const impossible = pattern("impossible-all-lanes", 50, 61, [
      requirement("required-hazard", 0, 50, 61),
      requirement("required-hazard", 1, 50, 61),
      requirement("required-hazard", 2, 50, 61),
    ]);
    const result = validateRunnerReachability([
      impossible,
      pattern("quiet-tail-a", 62, 62, []),
      pattern("quiet-tail-b", 63, 63, []),
    ], { startTick: 0 });

    expect(result.accepted).toBe(false);
    expect(result.failures).toHaveLength(107);
    expect(result.failures[0]).toMatchObject({
      activeRequiredHazardLanes: [0, 1, 2],
      activePatternKeys: ["impossible-all-lanes"],
    });
    expect(() =>
      assertRunnerReachability([
        impossible,
        pattern("quiet-tail-c", 62, 62, []),
        pattern("quiet-tail-d", 63, 63, []),
      ], { startTick: 0 }),
    ).toThrow("unreachable");
  });

  it("rejects a locally safe opening whose three-pattern continuation is unavoidable", () => {
    const locallySafe = pattern("only-lane-zero-safe", 50, 61, [
      requirement("benefit", 0, 50, 61),
      requirement("required-hazard", 1, 50, 61),
      requirement("required-hazard", 2, 50, 61),
    ]);
    const continuation = [
      locallySafe,
      pattern("quiet-middle", 62, 62, []),
      pattern("lane-zero-one-blocked", 63, 74, [
        requirement("required-hazard", 0, 63, 74),
        requirement("required-hazard", 1, 63, 74),
        requirement("benefit", 2, 63, 74),
      ]),
    ] as const;

    const localOnly = validateRunnerReachability([
      locallySafe,
      pattern("quiet-local-a", 62, 62, []),
      pattern("quiet-local-b", 63, 63, []),
    ], { startTick: 0 });
    const withContinuation = validateRunnerReachability(
      continuation,
      { startTick: 0 },
    );

    expect(localOnly.accepted).toBe(true);
    expect(withContinuation.accepted).toBe(false);
    expect(withContinuation.failures.length).toBeGreaterThan(0);
    expect(
      withContinuation.failures.some(
        (failure) =>
          failure.activePatternKeys.includes("lane-zero-one-blocked") &&
          failure.firstDeadTick >= 63,
      ),
    ).toBe(true);
  });

  it("requires the exact append tick and rejects a late candidate that tick zero falsely accepts", () => {
    const lateCandidate = [
      pattern("late-only-lane-two-safe", 1_000, 1_011, [
        requirement("required-hazard", 0, 1_000, 1_011),
        requirement("required-hazard", 1, 1_000, 1_011),
        requirement("benefit", 2, 1_000, 1_011),
      ]),
      pattern("late-quiet-a", 1_011, 1_011, []),
      pattern("late-quiet-b", 1_012, 1_012, []),
    ] as const;

    expect(
      validateRunnerReachability(lateCandidate, { startTick: 0 }).accepted,
    ).toBe(true);
    const exact = validateRunnerReachability(
      lateCandidate,
      { startTick: 999 },
    );
    expect(exact.accepted).toBe(false);
    expect(exact.failures.some(({ firstDeadTick }) => firstDeadTick === 1_000))
      .toBe(true);
    expect(() =>
      validateRunnerReachability(lateCandidate, undefined as never),
    ).toThrow(/start tick is required/);
  });

  it("reuses start-relative structural proofs while translating exact ticks and pattern keys", () => {
    const impossibleAt = (startTick: number, suffix: string) => [
      pattern(`impossible-${suffix}`, startTick + 50, startTick + 61, [
        requirement("required-hazard", 0, startTick + 50, startTick + 61),
        requirement("required-hazard", 1, startTick + 50, startTick + 61),
        requirement("required-hazard", 2, startTick + 50, startTick + 61),
      ]),
      pattern(`quiet-a-${suffix}`, startTick + 61, startTick + 61, []),
      pattern(`quiet-b-${suffix}`, startTick + 62, startTick + 62, []),
    ] as const;
    clearRunnerReachabilityCache();
    const first = validateRunnerReachability(
      impossibleAt(0, "first"),
      { startTick: 0 },
    );
    const shifted = validateRunnerReachability(
      impossibleAt(10_000, "shifted"),
      { startTick: 10_000 },
    );

    expect(first.accepted).toBe(false);
    expect(shifted.accepted).toBe(false);
    expect(shifted.transitionCount).toBe(first.transitionCount);
    expect(shifted.failures[0]?.firstDeadTick).toBe(
      10_000 + first.failures[0]!.firstDeadTick,
    );
    expect(first.failures[0]?.activePatternKeys).toEqual(["impossible-first"]);
    expect(shifted.failures[0]?.activePatternKeys).toEqual([
      "impossible-shifted",
    ]);
    expect(runnerReachabilityCacheStats()).toMatchObject({
      hits: 1,
      misses: 1,
      size: 1,
      transitionGraphStateCount: 107,
    });
  });

  it("treats benefit requirements as opportunities rather than blockers", () => {
    const result = validateRunnerReachability([
      pattern("benefits-all-lanes", 50, 61, [
        requirement("benefit", 0, 50, 61),
        requirement("benefit", 1, 50, 61),
        requirement("benefit", 2, 50, 61),
      ]),
      pattern("quiet-a", 62, 62, []),
      pattern("quiet-b", 63, 63, []),
    ], { startTick: 0 });
    expect(result.accepted).toBe(true);
  });

  it("locks the exact warning envelope and a guard tick for every difficulty", () => {
    const result = validateRunnerWarningContract();
    expect(result).toMatchObject({
      incomingStateCount: 107,
      firstStepInputCaseCount: 321,
      maximumMovementTicks: 43,
      maximumRequiredWarningTicks: 81,
      passed: true,
    });
    expect(result.difficulties).toEqual([
      { difficulty: "story", leadTicks: 92, guardTicks: 11, sufficient: true },
      { difficulty: "normal", leadTicks: 82, guardTicks: 1, sufficient: true },
      { difficulty: "challenge", leadTicks: 82, guardTicks: 1, sufficient: true },
    ]);
    expect(RUNNER_WARNING_LEAD_TICKS).toEqual({
      story: 92,
      normal: 82,
      challenge: 82,
    });
    expect(requiredWarningTicksForLane(IDLE_LANE_ZERO, 0)).toBe(38);
    expect(requiredWarningTicksForLane(IDLE_LANE_ZERO, 1)).toBe(50);
    expect(requiredWarningTicksForLane(IDLE_LANE_ZERO, 2)).toBe(60);
  });

  it("rejects a proof shorter than three patterns and malformed safe intervals", () => {
    expect(() =>
      validateRunnerReachability([
        pattern("short-a", 1, 1, []),
        pattern("short-b", 2, 2, []),
      ], { startTick: 0 }),
    ).toThrow("at least 3 patterns");

    expect(() =>
      validateRunnerReachability([
        pattern("bad-safe-tick", 10, 12, [
          requirement("required-hazard", 0, 10, 13),
        ]),
        pattern("quiet-a", 13, 13, []),
        pattern("quiet-b", 14, 14, []),
      ], { startTick: 0 }),
    ).toThrow("safe boundary");
  });

  it("bounds the structural horizon cache with least-recently-used eviction", () => {
    clearRunnerReachabilityCache();
    for (let index = 0; index <= RUNNER_REACHABILITY_CACHE_LIMIT; index += 1) {
      validateRunnerReachability([
        pattern(`bounded-a-${index}`, index + 1, index + 1, []),
        pattern(`bounded-b-${index}`, index + 2, index + 2, []),
        pattern(`bounded-c-${index}`, index + 3, index + 3, []),
      ], { startTick: 0 });
    }
    expect(runnerReachabilityCacheStats()).toMatchObject({
      hits: 0,
      misses: RUNNER_REACHABILITY_CACHE_LIMIT + 1,
      evictions: 1,
      size: RUNNER_REACHABILITY_CACHE_LIMIT,
      limit: RUNNER_REACHABILITY_CACHE_LIMIT,
    });
  });

  it("evaluates 90,000 repeated structural entries within the executable cache budget", () => {
    const shiftedAcceptedHorizon = (startTick: number, suffix: string) => [
      pattern(`benefit-zero-${suffix}`, startTick + 50, startTick + 61, [
        requirement("benefit", 0, startTick + 50, startTick + 61),
        requirement("required-hazard", 2, startTick + 50, startTick + 61),
      ]),
      pattern(`benefit-one-${suffix}`, startTick + 120, startTick + 131, [
        requirement("required-hazard", 0, startTick + 120, startTick + 131),
        requirement("benefit", 1, startTick + 120, startTick + 131),
      ]),
      pattern(`benefit-two-${suffix}`, startTick + 190, startTick + 201, [
        requirement("required-hazard", 0, startTick + 190, startTick + 201),
        requirement("required-hazard", 1, startTick + 190, startTick + 201),
        requirement("benefit", 2, startTick + 190, startTick + 201),
      ]),
    ] as const;
    const variants = Array.from({ length: 9 }, (_, index) => ({
      startTick: index * 10_000,
      patterns: shiftedAcceptedHorizon(index * 10_000, String(index)),
    }));
    clearRunnerReachabilityCache();
    const evaluationCount = 90_000;
    let checkedThroughChecksum = 0;
    const startedAt = Date.now();
    for (let index = 0; index < evaluationCount; index += 1) {
      const variant = variants[index % variants.length]!;
      const result = validateRunnerReachability(
        variant.patterns,
        { startTick: variant.startTick },
      );
      if (!result.accepted) throw new Error("cached valid horizon was rejected");
      checkedThroughChecksum += result.checkedThroughTick - result.startTick;
    }
    const elapsedMs = Date.now() - startedAt;
    const cache = runnerReachabilityCacheStats();
    const report = {
      evaluationCount,
      elapsedMs,
      checkedThroughChecksum,
      cache,
    };

    expect(report).toMatchObject({
      evaluationCount: 90_000,
      checkedThroughChecksum: 90_000 * 201,
      cache: {
        hits: 89_999,
        misses: 1,
        evictions: 0,
        size: 1,
        transitionGraphStateCount: 107,
      },
    });
    expect(report.elapsedMs).toBeLessThan(5_000);
  });
});
