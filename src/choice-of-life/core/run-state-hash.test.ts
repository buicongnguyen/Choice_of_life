import { describe, expect, it } from "vitest";
import lockedCorpus from "../../../docs/save/run-state-v1-fixture-corpus.json";
import { fnv1a64Hex } from "./canonical-json";
import { RUN_STATE_CONTRACT_FIXTURE_CATALOG } from "./catalog";
import { deriveRunIdV1 } from "./run-factory";
import { decodeRunState, encodeRunState } from "./run-state-codec";
import {
  createCompletedConsequenceFixture,
  createCompletedRunStateFixture,
  createMaximalRunStateFixture,
  createPresentingEncounterFixture,
  createRunStateFixtureCorpus,
  createShellRunStateFixture,
  createSyntheticV0Fixture,
  createUnpresentedResolutionFixture,
  createUnresolvedRecoveryFixture,
} from "./run-state-fixtures";
import {
  canonicalRunStateIdentityV1,
  canonicalRunStateJsonV1,
  canonicalRunStateProjectionV1,
  RUN_STATE_HASH_EXCLUDED_ACCESSIBILITY_KEYS_V1,
  RUN_STATE_HASH_EXCLUDED_APPEARANCE_KEYS_V1,
  stateHashV1,
} from "./run-state-hash";
import { zeroSourceTotals, type RunStateV1 } from "./run-state";

type Primitive = null | string | number | boolean;

function pointerEscape(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function primitiveLeaves(value: unknown, path = ""): ReadonlyMap<string, Primitive> {
  const leaves = new Map<string, Primitive>();
  const visit = (current: unknown, currentPath: string): void => {
    if (current === null || typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
      leaves.set(currentPath || "/", current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}/${index}`));
      return;
    }
    if (typeof current === "object") {
      for (const [key, item] of Object.entries(current)) visit(item, `${currentPath}/${pointerEscape(key)}`);
    }
  };
  visit(value, path);
  return leaves;
}

function normalizedPointer(path: string): string {
  return path.replace(/\/(?:0|[1-9][0-9]*)(?=\/|$)/g, "/*");
}

function pointerSegments(path: string): readonly string[] {
  return path.split("/").slice(1).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function cloneWithPrimitive(state: RunStateV1, path: string, value: Primitive): RunStateV1 {
  const clone = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  const segments = [...pointerSegments(path)];
  const key = segments.pop();
  if (key === undefined) throw new Error("Cannot replace root primitive");
  let parent: unknown = clone;
  for (const segment of segments) {
    parent = Array.isArray(parent)
      ? parent[Number(segment)]
      : (parent as Record<string, unknown>)[segment];
  }
  if (Array.isArray(parent)) parent[Number(key)] = value;
  else (parent as Record<string, unknown>)[key] = value;
  const candidate = clone as unknown as RunStateV1;
  if (["/runSeed", "/difficulty", "/controlMode", "/identity/gender"].includes(path)) {
    return {
      ...candidate,
      runId: deriveRunIdV1(candidate.runSeed, {
        startingProfileId: candidate.startingProfileId,
        difficulty: candidate.difficulty,
        controlMode: candidate.controlMode,
        identity: candidate.identity,
      }),
    };
  }
  return candidate;
}

function candidateValues(value: Primitive, observed: readonly Primitive[], path: string): readonly Primitive[] {
  const values: Primitive[] = observed.filter((candidate) => !Object.is(candidate, value));
  if (path === "/appearance/heritageStyleId") values.push(value === "asian" ? "western" : "asian");
  if (path === "/difficulty") values.push(value === "challenge" ? "normal" : "challenge");
  if (path === "/identity/gender") values.push(value === "male" ? "female" : "male");
  if (path === "/storyState/relationships/*/kind") values.push(value === "friend" ? "mentor" : "friend");
  if (path === "/storyState/relationships/*/status") values.push(value === "distant" ? "active" : "distant");
  if (path === "/storyState/memories/*/stageId" || path === "/storyState/credentials/*/earnedStageId") {
    values.push(value === "newborn-v1" ? "runner-lab-v1" : "newborn-v1");
  }
  if (path === "/encounter/optionIds/*") values.push("option-other-v1");
  if (path === "/encounter/selectedOptionId") values.push("option-try-alone-v1");
  if (path === "/consequences/pending/*/consequenceId") values.push("consequence-replaced-support-v1");
  if (path === "/consequences/pending/*/dueStageId") values.push("runner-lab-v1");
  if (path === "/consequences/terminal/*/consequenceId") values.push("consequence-practice-result-v1");
  if (path === "/consequences/terminal/*/terminalReasonId") values.push("reason-complete-v1");
  if (value === null) values.push("choice-ask-for-help-v1", "instance-alternative", 0, true);
  else if (typeof value === "boolean") values.push(!value);
  else if (typeof value === "number") values.push(value + 1, value > 0 ? value - 1 : 1, 0);
  else values.push("alternative-v1", `${value}-alternative`);
  return values.filter((candidate, index) =>
    !Object.is(candidate, value)
    && JSON.stringify(candidate) !== JSON.stringify(value)
    && values.findIndex((item) => Object.is(item, candidate)) === index,
  );
}

function decodeReady(state: RunStateV1, label: string): RunStateV1 | null {
  const decoded = decodeRunState(encodeRunState(state), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
  expect(decoded.kind, label).toBe("ready");
  return decoded.kind === "ready" ? decoded.state : null;
}

function expectValid(state: RunStateV1, label: string): void {
  expect(decodeReady(state, label)).toEqual(state);
}

function tryDecode(state: RunStateV1): RunStateV1 | null {
  try {
    const decoded = decodeRunState(encodeRunState(state), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    return decoded.kind === "ready" ? decoded.state : null;
  } catch {
    return null;
  }
}

function pointerPatternMatches(path: string, pattern: string): boolean {
  const pathSegments = pointerSegments(path);
  const patternSegments = pointerSegments(pattern);
  return pathSegments.length >= patternSegments.length
    && patternSegments.every((segment, index) => segment === "*" || segment === pathSegments[index]);
}

function changedPrimitivePointers(before: RunStateV1, after: RunStateV1): ReadonlySet<string> {
  const left = primitiveLeaves(before);
  const right = primitiveLeaves(after);
  const paths = new Set([...left.keys(), ...right.keys()]);
  return new Set([...paths].filter((path) => !Object.is(left.get(path), right.get(path))));
}

function pairedSourceTotals(): RunStateV1["effectLedger"]["totalsBySource"] {
  const template = zeroSourceTotals();
  return Object.fromEntries(Object.entries(template).map(([source, totals]) => [
    source,
    Object.fromEntries(Object.keys(totals).map((key) => [key, 1])),
  ])) as unknown as RunStateV1["effectLedger"]["totalsBySource"];
}

type CorrelatedPair = readonly [RunStateV1, RunStateV1];

function createCorrelatedMutationHandlers(): Readonly<Record<string, () => CorrelatedPair>> {
  const base = createMaximalRunStateFixture();
  const recoveryIndex = base.effectLedger.recent.findIndex((effect) => effect.source === "recovery");
  const triggerIndex = base.effectLedger.recent.findIndex((effect) => effect.source === "runner");
  const recoveryEffect = base.effectLedger.recent[recoveryIndex];
  const triggerEffect = base.effectLedger.recent[triggerIndex];
  if (recoveryEffect === undefined || triggerEffect === undefined) throw new Error("Correlated recovery fixture is incomplete");

  const motionMutant: RunStateV1 = {
    ...base,
    runner: base.runner === null ? null : {
      ...base.runner,
      motion: { kind: "moving", currentLane: 0, sourceLane: 0, targetLane: 1, elapsedTicks: 3, totalTicks: 11 },
    },
  };
  const recoveryMutant: RunStateV1 = {
    ...base,
    scores: { health: 3, happiness: 7, money: 3 },
    effectLedger: {
      recent: [
        { ...triggerEffect, before: 4, actualDelta: -4 },
        {
          ...triggerEffect,
          effectId: "effect-runner-happiness-atomic-0001",
          scoreId: "happiness",
          requestedDelta: -58,
          before: 58,
          actualDelta: -58,
        },
        {
          ...triggerEffect,
          effectId: "effect-runner-money-atomic-0001",
          scoreId: "money",
          requestedDelta: -34,
          before: 34,
          actualDelta: -34,
        },
        { ...recoveryEffect, requestedDelta: 3, after: 3, actualDelta: 3 },
        {
          ...recoveryEffect,
          effectId: "effect-recovery-happiness-atomic-0001",
          scoreId: "happiness",
          requestedDelta: 3,
          after: 3,
          actualDelta: 3,
        },
        {
          ...recoveryEffect,
          effectId: "effect-recovery-money-atomic-0001",
          scoreId: "money",
          requestedDelta: 3,
          after: 3,
          actualDelta: 3,
        },
        {
          ...base.effectLedger.recent[2]!,
          before: 3,
          after: 7,
        },
      ],
      totalsBySource: {
        ...base.effectLedger.totalsBySource,
        runner: {
          ...base.effectLedger.totalsBySource.runner,
          happinessNegative: 61,
          moneyNegative: 36,
        },
        recovery: {
          ...base.effectLedger.totalsBySource.recovery,
          healthPositive: 3,
          happinessPositive: 3,
          moneyPositive: 3,
        },
      },
    },
    recovery: base.recovery === null ? null : {
      ...base.recovery,
      preTriggerScores: { health: 4, happiness: 58, money: 34 },
      recoveryTarget: 3,
      targetScores: { health: 3, happiness: 3, money: 3 },
    },
  };
  const transactionId = "consequence-tx-0101";
  const transactionMutant: RunStateV1 = {
    ...base,
    effectLedger: {
      ...base.effectLedger,
      recent: base.effectLedger.recent.map((effect) => effect.transactionId === "consequence-tx-0001"
        ? { ...effect, transactionId }
        : effect),
    },
    encounter: base.encounter === null ? null : { ...base.encounter, transactionId, resolutionTransactionId: transactionId },
    consequences: {
      ...base.consequences,
      resolved: base.consequences.resolved.map((item) => item.transactionId === "consequence-tx-0001"
        ? { ...item, transactionId }
        : item),
    },
  };
  const profileBaseSeed = createMaximalRunStateFixture();
  const emptyTotals = zeroSourceTotals();
  const profileBase: RunStateV1 = {
    ...profileBaseSeed,
    scores: { health: 66, happiness: 60, money: 35 },
    effectLedger: {
      recent: [],
      totalsBySource: {
        ...emptyTotals,
        system: { ...emptyTotals.system, healthPositive: 1 },
      },
    },
    storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
    runner: profileBaseSeed.runner === null ? null : { ...profileBaseSeed.runner, invulnerableUntilTick: 0 },
    recovery: null,
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
  };
  const profileTotals = pairedSourceTotals();
  const profileMutant: RunStateV1 = {
    ...profileBase,
    startingProfileId: "physical-head-start-v1",
    scores: { health: 69, happiness: 59, money: 34 },
    effectLedger: {
      recent: [],
      totalsBySource: {
        ...profileTotals,
        system: {
          ...profileTotals.system,
          healthPositive: 2,
          healthNegative: 2,
          happinessPositive: 3,
          happinessNegative: 1,
        },
      },
    },
    runId: deriveRunIdV1(profileBase.runSeed, {
      startingProfileId: "physical-head-start-v1",
      difficulty: profileBase.difficulty,
      controlMode: profileBase.controlMode,
      identity: profileBase.identity,
    }),
  };
  const isolatedEffect = {
    effectId: "effect-system-isolated-0001",
    scoreId: "health" as const,
    requestedDelta: 1,
    source: "system" as const,
    categoryId: "choice-practice-v1",
    causedByChoiceId: null,
    transactionId: null,
    before: 65,
    after: 66,
    actualDelta: 1,
    simulationTick: 4000,
  };
  const effectBase: RunStateV1 = {
    ...profileBase,
    effectLedger: { ...profileBase.effectLedger, recent: [isolatedEffect] },
  };
  const isolatedEffectMutant: RunStateV1 = {
    ...effectBase,
    scores: { ...effectBase.scores, health: 67 },
    effectLedger: {
      recent: [{ ...isolatedEffect, requestedDelta: 3, before: 64, after: 67, actualDelta: 3 }],
      totalsBySource: {
        ...effectBase.effectLedger.totalsBySource,
        system: { ...effectBase.effectLedger.totalsBySource.system, healthPositive: 3, healthNegative: 1 },
      },
    },
  };
  const completed = createCompletedConsequenceFixture();
  const completedTerminal = completed.consequences.terminal[0];
  if (completedTerminal === undefined) throw new Error("Correlated terminal fixture is incomplete");
  const terminalMutant: RunStateV1 = {
    ...completed,
    consequences: {
      ...completed.consequences,
      terminal: [{ ...completedTerminal, causedByChoiceId: "choice-ask-for-help-v1" }],
    },
  };

  return {
    [JSON.stringify(["/startingProfileId", "/scores", "/effectLedger/totalsBySource"])]: () => [profileBase, profileMutant],
    [JSON.stringify(["/effectLedger/recent/*/requestedDelta", "/effectLedger/recent/*/before", "/effectLedger/recent/*/after", "/effectLedger/recent/*/actualDelta", "/effectLedger/totalsBySource"])]: () => [effectBase, isolatedEffectMutant],
    [JSON.stringify(["/runner/motion/currentLane", "/runner/motion/sourceLane", "/runner/motion/targetLane", "/runner/motion/elapsedTicks"])]: () => [base, motionMutant],
    [JSON.stringify(["/recovery/preTriggerScores", "/recovery/recoveryTarget", "/recovery/targetScores", "/scores", "/effectLedger"])]: () => [base, recoveryMutant],
    [JSON.stringify(["/encounter/transactionId", "/encounter/resolutionTransactionId", "/consequences/resolved", "/effectLedger/recent/*/transactionId"])]: () => [base, transactionMutant],
    [JSON.stringify(["/consequences/terminal/*/status", "/consequences/terminal/*/resolution", "/consequences/terminal/*/supersededByTransactionId", "/consequences/terminal/*/acknowledgmentId"])]: () => [base, terminalMutant],
  };
}

interface SupplementalWitness {
  readonly paths: readonly string[];
  readonly before: RunStateV1;
  readonly after: RunStateV1;
}

function createSupplementalMutationWitnesses(): readonly SupplementalWitness[] {
  const base = createMaximalRunStateFixture();
  if (base.runner === null || base.recovery === null || base.encounter === null) {
    throw new Error("Supplemental active fixture is incomplete");
  }
  const secondEntity = base.runner.activeEntities[1];
  if (secondEntity === undefined) throw new Error("Supplemental entity fixture is incomplete");

  const entityKindMutant: RunStateV1 = {
    ...base,
    runner: {
      ...base.runner,
      activeEntities: [
        base.runner.activeEntities[0]!,
        { ...secondEntity, contentId: "runner-contract-hazard-v1", kind: "hazard" },
      ],
    },
  };
  const entityPatternMutant: RunStateV1 = {
    ...base,
    runner: {
      ...base.runner,
      spawn: { ...base.runner.spawn, patternIndex: 8 },
      activeEntities: [base.runner.activeEntities[0]!, { ...secondEntity, patternIndex: 8 }],
    },
  };
  const triggerEntityMutant: RunStateV1 = {
    ...base,
    runner: {
      ...base.runner,
      activeEntities: [
        base.runner.activeEntities[0]!,
        { ...secondEntity, contentId: "runner-contract-hazard-v1", kind: "hazard", contactState: "contacted" },
      ],
    },
    recovery: { ...base.recovery, triggerEntityInstanceId: secondEntity.instanceId },
  };
  const triggerIndex = base.effectLedger.recent.findIndex((effect) => effect.source === "runner");
  if (triggerIndex < 0) throw new Error("Supplemental trigger effect is missing");
  const clockMutant: RunStateV1 = {
    ...base,
    effectLedger: {
      ...base.effectLedger,
      recent: base.effectLedger.recent.map((effect, index) => index === triggerIndex
        ? { ...effect, simulationTick: effect.simulationTick + 1 }
        : effect),
    },
    runner: { ...base.runner, invulnerableUntilTick: base.runner.invulnerableUntilTick + 1 },
    recovery: {
      ...base.recovery,
      startedTick: base.recovery.startedTick + 1,
      invulnerableUntilTick: base.recovery.invulnerableUntilTick + 1,
    },
  };
  const optionOrderMutant: RunStateV1 = {
    ...base,
    encounter: { ...base.encounter, optionIds: [...base.encounter.optionIds].reverse() },
  };
  const pending = base.consequences.pending[0];
  const resolved = base.consequences.resolved[0];
  const terminal = base.consequences.terminal[0];
  if (pending === undefined || resolved === undefined || terminal?.status !== "superseded") {
    throw new Error("Supplemental consequence fixture is incomplete");
  }
  const pendingTransactionId = "consequence-tx-0200";
  const pendingTransactionMutant: RunStateV1 = {
    ...base,
    consequences: {
      pending: [{ ...pending, transactionId: pendingTransactionId }],
      resolved: [{
        ...resolved,
        resolution: {
          ...resolved.resolution,
          scheduledConsequenceTransactionIds: [pendingTransactionId],
        },
      }],
      terminal: [{ ...terminal, supersededByTransactionId: pendingTransactionId }],
    },
  };
  const presenting = createPresentingEncounterFixture();
  const rootPending = {
    transactionId: "consequence-root-pending-0001",
    consequenceId: "consequence-support-callback-v1",
    status: "pending" as const,
    causedByChoiceId: null,
    dueStageId: "runner-lab-v1",
    dueTick: 5000,
    effectIds: [],
  };
  const pendingCauseBase: RunStateV1 = {
    ...presenting,
    consequences: { ...presenting.consequences, pending: [rootPending] },
  };
  const pendingCauseMutant: RunStateV1 = {
    ...pendingCauseBase,
    consequences: {
      ...pendingCauseBase.consequences,
      pending: [{ ...rootPending, causedByChoiceId: "choice-ask-for-help-v1" }],
    },
  };
  const choiceEffectIndex = base.effectLedger.recent.findIndex((effect) => effect.transactionId === resolved.transactionId);
  const choiceEffect = base.effectLedger.recent[choiceEffectIndex];
  if (choiceEffect === undefined) throw new Error("Supplemental choice effect is missing");
  const replacementTransactionId = "consequence-tx-0300";
  const replacementEffectId = "effect-choice-replacement-0001";
  const resolutionMutant: RunStateV1 = {
    ...base,
    effectLedger: {
      ...base.effectLedger,
      recent: base.effectLedger.recent.map((effect, index) => index === choiceEffectIndex
        ? { ...choiceEffect, effectId: replacementEffectId, simulationTick: 4201 }
        : effect),
    },
    encounter: { ...base.encounter, selectedOptionId: "option-try-alone-v1" },
    consequences: {
      pending: [{ ...pending, transactionId: replacementTransactionId }],
      resolved: [{
        ...resolved,
        consequenceId: "consequence-support-callback-v1",
        resolution: {
          ...resolved.resolution,
          selectedOptionId: "option-try-alone-v1",
          appliedEffectIds: [replacementEffectId],
          factResultIds: [],
          relationshipResultIds: [],
          scheduledConsequenceTransactionIds: [replacementTransactionId],
          resultTextInputIds: [],
          resolvedTick: 4201,
        },
      }],
      terminal: [{ ...terminal, supersededByTransactionId: replacementTransactionId }],
    },
  };
  const causeEffect = { ...choiceEffect, source: "system" as const, causedByChoiceId: null };
  const resolvedCauseMutant: RunStateV1 = {
    ...base,
    effectLedger: {
      recent: base.effectLedger.recent.map((effect, index) => index === choiceEffectIndex ? causeEffect : effect),
      totalsBySource: {
        ...base.effectLedger.totalsBySource,
        choice: { ...base.effectLedger.totalsBySource.choice, happinessPositive: 0 },
        system: { ...base.effectLedger.totalsBySource.system, happinessPositive: 4 },
      },
    },
    encounter: null,
    consequences: {
      ...base.consequences,
      pending: [{ ...pending, causedByChoiceId: null }],
      resolved: [{ ...resolved, causedByChoiceId: null }],
    },
    storyState: {
      ...base.storyState,
      facts: base.storyState.facts.map((fact) => ({ ...fact, originChoiceId: null })),
    },
  };

  return [
    {
      paths: ["/runStatus", "/stage/phase", "/stage/settlement", "/stage/settlement/status"],
      before: createShellRunStateFixture(),
      after: createCompletedRunStateFixture(),
    },
    { paths: ["/runner"], before: createShellRunStateFixture(), after: base },
    { paths: ["/recovery"], before: presenting, after: base },
    { paths: ["/encounter"], before: createUnresolvedRecoveryFixture("offered"), after: base },
    { paths: ["/runner/motion/kind"], before: presenting, after: base },
    { paths: ["/runner/activeEntities/*/contentId", "/runner/activeEntities/*/kind"], before: base, after: entityKindMutant },
    { paths: ["/runner/activeEntities/*/patternIndex"], before: base, after: entityPatternMutant },
    { paths: ["/recovery/triggerEntityInstanceId"], before: base, after: triggerEntityMutant },
    { paths: ["/recovery/startedTick", "/recovery/invulnerableUntilTick"], before: base, after: clockMutant },
    { paths: ["/encounter/optionIds/*"], before: base, after: optionOrderMutant },
    { paths: ["/consequences/pending/*/transactionId"], before: base, after: pendingTransactionMutant },
    { paths: ["/consequences/pending/*/causedByChoiceId"], before: pendingCauseBase, after: pendingCauseMutant },
    { paths: ["/consequences/resolved/*/status"], before: createUnpresentedResolutionFixture(), after: base },
    { paths: ["/consequences/resolved/*/causedByChoiceId"], before: base, after: resolvedCauseMutant },
    {
      paths: [
        "/consequences/resolved/*/consequenceId",
        "/consequences/resolved/*/resolution/selectedOptionId",
        "/consequences/resolved/*/resolution/appliedEffectIds/*",
        "/consequences/resolved/*/resolution/factResultIds/*",
        "/consequences/resolved/*/resolution/relationshipResultIds/*",
        "/consequences/resolved/*/resolution/scheduledConsequenceTransactionIds/*",
        "/consequences/resolved/*/resolution/resultTextInputIds/*",
        "/consequences/resolved/*/resolution/resolvedTick",
      ],
      before: base,
      after: resolutionMutant,
    },
  ];
}

describe("run-state canonical hash", () => {
  it("has a stable lowercase 64-bit known answer", () => {
    const state = decodeReady(createMaximalRunStateFixture(), "known-answer fixture");
    if (state === null) return;
    expect(stateHashV1(state)).toMatch(/^[0-9a-f]{16}$/);
    expect(stateHashV1(state)).toBe("1e20850f35f09fc9");
  });

  it("excludes exactly appearance/accessibility presentation fields", () => {
    const state = decodeReady(createMaximalRunStateFixture(), "cosmetic base");
    if (state === null) return;
    const cosmetic: RunStateV1 = {
      ...state,
      appearance: {
        heritageStyleId: "western" as const,
        hairStyleId: "wavy-bob" as const,
        hairColorId: "silver" as const,
        clothingPaletteId: "berry" as const,
      },
      accessibility: {
        highContrast: false,
        reducedMotion: false,
        textScale: 200 as const,
        screenReaderAnnouncements: false,
      },
    };
    const decodedCosmetic = decodeReady(cosmetic, "cosmetic mutant");
    if (decodedCosmetic === null) return;
    expect(stateHashV1(decodedCosmetic)).toBe(stateHashV1(state));
    expect(canonicalRunStateProjectionV1(state)).toMatchObject({ appearance: {}, accessibility: {} });
  });

  it("restores all eight excluded leaves in the full canonical identity", () => {
    const state = decodeReady(createMaximalRunStateFixture(), "identity base");
    if (state === null) return;
    expect([
      ...RUN_STATE_HASH_EXCLUDED_APPEARANCE_KEYS_V1,
      ...RUN_STATE_HASH_EXCLUDED_ACCESSIBILITY_KEYS_V1,
    ].sort()).toEqual([
      "clothingPaletteId",
      "hairColorId",
      "hairStyleId",
      "heritageStyleId",
      "highContrast",
      "reducedMotion",
      "screenReaderAnnouncements",
      "textScale",
    ]);
    const baseIdentity = canonicalRunStateIdentityV1(state);
    expect(fnv1a64Hex(baseIdentity.gameplayCanonicalJson))
      .toBe(stateHashV1(state));
    const mutations = [
      ["/appearance/heritageStyleId", state.appearance.heritageStyleId === "western" ? "asian" : "western"],
      ["/appearance/hairStyleId", state.appearance.hairStyleId === "wavy-bob" ? "tied-back" : "wavy-bob"],
      ["/appearance/hairColorId", state.appearance.hairColorId === "silver" ? "black" : "silver"],
      ["/appearance/clothingPaletteId", state.appearance.clothingPaletteId === "berry" ? "ocean" : "berry"],
      ["/accessibility/highContrast", !state.accessibility.highContrast],
      ["/accessibility/reducedMotion", !state.accessibility.reducedMotion],
      ["/accessibility/textScale", state.accessibility.textScale === 200 ? 100 : 200],
      ["/accessibility/screenReaderAnnouncements", !state.accessibility.screenReaderAnnouncements],
    ] as const;
    for (const [path, value] of mutations) {
      const mutant = decodeReady(
        cloneWithPrimitive(state, path, value),
        `full canonical identity ${path}`,
      );
      if (mutant === null) continue;
      const mutantIdentity = canonicalRunStateIdentityV1(mutant);
      expect(mutantIdentity.gameplayCanonicalJson, path)
        .toBe(baseIdentity.gameplayCanonicalJson);
      expect(stateHashV1(mutant), path).toBe(stateHashV1(state));
      expect(fnv1a64Hex(mutantIdentity.gameplayCanonicalJson), path)
        .toBe(stateHashV1(mutant));
      expect(mutantIdentity.fullCanonicalIdentity, path)
        .not.toBe(baseIdentity.fullCanonicalIdentity);
      expect(fnv1a64Hex(mutantIdentity.fullCanonicalIdentity), path)
        .not.toBe(fnv1a64Hex(baseIdentity.fullCanonicalIdentity));
    }
  });

  it("includes identity, control mode, difficulty, and transaction state", () => {
    const state = createMaximalRunStateFixture();
    const alternatives = [
      cloneWithPrimitive(state, "/identity/gender", "male"),
      cloneWithPrimitive(state, "/controlMode", "automatic-assist"),
      cloneWithPrimitive(state, "/difficulty", "challenge"),
      cloneWithPrimitive(state, "/simulationTick", state.simulationTick + 1),
    ];
    for (const alternative of alternatives) {
      const decoded = decodeReady(alternative, "mechanical identity mutant");
      if (decoded !== null) expect(stateHashV1(decoded)).not.toBe(stateHashV1(state));
    }
  });

  it("is invariant to insertion order", () => {
    const state = createMaximalRunStateFixture();
    const reordered = { ...state, scores: { money: state.scores.money, health: state.scores.health, happiness: state.scores.happiness } };
    const decodedState = decodeReady(state, "insertion-order base");
    const decodedReordered = decodeReady(reordered, "insertion-order mutant");
    if (decodedState === null || decodedReordered === null) return;
    expect(canonicalRunStateJsonV1(decodedReordered)).toBe(canonicalRunStateJsonV1(decodedState));
    expect(stateHashV1(decodedReordered)).toBe(stateHashV1(decodedState));
  });

  it("projects every nonexcluded primitive from every locked branch fixture and no excluded primitive", () => {
    const excluded = /^\/(?:appearance|accessibility)\//;
    for (const { id, state } of createRunStateFixtureCorpus()) {
      expectValid(state, id);
      const source = primitiveLeaves(state);
      const projection = primitiveLeaves(canonicalRunStateProjectionV1(state));
      for (const [path, value] of source) {
        if (excluded.test(path)) {
          expect(projection.has(path), `${id}:${path} must be excluded`).toBe(false);
        } else {
          expect(projection.get(path), `${id}:${path} must be projected exactly`).toEqual(value);
        }
      }
      for (const path of projection.keys()) expect(source.has(path), `${id}:${path} cannot be synthesized`).toBe(true);
    }
  });

  it("visits every primitive leaf, validates every sensitivity mutant first, and proves rejection or hash behavior", () => {
    expect(Object.values(lockedCorpus.hashSensitivity).every(Boolean)).toBe(true);
    const corpus = createRunStateFixtureCorpus();
    const observed = new Map<string, Primitive[]>();
    for (const { state } of corpus) {
      for (const [path, value] of primitiveLeaves(state)) {
        const key = normalizedPointer(path);
        const list = observed.get(key) ?? [];
        if (!list.some((item) => Object.is(item, value))) list.push(value);
        observed.set(key, list);
      }
    }
    const independentlyMutable = new Set<string>();
    const excludedMutable = new Set<string>();
    const attempted = new Set<string>();
    for (const { id, state } of corpus) {
      const originalHash = stateHashV1(state);
      for (const [path, value] of primitiveLeaves(state)) {
        const normalized = normalizedPointer(path);
        const candidates = candidateValues(value, observed.get(normalized) ?? [], normalized);
        expect(candidates.length, `${id}:${path} must have attempted alternatives`).toBeGreaterThan(0);
        for (const candidate of candidates) {
          attempted.add(normalized);
          let mutant: RunStateV1;
          try {
            mutant = cloneWithPrimitive(state, path, candidate);
          } catch {
            continue;
          }
          expect(primitiveLeaves(mutant).get(path), `${id}:${path} source mutation`).toEqual(candidate);
          const decoded = tryDecode(mutant);
          if (decoded === null) continue;
          if (/^\/(?:appearance|accessibility)\//.test(path)) {
            excludedMutable.add(normalized);
            expect(encodeRunState(decoded), `${id}:${path} must alter the full envelope`).not.toBe(encodeRunState(state));
            expect(canonicalRunStateJsonV1(decoded), `${id}:${path} must remain excluded`)
              .toBe(canonicalRunStateJsonV1(state));
            expect(stateHashV1(decoded), `${id}:${path} excluded`).toBe(originalHash);
          } else {
            independentlyMutable.add(normalized);
            expect(canonicalRunStateJsonV1(decoded), `${id}:${path} must alter canonical JSON`)
              .not.toBe(canonicalRunStateJsonV1(state));
            expect(stateHashV1(decoded), `${id}:${path} included`).not.toBe(originalHash);
          }
          break;
        }
      }
    }
    const expectedPaths = new Set([...observed.keys()]);
    const excludedPaths = new Set([
      "/appearance/heritageStyleId", "/appearance/hairStyleId", "/appearance/hairColorId",
      "/appearance/clothingPaletteId", "/accessibility/highContrast", "/accessibility/reducedMotion",
      "/accessibility/textScale", "/accessibility/screenReaderAnnouncements",
    ]);
    expect(excludedMutable).toEqual(excludedPaths);

    const correlatedWitnessed = new Set<string>();
    for (const handler of Object.values(createCorrelatedMutationHandlers())) {
      const [before, after] = handler();
      const decodedBefore = tryDecode(before);
      const decodedAfter = tryDecode(after);
      expect(decodedBefore, "correlated classification base must decode").not.toBeNull();
      expect(decodedAfter, "correlated classification mutant must decode").not.toBeNull();
      if (decodedBefore === null || decodedAfter === null) continue;
      for (const path of changedPrimitivePointers(decodedBefore, decodedAfter)) {
        correlatedWitnessed.add(normalizedPointer(path));
      }
    }
    const correlated = new Set([...expectedPaths].filter((path) =>
      !independentlyMutable.has(path)
      && !excludedMutable.has(path)
      && correlatedWitnessed.has(path),
    ));
    const supplementalWitnessed = new Set<string>();
    for (const { paths, before, after } of createSupplementalMutationWitnesses()) {
      const decodedBefore = tryDecode(before);
      const decodedAfter = tryDecode(after);
      expect(decodedBefore, `supplemental base ${paths.join(",")}`).not.toBeNull();
      expect(decodedAfter, `supplemental mutant ${paths.join(",")}`).not.toBeNull();
      if (decodedBefore === null || decodedAfter === null) continue;
      const changed = new Set([...changedPrimitivePointers(decodedBefore, decodedAfter)].map(normalizedPointer));
      for (const path of paths) {
        expect(changed.has(path), `supplemental witness must change ${path}`).toBe(true);
        if (!excludedMutable.has(path) && !independentlyMutable.has(path) && !correlated.has(path)) {
          supplementalWitnessed.add(path);
        }
      }
      expect(stateHashV1(decodedAfter), `supplemental hash ${paths.join(",")}`).not.toBe(stateHashV1(decodedBefore));
    }
    const immutableEvidence = new Map<string, string>([
      ["/schemaVersion", "schema v1 constant; alternatives are decoder-rejected and the v0 migration has its own KAT"],
      ["/contentVersion", "phase-1-v1 catalog constant; alternatives are decoder-rejected"],
      ["/storyState/facts/*/factId", "contract fixture catalog has one fact ID"],
      ["/storyState/facts/*/kind", "fact kind is locked to the singleton catalog metadata"],
      ["/storyState/facts/*/valueId", "contract fixture catalog has one value ID"],
      ["/storyState/memories/*/memoryId", "contract fixture catalog has one memory ID"],
      ["/storyState/memories/*/kind", "memory kind is locked to the singleton catalog metadata"],
      ["/storyState/credentials/*/credentialId", "contract fixture catalog has one credential ID"],
      ["/storyState/credentials/*/kind", "credential kind is locked to the singleton catalog metadata"],
      ["/storyState/relationships/*/personId", "contract fixture catalog has one person ID"],
      ["/storyState/conditions/*/conditionId", "contract fixture catalog has one condition ID"],
      ["/storyState/conditions/*/kind", "condition kind is locked to the singleton catalog metadata"],
      ["/runner/motion/totalTicks", "lane tween length is the structural constant 11"],
      ["/encounter/encounterId", "contract fixture catalog has one encounter ID"],
      ["/encounter/kind", "encounter kind is locked to the singleton catalog metadata"],
      ["/consequences/pending/*/status", "pending-list entries have the structural literal status pending"],
    ]);
    const categoryCount = (path: string): number => [
      excludedMutable.has(path),
      independentlyMutable.has(path),
      correlated.has(path),
      supplementalWitnessed.has(path),
      immutableEvidence.has(path),
    ].filter(Boolean).length;
    expect([...expectedPaths].filter((path) => categoryCount(path) === 0), "unclassified primitive paths").toEqual([]);
    const classified = new Set<string>();
    for (const path of expectedPaths) {
      expect(categoryCount(path), `${path} must have exactly one sensitivity classification`).toBe(1);
      classified.add(path);
    }
    expect(classified).toEqual(expectedPaths);
    for (const [path, evidence] of immutableEvidence) {
      expect(attempted.has(path), `${path}: ${evidence}`).toBe(true);
      expect(independentlyMutable.has(path), `${path}: ${evidence}`).toBe(false);
    }
  });

  it("executes every locked correlated mutation group with valid typed states", () => {
    const handlers = createCorrelatedMutationHandlers();
    const lockedKeys = lockedCorpus.correlatedHashMutationGroups.map((group) => JSON.stringify(group));
    expect(new Set(Object.keys(handlers))).toEqual(new Set(lockedKeys));
    const companionPatterns: Readonly<Record<string, readonly string[]>> = {
      [lockedKeys[0]!]: ["/runId"],
      [lockedKeys[1]!]: ["/scores"],
      [lockedKeys[2]!]: [],
      [lockedKeys[3]!]: [],
      [lockedKeys[4]!]: [],
      [lockedKeys[5]!]: ["/consequences/terminal/*/presentedTick"],
    };
    lockedCorpus.correlatedHashMutationGroups.forEach((group, index) => {
      const key = JSON.stringify(group);
      const pair = handlers[key]?.();
      expect(pair, `correlated group ${index} has an exact-keyed handler`).toBeDefined();
      if (pair === undefined) return;
      const decodedBase = decodeReady(pair[0], `correlated group ${index} base`);
      const decodedMutant = decodeReady(pair[1], `correlated group ${index} mutant`);
      if (decodedBase === null || decodedMutant === null) return;
      const changed = changedPrimitivePointers(decodedBase, decodedMutant);
      for (const pattern of group) {
        expect(
          [...changed].some((path) => pointerPatternMatches(path, pattern)),
          `correlated group ${index} must change ${pattern}`,
        ).toBe(true);
      }
      const allowed = [...group, ...(companionPatterns[key] ?? [])];
      for (const path of changed) {
        expect(
          allowed.some((pattern) => pointerPatternMatches(path, pattern)),
          `correlated group ${index} unexpected changed path ${path}`,
        ).toBe(true);
      }
      expect(stateHashV1(decodedMutant), `correlated group ${index}`).not.toBe(stateHashV1(decodedBase));
    });
  });

  it("preserves the canonical state and hash across the v0-to-v1 migration", () => {
    const decoded = decodeRunState(JSON.stringify(createSyntheticV0Fixture()), RUN_STATE_CONTRACT_FIXTURE_CATALOG);
    expect(decoded.kind).toBe("ready");
    if (decoded.kind !== "ready") return;
    const current = createShellRunStateFixture();
    expect(decoded.migratedFrom).toBe(0);
    expect(decoded.state).toEqual(current);
    expect(canonicalRunStateJsonV1(decoded.state)).toBe(canonicalRunStateJsonV1(current));
    expect(stateHashV1(decoded.state)).toBe(stateHashV1(current));
  });
});
