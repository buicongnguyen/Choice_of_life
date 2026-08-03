import { describe, expect, it } from "vitest";
import lockedCorpus from "../../../docs/save/run-state-v1-fixture-corpus.json";
import { RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "./catalog";
import type { RunStateV1 } from "./run-state";
import {
  decodeRunState,
  encodeRunState,
  validateRunState,
  type RunStateValidationResult,
} from "./run-state-codec";
import {
  createCancelledSettlementFixture,
  createCompletedConsequenceFixture,
  createMaximalRunStateFixture,
  createPresentingEncounterFixture,
  createSettlingRunStateFixture,
  createShellRunStateFixture,
  createUnresolvedRecoveryFixture,
} from "./run-state-fixtures";

type ValidationFailure = Extract<RunStateValidationResult, { readonly ok: false }>;

interface SemanticInvariantWitness {
  readonly valid: () => RunStateV1;
  readonly invalid: (decodedValid: RunStateV1) => unknown;
  readonly expected: Pick<ValidationFailure, "code" | "path">;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Missing witness value: ${label}`);
  return value;
}

const semanticInvariantWitnesses = {
  "run-stage-matrix-v1": {
    valid: createShellRunStateFixture,
    invalid: (valid) => ({ ...valid, runStatus: "active" }),
    expected: { code: "invalid-semantics", path: "/stage/phase" },
  },
  "motion-adjacent-lane-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const runner = required(valid.runner, "motion runner");
      return {
        ...valid,
        runner: {
          ...runner,
          motion: { ...runner.motion, kind: "moving", currentLane: 0, sourceLane: 0, targetLane: 2 },
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/runner/motion" },
  },
  "spawn-open-pattern-resolution-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const runner = required(valid.runner, "spawn runner");
      const firstEntity = required(runner.activeEntities[0], "spawn entity");
      return {
        ...valid,
        runner: {
          ...runner,
          activeEntities: [
            { ...firstEntity, patternIndex: runner.spawn.resolvedThroughPatternIndex },
            ...runner.activeEntities.slice(1),
          ],
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/runner/activeEntities/0" },
  },
  "ledger-reconciliation-v1": {
    valid: createShellRunStateFixture,
    invalid: (valid) => ({
      ...valid,
      effectLedger: {
        ...valid.effectLedger,
        totalsBySource: {
          ...valid.effectLedger.totalsBySource,
          system: { ...valid.effectLedger.totalsBySource.system, healthPositive: 1 },
        },
      },
    }),
    expected: { code: "invalid-semantics", path: "/scores/health" },
  },
  "effect-arithmetic-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const effect = required(valid.effectLedger.recent[0], "arithmetic effect");
      return {
        ...valid,
        effectLedger: {
          ...valid.effectLedger,
          recent: [{ ...effect, actualDelta: 0 }, ...valid.effectLedger.recent.slice(1)],
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/effectLedger/recent/0" },
  },
  "recovery-tick-order-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const recovery = required(valid.recovery, "ordered recovery");
      return { ...valid, recovery: { ...recovery, startedTick: recovery.resolveTick + 1 } };
    },
    expected: { code: "invalid-semantics", path: "/recovery" },
  },
  "recovery-depletion-and-restoration-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const recovery = required(valid.recovery, "restoration recovery");
      return {
        ...valid,
        recovery: {
          ...recovery,
          targetScores: { ...recovery.targetScores, health: recovery.targetScores.health + 1 },
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/recovery/targetScores/health" },
  },
  "recovery-before-encounter-v1": {
    valid: () => createUnresolvedRecoveryFixture("offered"),
    invalid: (valid) => ({
      ...valid,
      encounter: required(createPresentingEncounterFixture().encounter, "presenting encounter"),
    }),
    expected: { code: "invalid-semantics", path: "/encounter" },
  },
  "settlement-exclusive-v1": {
    valid: createSettlingRunStateFixture,
    invalid: (valid) => ({
      ...valid,
      recovery: required(createMaximalRunStateFixture().recovery, "settlement recovery"),
    }),
    expected: { code: "invalid-semantics", path: "/stage" },
  },
  "invulnerability-equality-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const runner = required(valid.runner, "invulnerable runner");
      const recovery = required(valid.recovery, "invulnerability recovery");
      return {
        ...valid,
        runner: { ...runner, invulnerableUntilTick: recovery.invulnerableUntilTick + 1 },
      };
    },
    expected: { code: "invalid-semantics", path: "/recovery/invulnerableUntilTick" },
  },
  "settlement-tick-order-v1": {
    valid: createCancelledSettlementFixture,
    invalid: (valid) => {
      const settlement = required(valid.stage.settlement, "cancelled settlement");
      return {
        ...valid,
        stage: {
          ...valid.stage,
          settlement: { ...settlement, completedTick: settlement.startedTick - 1 },
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/stage/settlement/completedTick" },
  },
  "encounter-atomic-resolution-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const encounter = required(valid.encounter, "resolved encounter");
      return { ...valid, encounter: { ...encounter, selectedOptionId: "option-try-alone-v1" } };
    },
    expected: { code: "invalid-semantics", path: "/encounter/resolutionTransactionId" },
  },
  "consequence-status-transition-v1": {
    valid: createCompletedConsequenceFixture,
    invalid: (valid) => {
      const terminal = required(valid.consequences.terminal[0], "complete consequence");
      if (terminal.status !== "complete") throw new Error("Expected a complete consequence witness");
      return {
        ...valid,
        consequences: {
          ...valid.consequences,
          terminal: [{ ...terminal, presentedTick: terminal.resolution.resolvedTick - 1 }],
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/consequences/terminal/0" },
  },
  "consequence-disjoint-id-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const pending = required(valid.consequences.pending[0], "pending consequence");
      const terminal = required(valid.consequences.terminal[0], "terminal consequence");
      return {
        ...valid,
        consequences: {
          ...valid.consequences,
          terminal: [{ ...terminal, transactionId: pending.transactionId }],
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/consequences/*/transactionId" },
  },
  "consequence-acyclic-graph-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const resolved = required(valid.consequences.resolved[0], "resolved consequence");
      return {
        ...valid,
        consequences: {
          ...valid.consequences,
          resolved: [{
            ...resolved,
            resolution: {
              ...resolved.resolution,
              scheduledConsequenceTransactionIds: [
                ...resolved.resolution.scheduledConsequenceTransactionIds,
                resolved.transactionId,
              ],
            },
          }],
        },
      };
    },
    expected: { code: "invalid-semantics", path: "/consequences" },
  },
  "choice-supersession-acknowledgment-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => {
      const terminal = required(valid.consequences.terminal[0], "acknowledged supersession");
      return {
        ...valid,
        consequences: {
          ...valid.consequences,
          terminal: [{ ...terminal, acknowledgmentId: null }],
        },
      };
    },
    expected: { code: "invalid-structure", path: "/consequences/terminal/0/acknowledgmentId" },
  },
  "catalog-reference-v1": {
    valid: createMaximalRunStateFixture,
    invalid: (valid) => ({
      ...valid,
      stage: { ...valid.stage, stageId: "unknown-stage-v1" },
    }),
    expected: { code: "invalid-catalog", path: "/stage/stageId" },
  },
} as const satisfies Record<string, SemanticInvariantWitness>;

describe("run-state v1 locked semantic invariants", () => {
  it("binds every exact locked ID to a decoded valid witness and targeted rejection", () => {
    expect(Object.keys(semanticInvariantWitnesses)).toEqual(lockedCorpus.semanticInvariantIds);

    for (const invariantId of lockedCorpus.semanticInvariantIds) {
      const witness = semanticInvariantWitnesses[invariantId as keyof typeof semanticInvariantWitnesses];
      expect(witness, `${invariantId} witness`).toBeDefined();
      if (witness === undefined) continue;

      const decoded = decodeRunState(
        encodeRunState(witness.valid()),
        RUN_STATE_CONTRACT_FIXTURE_CATALOG,
      );
      expect(decoded.kind, `${invariantId} valid decode`).toBe("ready");
      if (decoded.kind !== "ready") continue;

      expect(validateRunState(decoded.state, RUN_STATE_CONTRACT_FIXTURE_CATALOG), `${invariantId} valid`).toEqual({
        ok: true,
        state: decoded.state,
      });
      expect(
        validateRunState(witness.invalid(decoded.state), RUN_STATE_CONTRACT_FIXTURE_CATALOG),
        `${invariantId} invalid`,
      ).toEqual({ ok: false, ...witness.expected });
    }
  });
});
