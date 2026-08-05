import { describe, expect, it } from "vitest";

import {
  PHASE_1_CATALOG,
  RUNNER_LABORATORY_CATALOG,
  RUN_STATE_CONTRACT_FIXTURE_CATALOG,
  STRICT_RUN_STATE_CONTRACT_CATALOG,
  createCatalogRegistry,
} from "./catalog";

const minimal = {
  stage: ["setup-shell-v1"],
  choice: ["choice-help-v1"],
  encounter: [{ id: "encounter-help-v1", kind: "caregiver" }],
  option: [{ id: "option-help-v1", encounterId: "encounter-help-v1", choiceId: "choice-help-v1" }],
} as const;

describe("catalog construction", () => {
  it("accepts immutable typed records with valid ownership", () => {
    const catalog = createCatalogRegistry(minimal);
    expect(catalog.has("option", "option-help-v1")).toBe(true);
    expect(catalog.metadata("option", "option-help-v1")).toMatchObject({
      encounterId: "encounter-help-v1",
      choiceId: "choice-help-v1",
    });
  });

  it("rejects invalid IDs, discriminators, and misplaced metadata", () => {
    expect(() => createCatalogRegistry({ stage: ["Bad ID"] })).toThrow(/Invalid stage catalog ID/);
    expect(() => createCatalogRegistry({ entity: [{ id: "entity-a-v1", kind: "caregiver" }] })).toThrow(/kind/);
    expect(() => createCatalogRegistry({ stage: [{ id: "stage-a-v1", kind: "active" }] })).toThrow(/not applicable/);
    expect(() => createCatalogRegistry({ choice: [{ id: "choice-a-v1", choiceId: "choice-a-v1" }] })).toThrow(/not applicable/);
    expect(() => createCatalogRegistry({
      stage: ["shared-id-v1"],
      choice: ["shared-id-v1"],
    })).toThrow(/across domains/);
  });

  it("rejects incomplete or dangling option ownership", () => {
    expect(() => createCatalogRegistry({ option: ["option-a-v1"] })).toThrow(/incomplete/);
    expect(() => createCatalogRegistry({
      choice: ["choice-a-v1"],
      encounter: [{ id: "encounter-a-v1", kind: "caregiver" }],
      option: [{ id: "option-a-v1", encounterId: "encounter-ghost-v1", choiceId: "choice-a-v1" }],
    })).toThrow(/unknown encounter/);
    expect(() => createCatalogRegistry({
      encounter: [{ id: "encounter-a-v1", kind: "caregiver" }],
      option: [{ id: "option-a-v1", encounterId: "encounter-a-v1", choiceId: "choice-ghost-v1" }],
    })).toThrow(/unknown choice/);
  });

  it("requires source/status metadata only on the domains that consume it", () => {
    expect(() => createCatalogRegistry({ "effect-category": ["effect-a-v1"] })).toThrow(/source metadata/);
    expect(() => createCatalogRegistry({ "terminal-reason": ["reason-a-v1"] })).toThrow(/status metadata/);
    expect(() => createCatalogRegistry({
      stage: [{ id: "stage-a-v1", allowedEffectSources: ["system"] }],
    })).toThrow(/not applicable/);
  });

  it("rejects forged domains and registry options instead of disabling strict IDs", () => {
    expect(() => createCatalogRegistry({ ...minimal, stages: ["wrong-domain-v1"] } as never)).toThrow(/Unknown catalog domain/);
    expect(() => createCatalogRegistry(minimal, { entityInstanceIdPolicy: "anything" } as never)).toThrow(/Invalid entity instance ID policy/);
    expect(() => createCatalogRegistry(minimal, { capabilities: "runner-laboratory-v1" } as never)).toThrow(/capabilities must be an array/);
    expect(() => createCatalogRegistry(minimal, { capabilities: ["anything"] } as never)).toThrow(/Invalid catalog capability/);
    expect(() => createCatalogRegistry(minimal, { surprise: true } as never)).toThrow(/Unknown catalog option/);
  });

  it("keeps Phase 1 semantics explicit while opting the laboratory catalog into its stricter profile", () => {
    expect(PHASE_1_CATALOG.capabilities).toEqual([]);
    expect(PHASE_1_CATALOG.hasCapability("runner-laboratory-v1")).toBe(false);
    expect(RUN_STATE_CONTRACT_FIXTURE_CATALOG.hasCapability("runner-laboratory-v1")).toBe(false);
    expect(RUNNER_LABORATORY_CATALOG.capabilities).toEqual(["runner-laboratory-v1"]);
    expect(RUNNER_LABORATORY_CATALOG.hasCapability("runner-laboratory-v1")).toBe(true);
  });

  it("adds every locked laboratory save reference without removing the Phase 1 catalog", () => {
    expect(PHASE_1_CATALOG.has("stage", "setup-shell-v1")).toBe(true);
    expect(PHASE_1_CATALOG.has("stage", "runner-lab-v1")).toBe(false);

    const priorContractIds = {
      stage: ["setup-shell-v1", "runner-lab-v1", "newborn-v1"],
      entity: ["runner-contract-hazard-v1", "runner-contract-benefit-v1"],
      "effect-category": ["choice-practice-v1", "hazard-depletion-v1", "recovery-bounded-v1"],
      choice: ["choice-ask-for-help-v1", "choice-other-v1"],
      option: ["option-ask-for-help-v1", "option-try-alone-v1", "option-other-v1"],
      fact: ["fact-asked-for-help-v1"],
      value: ["value-trust-support-v1"],
      memory: ["memory-first-support-v1"],
      credential: ["credential-practice-v1"],
      person: ["person-caregiver-a-v1"],
      condition: ["condition-supported-v1"],
      encounter: ["encounter-practice-help-v1"],
      consequence: [
        "consequence-support-callback-v1",
        "consequence-practice-result-v1",
        "consequence-replaced-support-v1",
      ],
      "text-input": ["text-input-support-v1"],
      "terminal-reason": ["reason-merged-into-support-v1", "reason-complete-v1", "reason-expired-v1"],
      acknowledgment: ["acknowledgment-support-recap-v1"],
    } as const;
    for (const [domain, ids] of Object.entries(priorContractIds)) {
      for (const id of ids) {
        expect(RUN_STATE_CONTRACT_FIXTURE_CATALOG.has(domain as keyof typeof priorContractIds, id)).toBe(true);
      }
    }

    const scoringEntities = [
      ["runner-lab-health-token-v1", "benefit"],
      ["runner-lab-happiness-token-v1", "benefit"],
      ["runner-lab-money-token-v1", "benefit"],
      ["runner-lab-clutter-hazard-v1", "hazard"],
      ["runner-lab-pressure-hazard-v1", "hazard"],
    ] as const;
    expect(RUNNER_LABORATORY_CATALOG.has("stage", "runner-lab-v1")).toBe(true);
    for (const [id, kind] of scoringEntities) {
      expect(RUNNER_LABORATORY_CATALOG.metadata("entity", id)?.kind).toBe(kind);
    }
    for (const id of [
      "runner-lab-start-marker-v1",
      "runner-lab-decision-marker-v1",
      "runner-lab-finish-marker-v1",
    ]) {
      expect(RUNNER_LABORATORY_CATALOG.metadata("entity", id)?.kind).toBe("opportunity");
    }

    expect(RUNNER_LABORATORY_CATALOG.metadata("effect-category", "runner-benefit-v1")?.allowedEffectSources).toEqual(["runner"]);
    expect(RUNNER_LABORATORY_CATALOG.metadata("effect-category", "runner-hazard-v1")?.allowedEffectSources).toEqual(["runner"]);
    expect(RUNNER_LABORATORY_CATALOG.metadata("effect-category", "runner-lab-automatic-settlement-effect-v1")?.allowedEffectSources).toEqual(["system"]);
    expect(RUNNER_LABORATORY_CATALOG.metadata("fact", "fact-runner-laboratory-complete-v1")?.kind).toBe("learning");
    expect(RUNNER_LABORATORY_CATALOG.has("value", "value-runner-laboratory-practice-v1")).toBe(true);
    expect(RUNNER_LABORATORY_CATALOG.metadata("memory", "memory-runner-laboratory-complete-v1")?.kind).toBe("milestone");
  });

  it("keeps synthetic fixture and production laboratory ID surfaces disjoint", () => {
    for (const catalog of [
      RUN_STATE_CONTRACT_FIXTURE_CATALOG,
      STRICT_RUN_STATE_CONTRACT_CATALOG,
    ]) {
      expect(catalog.has("entity", "runner-lab-health-token-v1")).toBe(false);
      expect(catalog.has("effect-category", "runner-benefit-v1")).toBe(false);
      expect(catalog.has("fact", "fact-runner-laboratory-complete-v1")).toBe(false);
      expect(catalog.has("value", "value-runner-laboratory-practice-v1")).toBe(false);
      expect(catalog.has("memory", "memory-runner-laboratory-complete-v1")).toBe(false);
    }

    expect(RUNNER_LABORATORY_CATALOG.has("stage", "setup-shell-v1")).toBe(true);
    expect(RUNNER_LABORATORY_CATALOG.has("entity", "runner-contract-hazard-v1")).toBe(false);
    expect(RUNNER_LABORATORY_CATALOG.has("effect-category", "choice-practice-v1")).toBe(false);
    expect(RUNNER_LABORATORY_CATALOG.has("choice", "choice-ask-for-help-v1")).toBe(false);
    expect(RUNNER_LABORATORY_CATALOG.has("memory", "memory-first-support-v1")).toBe(false);
  });
});
