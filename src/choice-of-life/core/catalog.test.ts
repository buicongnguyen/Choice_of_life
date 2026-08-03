import { describe, expect, it } from "vitest";

import { createCatalogRegistry } from "./catalog";

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
    expect(() => createCatalogRegistry(minimal, { surprise: true } as never)).toThrow(/Unknown catalog option/);
  });
});
