import "../../src/choice-of-life/style.css";

import { applyEffect } from "../../src/choice-of-life/core/effect-ledger";
import { deepFreeze } from "../../src/choice-of-life/core/immutable";
import {
  createRunnerLaboratoryEntryState,
  RUNNER_LABORATORY_COMPLETION_FACT,
  RUNNER_LABORATORY_COMPLETION_MEMORY,
  RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID,
} from "../../src/choice-of-life/core/runner/contract";
import { generateRunnerLaboratoryCourse } from "../../src/choice-of-life/core/runner/course-generator";
import {
  advanceRunnerLaboratory,
  createRunnerSimulationContext,
  startRunnerLaboratory,
} from "../../src/choice-of-life/core/runner/simulation";
import type { ControlMode, CoreScores, RunStateV1 } from "../../src/choice-of-life/core/run-state";
import type { RunnerLaboratoryShellPort } from "../../src/choice-of-life/core/shell-contracts";
import {
  createRunnerSession,
  type RunnerSession,
  type RunnerSessionEvent,
  type RunnerSessionSnapshot,
} from "../../src/choice-of-life/platform/runner-session";
import {
  mountRunnerView,
  type RunnerView,
} from "../../src/choice-of-life/presentation/runner-view";

type WitnessId =
  | "approach-warning-with-lane-and-time"
  | "actual-benefit-contact-with-score-and-delta"
  | "actual-hazard-contact-with-score-and-delta"
  | "suppressed-hazard-contact-with-no-score-change"
  | "clamped-effect-result-with-requested-and-actual-delta"
  | "semantic-prompt-open-and-choice-confirmation"
  | "pause-and-resume-with-reason"
  | "actionable-error-with-recovery-action"
  | "completion-with-singleton-fact-and-memory";

interface HarnessWrite {
  readonly region: "status" | "alert";
  readonly text: string;
  readonly writtenAtUtc: string;
  readonly atMonotonicMilliseconds: number;
}

interface ThrottleProof {
  readonly latestMessageWinsObserved: boolean;
  readonly duplicateSuppressionObserved: boolean;
  readonly duplicateWriteCount: number;
}

interface WitnessStateEvidence {
  readonly simulationTick: number;
  readonly sessionStatus: RunnerSessionSnapshot["status"];
  readonly runStatus: RunStateV1["runStatus"];
  readonly stagePhase: RunStateV1["stage"]["phase"];
  readonly scores: CoreScores;
  readonly pauseReasons: readonly string[];
  readonly runnerUserPaused: boolean | null;
  readonly invulnerableUntilTick: number | null;
  readonly resolvedEntityCount: number;
  readonly factIds: readonly string[];
  readonly memoryIds: readonly string[];
  readonly noticeTone: string | null;
  readonly noticeMessage: string | null;
}

interface PatternEvidence {
  readonly patternIndex: number;
  readonly eventSimulationTick: number;
  readonly courseSpawnTick: number;
  readonly courseAnchorTick: number;
  readonly eventEntityInstanceIds: readonly string[];
  readonly courseEntityInstanceIds: readonly string[];
  readonly courseDecisionMarkerInstanceId: string;
  readonly courseEntities: readonly {
    readonly instanceId: string;
    readonly contentId: string;
    readonly kind: "benefit" | "hazard";
    readonly lane: 0 | 1 | 2;
    readonly contactTick: number;
    readonly scoreId: keyof CoreScores;
    readonly requestedDelta: number;
  }[];
}

interface ContactEvidence {
  readonly entityInstanceId: string;
  readonly contentId: string;
  readonly outcome: string;
  readonly simulationTick: number;
  readonly scoreId: keyof CoreScores;
  readonly definitionRequestedDelta: number;
  readonly effectId: string | null;
  readonly effectRequestedDelta: number | null;
  readonly effectActualDelta: number | null;
  readonly effectBefore: number | null;
  readonly effectAfter: number | null;
  readonly stateScoreBefore: number;
  readonly stateScoreAfter: number;
  readonly resolvedBefore: boolean;
  readonly resolvedAfter: boolean;
  readonly courseEntityInstanceId: string;
  readonly courseContentId: string;
  readonly courseEntityKind: string;
  readonly courseLane: number;
  readonly courseContactTick: number;
}

interface DecisionEvidence {
  readonly markerInstanceId: string;
  readonly courseMarkerInstanceId: string;
  readonly simulationTick: number;
  readonly controlMode: string;
  readonly targetLane: number;
  readonly unresolvedBefore: boolean;
  readonly resolvedAfter: boolean;
}

interface PauseEvidence {
  readonly activeSequence: readonly boolean[];
  readonly eventTypeSequence: readonly string[];
  readonly intermediate: WitnessStateEvidence;
}

interface SuppressionSourceEvidence {
  readonly before: WitnessStateEvidence;
  readonly after: WitnessStateEvidence;
  readonly contact: ContactEvidence;
}

interface ErrorEvidence {
  readonly recoveryActionSelector: string;
  readonly recoveryActionVisible: boolean;
  readonly recoveryActionFocused: boolean;
}

interface CompletionEvidence {
  readonly settlementEventTick: number;
  readonly factIds: readonly string[];
  readonly memoryIds: readonly string[];
  readonly expectedFactId: string;
  readonly expectedMemoryId: string;
}

interface BoundaryPreconditionEvidence {
  readonly effectId: string;
  readonly source: string;
  readonly requestedDelta: number;
  readonly actualDelta: number;
  readonly after: number;
  readonly persisted: false;
}

interface PresentationCarrierEvidence {
  readonly carrierKind: "authentic-unclamped-production-state";
  readonly simulationTick: number;
  readonly scoreId: keyof CoreScores;
  readonly carrierScore: number;
  readonly eventScoreAfter: number;
  readonly eventObjectIdentityPreserved: boolean;
}

export interface HarnessWitnessProof {
  readonly provenance:
    | "createRunnerSession"
    | "isolated-nonpersisted-production-contact-seam";
  readonly before: WitnessStateEvidence;
  readonly after: WitnessStateEvidence;
  readonly eventTypes: readonly string[];
  readonly pattern: PatternEvidence | null;
  readonly contact: ContactEvidence | null;
  readonly suppressionSource: SuppressionSourceEvidence | null;
  readonly decision: DecisionEvidence | null;
  readonly pause: PauseEvidence | null;
  readonly error: ErrorEvidence | null;
  readonly completion: CompletionEvidence | null;
  readonly boundaryPrecondition: BoundaryPreconditionEvidence | null;
  readonly presentationCarrier: PresentationCarrierEvidence | null;
}

// Terser is intentionally allowed to mangle every internal property in this
// harness exactly as it does in the production runner.  These adapters are the
// one browser-to-Node serialization boundary: quoted keys remain stable under
// `keep_quoted: "strict"`, while every value read on the right-hand side still
// follows the audited internal property-mangling policy.
function wireHarnessWrite(value: HarnessWrite): HarnessWrite {
  return {
    "region": value.region,
    "text": value.text,
    "writtenAtUtc": value.writtenAtUtc,
    "atMonotonicMilliseconds": value.atMonotonicMilliseconds,
  };
}

function wireThrottleProof(value: ThrottleProof): ThrottleProof {
  return {
    "latestMessageWinsObserved": value.latestMessageWinsObserved,
    "duplicateSuppressionObserved": value.duplicateSuppressionObserved,
    "duplicateWriteCount": value.duplicateWriteCount,
  };
}

function wireStateEvidence(value: WitnessStateEvidence): WitnessStateEvidence {
  return {
    "simulationTick": value.simulationTick,
    "sessionStatus": value.sessionStatus,
    "runStatus": value.runStatus,
    "stagePhase": value.stagePhase,
    "scores": {
      "health": value.scores.health,
      "happiness": value.scores.happiness,
      "money": value.scores.money,
    },
    "pauseReasons": [...value.pauseReasons],
    "runnerUserPaused": value.runnerUserPaused,
    "invulnerableUntilTick": value.invulnerableUntilTick,
    "resolvedEntityCount": value.resolvedEntityCount,
    "factIds": [...value.factIds],
    "memoryIds": [...value.memoryIds],
    "noticeTone": value.noticeTone,
    "noticeMessage": value.noticeMessage,
  };
}

function wirePatternEvidence(value: PatternEvidence | null): PatternEvidence | null {
  if (value === null) return null;
  return {
    "patternIndex": value.patternIndex,
    "eventSimulationTick": value.eventSimulationTick,
    "courseSpawnTick": value.courseSpawnTick,
    "courseAnchorTick": value.courseAnchorTick,
    "eventEntityInstanceIds": [...value.eventEntityInstanceIds],
    "courseEntityInstanceIds": [...value.courseEntityInstanceIds],
    "courseDecisionMarkerInstanceId": value.courseDecisionMarkerInstanceId,
    "courseEntities": value.courseEntities.map((entity) => ({
      "instanceId": entity.instanceId,
      "contentId": entity.contentId,
      "kind": entity.kind,
      "lane": entity.lane,
      "contactTick": entity.contactTick,
      "scoreId": entity.scoreId,
      "requestedDelta": entity.requestedDelta,
    })),
  };
}

function wireContactEvidence(value: ContactEvidence | null): ContactEvidence | null {
  if (value === null) return null;
  return {
    "entityInstanceId": value.entityInstanceId,
    "contentId": value.contentId,
    "outcome": value.outcome,
    "simulationTick": value.simulationTick,
    "scoreId": value.scoreId,
    "definitionRequestedDelta": value.definitionRequestedDelta,
    "effectId": value.effectId,
    "effectRequestedDelta": value.effectRequestedDelta,
    "effectActualDelta": value.effectActualDelta,
    "effectBefore": value.effectBefore,
    "effectAfter": value.effectAfter,
    "stateScoreBefore": value.stateScoreBefore,
    "stateScoreAfter": value.stateScoreAfter,
    "resolvedBefore": value.resolvedBefore,
    "resolvedAfter": value.resolvedAfter,
    "courseEntityInstanceId": value.courseEntityInstanceId,
    "courseContentId": value.courseContentId,
    "courseEntityKind": value.courseEntityKind,
    "courseLane": value.courseLane,
    "courseContactTick": value.courseContactTick,
  };
}

function wireDecisionEvidence(value: DecisionEvidence | null): DecisionEvidence | null {
  if (value === null) return null;
  return {
    "markerInstanceId": value.markerInstanceId,
    "courseMarkerInstanceId": value.courseMarkerInstanceId,
    "simulationTick": value.simulationTick,
    "controlMode": value.controlMode,
    "targetLane": value.targetLane,
    "unresolvedBefore": value.unresolvedBefore,
    "resolvedAfter": value.resolvedAfter,
  };
}

function wirePauseEvidence(value: PauseEvidence | null): PauseEvidence | null {
  if (value === null) return null;
  return {
    "activeSequence": [...value.activeSequence],
    "eventTypeSequence": [...value.eventTypeSequence],
    "intermediate": wireStateEvidence(value.intermediate),
  };
}

function wireSuppressionSourceEvidence(
  value: SuppressionSourceEvidence | null,
): SuppressionSourceEvidence | null {
  if (value === null) return null;
  const contact = wireContactEvidence(value.contact);
  if (contact === null) throw new Error("suppression source contact cannot be null");
  return {
    "before": wireStateEvidence(value.before),
    "after": wireStateEvidence(value.after),
    "contact": contact,
  };
}

function wireErrorEvidence(value: ErrorEvidence | null): ErrorEvidence | null {
  if (value === null) return null;
  return {
    "recoveryActionSelector": value.recoveryActionSelector,
    "recoveryActionVisible": value.recoveryActionVisible,
    "recoveryActionFocused": value.recoveryActionFocused,
  };
}

function wireCompletionEvidence(value: CompletionEvidence | null): CompletionEvidence | null {
  if (value === null) return null;
  return {
    "settlementEventTick": value.settlementEventTick,
    "factIds": [...value.factIds],
    "memoryIds": [...value.memoryIds],
    "expectedFactId": value.expectedFactId,
    "expectedMemoryId": value.expectedMemoryId,
  };
}

function wireBoundaryPreconditionEvidence(
  value: BoundaryPreconditionEvidence | null,
): BoundaryPreconditionEvidence | null {
  if (value === null) return null;
  return {
    "effectId": value.effectId,
    "source": value.source,
    "requestedDelta": value.requestedDelta,
    "actualDelta": value.actualDelta,
    "after": value.after,
    "persisted": value.persisted,
  };
}

function wirePresentationCarrierEvidence(
  value: PresentationCarrierEvidence | null,
): PresentationCarrierEvidence | null {
  if (value === null) return null;
  return {
    "carrierKind": value.carrierKind,
    "simulationTick": value.simulationTick,
    "scoreId": value.scoreId,
    "carrierScore": value.carrierScore,
    "eventScoreAfter": value.eventScoreAfter,
    "eventObjectIdentityPreserved": value.eventObjectIdentityPreserved,
  };
}

function wireWitnessProof(value: HarnessWitnessProof): HarnessWitnessProof {
  return {
    "provenance": value.provenance,
    "before": wireStateEvidence(value.before),
    "after": wireStateEvidence(value.after),
    "eventTypes": [...value.eventTypes],
    "pattern": wirePatternEvidence(value.pattern),
    "contact": wireContactEvidence(value.contact),
    "suppressionSource": wireSuppressionSourceEvidence(value.suppressionSource),
    "decision": wireDecisionEvidence(value.decision),
    "pause": wirePauseEvidence(value.pause),
    "error": wireErrorEvidence(value.error),
    "completion": wireCompletionEvidence(value.completion),
    "boundaryPrecondition": wireBoundaryPreconditionEvidence(value.boundaryPrecondition),
    "presentationCarrier": wirePresentationCarrierEvidence(value.presentationCarrier),
  };
}

declare global {
  interface Window {
    __runnerBrowserHarness: {
      writes(): readonly HarnessWrite[];
      emitWitness(witnessId: WitnessId): Promise<void>;
      witnessProof(witnessId: WitnessId): HarnessWitnessProof;
      proveThrottleBehavior(): void;
      throttleProof(): ThrottleProof;
    };
  }
}

const rootCandidate = document.getElementById("runner-browser-harness");
if (rootCandidate === null) throw new Error("runner browser harness mount is absent");
const root: HTMLElement = rootCandidate;

const seed = "0000000000000000";
const baseSetup = {
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  identity: { gender: "female" },
  appearance: {
    heritageStyleId: "asian",
    hairStyleId: "short-soft",
    hairColorId: "black",
    clothingPaletteId: "sunrise",
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    textScale: 100,
    screenReaderAnnouncements: true,
  },
} as const;

const course = generateRunnerLaboratoryCourse(seed, "normal");
const harnessParameters = new URL(window.location.href).searchParams;
const harnessContrast = harnessParameters.get("contrast") === "high" ? "high" : "standard";
const harnessTextScalePercent = Number(harnessParameters.get("textScalePercent") ?? "100");
const harnessTextScaleMultiplier: 1 | 1.25 | 1.5 | 2 = harnessTextScalePercent === 125
  ? 1.25
  : harnessTextScalePercent === 150 ? 1.5 : harnessTextScalePercent === 200 ? 2 : 1;
const harnessMotionReduced = harnessParameters.get("motionReduced") === "true";
root.dataset.contrast = harnessContrast;
root.dataset.reducedMotion = String(harnessMotionReduced);
root.style.setProperty("--col-text-scale", String(harnessTextScaleMultiplier));
const writes: HarnessWrite[] = [];
const proofs = new Map<WitnessId, HarnessWitnessProof>();
const nativePerformanceNow = performance.now.bind(performance);
let mostRecentPerformanceNow = nativePerformanceNow();
Object.defineProperty(performance, "now", {
  configurable: true,
  value: (): number => {
    mostRecentPerformanceNow = nativePerformanceNow();
    return mostRecentPerformanceNow;
  },
});

const textContentDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
if (textContentDescriptor?.get === undefined || textContentDescriptor.set === undefined) {
  throw new Error("browser harness cannot observe the DOM textContent seam");
}
Object.defineProperty(Node.prototype, "textContent", {
  ...textContentDescriptor,
  get: textContentDescriptor.get,
  set(value: string | null): void {
    textContentDescriptor.set!.call(this, value);
    if (!(this instanceof HTMLElement)) return;
    const region = this.hasAttribute("data-runner-live-alert")
      ? "alert"
      : this.hasAttribute("data-runner-live-status") ? "status" : null;
    const text = value?.trim() ?? "";
    if (region === null || text === "") return;
    writes.push({
      region,
      text,
      writtenAtUtc: new Date().toISOString(),
      atMonotonicMilliseconds: region === "status"
        ? mostRecentPerformanceNow
        : nativePerformanceNow(),
    });
  },
});

interface RecordedTransition {
  readonly before: RunnerSessionSnapshot;
  readonly after: RunnerSessionSnapshot;
}

interface HarnessRuntime {
  readonly session: RunnerSession;
  readonly view: RunnerView;
  readonly transitions: readonly RecordedTransition[];
  latest(): RunnerSessionSnapshot;
  pump(): void;
  dispose(): void;
}

let activeRuntime: HarnessRuntime | null = null;

function initialEntry(controlMode: ControlMode): RunStateV1 {
  return createRunnerLaboratoryEntryState(seed, {
    ...baseSetup,
    controlMode,
  });
}

function createRuntime(controlMode: ControlMode): HarnessRuntime {
  activeRuntime?.dispose();
  root.replaceChildren();
  let persisted = initialEntry(controlMode);
  const shell: RunnerLaboratoryShellPort = {
    currentRunState: () => persisted,
    enterRunnerLaboratory: () => ({ kind: "ready", state: persisted }),
    restartRunnerLaboratory: () => ({ kind: "ready", state: persisted }),
    saveRunnerLaboratoryState(state) {
      persisted = state;
      return { kind: "saved", state };
    },
  };
  let clockMilliseconds = -20;
  let nextFrameId = 1;
  const frameCallbacks = new Map<number, () => void>();
  const session = createRunnerSession({
    shell,
    clock: { nowMilliseconds: () => clockMilliseconds },
    animationFrame: {
      requestAnimationFrame(callback) {
        const frameId = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(frameId, callback);
        return frameId;
      },
      cancelAnimationFrame(frameId) {
        frameCallbacks.delete(frameId);
      },
    },
    lifecycle: {
      visibilityTarget: document,
      focusTarget: window,
      isFocused: () => true,
    },
  });
  const transitions: RecordedTransition[] = [];
  let latest = session.getSnapshot();
  const unsubscribe = session.subscribe((next) => {
    if (next === latest) return;
    transitions.push({ before: latest, after: next });
    latest = next;
  });
  const view = mountRunnerView({
    dom: document,
    root,
    session,
    course,
    characterToken: {
      bodySet: "feminine",
      artSet: "asian",
      hairShape: "short-soft",
      hairTone: "black",
      clothingTone: "sunrise",
    },
    visualOptions: {
      contrastMode: harnessContrast,
      motionReduced: harnessMotionReduced,
      textScaleMultiplier: harnessTextScaleMultiplier,
      announceOptional: true,
    },
    onPracticeAgain: () => undefined,
    onReturnToTitle: () => undefined,
  });
  let disposed = false;
  const runtime: HarnessRuntime = {
    session,
    view,
    transitions,
    latest: () => latest,
    pump(): void {
      const next = frameCallbacks.entries().next().value as [number, () => void] | undefined;
      if (next === undefined) throw new Error("authentic runner session omitted its next frame");
      frameCallbacks.delete(next[0]);
      clockMilliseconds += 20;
      next[1]();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      view.dispose();
      session.dispose();
      frameCallbacks.clear();
    },
  };
  activeRuntime = runtime;
  return runtime;
}

function stateEvidence(snapshot: RunnerSessionSnapshot): WitnessStateEvidence {
  const runner = snapshot.state.runner;
  return {
    simulationTick: snapshot.state.simulationTick,
    sessionStatus: snapshot.status,
    runStatus: snapshot.state.runStatus,
    stagePhase: snapshot.state.stage.phase,
    scores: { ...snapshot.state.scores },
    pauseReasons: [...snapshot.pauseReasons],
    runnerUserPaused: runner?.userPaused ?? null,
    invulnerableUntilTick: runner?.invulnerableUntilTick ?? null,
    resolvedEntityCount: runner?.spawn.resolvedEntityIds.length ?? 0,
    factIds: snapshot.state.storyState.facts.map(({ factId }) => factId),
    memoryIds: snapshot.state.storyState.memories.map(({ memoryId }) => memoryId),
    noticeTone: snapshot.notice?.tone ?? null,
    noticeMessage: snapshot.notice?.message ?? null,
  };
}

function eventTypes(transition: RecordedTransition): readonly string[] {
  return transition.after.events.map(({ type }) => type);
}

function emptyProof(
  provenance: HarnessWitnessProof["provenance"],
  transition: RecordedTransition,
): HarnessWitnessProof {
  return {
    provenance,
    before: stateEvidence(transition.before),
    after: stateEvidence(transition.after),
    eventTypes: eventTypes(transition),
    pattern: null,
    contact: null,
    suppressionSource: null,
    decision: null,
    pause: null,
    error: null,
    completion: null,
    boundaryPrecondition: null,
    presentationCarrier: null,
  };
}

function matchingTransition(
  runtime: HarnessRuntime,
  predicate: (event: RunnerSessionEvent) => boolean,
): RecordedTransition {
  const transition = [...runtime.transitions].reverse().find(({ after }) =>
    after.events.some(predicate));
  if (transition === undefined) throw new Error("authentic runner session omitted a required transition");
  return transition;
}

function pumpUntil(
  runtime: HarnessRuntime,
  predicate: () => boolean,
  maximumFrames: number,
  chooseTargetLane?: (state: RunStateV1) => 0 | 1 | 2,
): void {
  for (let frame = 0; frame < maximumFrames; frame += 1) {
    if (predicate()) return;
    const state = runtime.latest().state;
    const motion = state.runner?.motion;
    if (chooseTargetLane !== undefined && motion?.kind === "idle") {
      const target = chooseTargetLane(state);
      if (motion.currentLane < target) runtime.session.requestLaneIntent("down");
      else if (motion.currentLane > target) runtime.session.requestLaneIntent("up");
    }
    runtime.pump();
  }
  if (!predicate()) throw new Error("authentic runner transition exceeded the deterministic frame bound");
}

function contactEvidence(transition: RecordedTransition): ContactEvidence {
  const event = transition.after.events.find(({ type }) => type === "contact-resolved");
  if (event?.type !== "contact-resolved") throw new Error("contact transition is absent");
  const generated = course.patterns.flatMap(({ entities }) => entities)
    .find(({ instanceId }) => instanceId === event.contact.entityInstanceId);
  if (generated === undefined) throw new Error("contact does not authenticate against the generated course");
  const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(event.contact.contentId);
  if (definition === undefined) throw new Error("contact does not authenticate against scoring definitions");
  const effect = event.contact.effect;
  const beforeResolved = transition.before.state.runner?.spawn.resolvedEntityIds.includes(
    event.contact.entityInstanceId,
  ) ?? false;
  const afterResolved = transition.after.state.runner?.spawn.resolvedEntityIds.includes(
    event.contact.entityInstanceId,
  ) ?? false;
  return {
    entityInstanceId: event.contact.entityInstanceId,
    contentId: event.contact.contentId,
    outcome: event.contact.outcome,
    simulationTick: event.contact.simulationTick,
    scoreId: definition.scoreId,
    definitionRequestedDelta: definition.requestedDelta,
    effectId: effect?.effectId ?? null,
    effectRequestedDelta: effect?.requestedDelta ?? null,
    effectActualDelta: effect?.actualDelta ?? null,
    effectBefore: effect?.before ?? null,
    effectAfter: effect?.after ?? null,
    stateScoreBefore: transition.before.state.scores[definition.scoreId],
    stateScoreAfter: transition.after.state.scores[definition.scoreId],
    resolvedBefore: beforeResolved,
    resolvedAfter: afterResolved,
    courseEntityInstanceId: generated.instanceId,
    courseContentId: generated.contentId,
    courseEntityKind: generated.kind,
    courseLane: generated.lane,
    courseContactTick: generated.contactTick,
  };
}

async function publishApproachWitness(): Promise<void> {
  const runtime = createRuntime("manual");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic runner did not start");
  runtime.pump();
  const hasScoringPattern = (event: RunnerSessionEvent): boolean =>
    event.type === "pattern-appended" &&
    (course.patterns[event.patternIndex - 1]?.entities.length ?? 0) > 0;
  pumpUntil(runtime, () => runtime.transitions.some(({ after }) =>
    after.events.some(hasScoringPattern)), 900);
  const transition = matchingTransition(runtime, hasScoringPattern);
  const event = transition.after.events.find(({ type }) => type === "pattern-appended");
  if (event?.type !== "pattern-appended") throw new Error("pattern event is absent");
  const generatedPattern = course.patterns[event.patternIndex - 1];
  if (generatedPattern === undefined) throw new Error("pattern event index is not in the generated course");
  const courseEntities = generatedPattern.entities.map((entity) => {
    const definition = RUNNER_LABORATORY_SCORING_DEFINITIONS_BY_CONTENT_ID.get(entity.contentId);
    if (definition === undefined || definition.kind !== entity.kind) {
      throw new Error("appended pattern entity has no exact scoring definition");
    }
    return {
      instanceId: entity.instanceId,
      contentId: entity.contentId,
      kind: entity.kind,
      lane: entity.lane,
      contactTick: entity.contactTick,
      scoreId: definition.scoreId,
      requestedDelta: definition.requestedDelta,
    };
  });
  proofs.set("approach-warning-with-lane-and-time", {
    ...emptyProof("createRunnerSession", transition),
    pattern: {
      patternIndex: event.patternIndex,
      eventSimulationTick: event.simulationTick,
      courseSpawnTick: generatedPattern.spawnTick,
      courseAnchorTick: generatedPattern.anchorTick,
      eventEntityInstanceIds: [...event.entityInstanceIds],
      courseEntityInstanceIds: generatedPattern.spawnEntities.map(({ instanceId }) => instanceId),
      courseDecisionMarkerInstanceId: generatedPattern.decisionMarker.instanceId,
      courseEntities,
    },
  });
}

async function publishContactWitness(
  witnessId:
    | "actual-benefit-contact-with-score-and-delta"
    | "actual-hazard-contact-with-score-and-delta",
  outcome: "benefit-applied" | "hazard-applied",
): Promise<void> {
  const runtime = createRuntime("manual");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic runner did not start");
  runtime.pump();
  pumpUntil(runtime, () => runtime.transitions.some(({ after }) =>
    after.events.some((event) => event.type === "contact-resolved" && event.contact.outcome === outcome)), 900);
  const transition = matchingTransition(runtime, (event) =>
    event.type === "contact-resolved" && event.contact.outcome === outcome);
  proofs.set(witnessId, {
    ...emptyProof("createRunnerSession", transition),
    contact: contactEvidence(transition),
  });
}

async function publishSuppressedWitness(): Promise<void> {
  const firstPattern = course.patterns.find(({ category }) => category === "risk-reward");
  const firstHazard = firstPattern?.entities.find(({ contentId, contactTick }) =>
    contentId === "runner-lab-pressure-hazard-v1" && contactTick === firstPattern.anchorTick);
  const secondHazard = firstPattern?.entities.find(({ contentId }) =>
    contentId === "runner-lab-clutter-hazard-v1");
  if (firstHazard === undefined || secondHazard === undefined) {
    throw new Error("generated course omitted the authentic suppression route");
  }
  const runtime = createRuntime("manual");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic runner did not start");
  runtime.pump();
  pumpUntil(runtime, () => runtime.transitions.some(({ after }) =>
    after.events.some((event) =>
      event.type === "contact-resolved" &&
      event.contact.outcome === "hazard-suppressed" &&
      event.contact.entityInstanceId === secondHazard.instanceId)), 900,
  (state) => state.simulationTick < firstHazard.contactTick ? firstHazard.lane : secondHazard.lane);
  const transition = matchingTransition(runtime, (event) =>
    event.type === "contact-resolved" &&
    event.contact.outcome === "hazard-suppressed" &&
    event.contact.entityInstanceId === secondHazard.instanceId);
  const sourceTransition = matchingTransition(runtime, (event) =>
    event.type === "contact-resolved" &&
    event.contact.outcome === "hazard-applied" &&
    event.contact.entityInstanceId === firstHazard.instanceId);
  proofs.set("suppressed-hazard-contact-with-no-score-change", {
    ...emptyProof("createRunnerSession", transition),
    contact: contactEvidence(transition),
    suppressionSource: {
      before: stateEvidence(sourceTransition.before),
      after: stateEvidence(sourceTransition.after),
      contact: contactEvidence(sourceTransition),
    },
  });
}

function evidenceSnapshot(
  state: RunStateV1,
  events: readonly RunnerSessionEvent[] = [],
): RunnerSessionSnapshot {
  return deepFreeze({
    state,
    status: "running",
    started: true,
    queuedLaneIntent: null,
    pauseReasons: [],
    events: [...events],
    notice: null,
    droppedLogicalSteps: 0,
  });
}

function replayProductionTransition(
  beforeState: RunStateV1,
  afterState: RunStateV1,
  events: readonly RunnerSessionEvent[],
  delayMilliseconds = 0,
): RecordedTransition {
  activeRuntime?.dispose();
  activeRuntime = null;
  root.replaceChildren();
  let snapshot = evidenceSnapshot(beforeState);
  const listeners = new Set<(value: RunnerSessionSnapshot) => void>();
  const session: RunnerSession = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    start: () => false,
    requestLaneIntent: () => false,
    chooseLane: () => false,
    setUserPaused: () => false,
    setModalOpen: () => false,
    resumeInterruption: () => false,
    reportPresentationFault: () => false,
    refreshPresentationState: () => false,
    dispose: () => listeners.clear(),
  };
  const view = mountRunnerView({
    dom: document,
    root,
    session,
    course,
    characterToken: {
      bodySet: "feminine", artSet: "asian", hairShape: "short-soft",
      hairTone: "black", clothingTone: "sunrise",
    },
    visualOptions: {
      contrastMode: harnessContrast, motionReduced: harnessMotionReduced,
      textScaleMultiplier: harnessTextScaleMultiplier, announceOptional: true,
    },
    onPracticeAgain: () => undefined,
    onReturnToTitle: () => undefined,
  });
  const before = snapshot;
  const after = evidenceSnapshot(afterState, events);
  const publish = (): void => {
    snapshot = after;
    for (const listener of [...listeners]) listener(snapshot);
  };
  if (delayMilliseconds === 0) publish();
  else window.setTimeout(publish, delayMilliseconds);
  const transition = { before, after };
  let disposed = false;
  activeRuntime = {
    session,
    view,
    transitions: [transition],
    latest: () => snapshot,
    pump: () => {
      throw new Error("isolated contact replay has no frame loop");
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      view.dispose();
      session.dispose();
    },
  };
  return transition;
}

async function publishClampedWitness(): Promise<void> {
  const context = createRunnerSimulationContext(seed, "normal");
  let state = startRunnerLaboratory(context, initialEntry("manual")).state;
  while (state.simulationTick < 549) state = advanceRunnerLaboratory(context, state).state;
  const presentationCarrierResult = advanceRunnerLaboratory(context, state);
  const precondition = applyEffect(state.scores, state.effectLedger, {
    effectId: "browser-clamp-precondition-1",
    scoreId: "money",
    requestedDelta: 65,
    source: "system",
    categoryId: "browser-clamp-precondition-v1",
    causedByChoiceId: null,
    transactionId: null,
    simulationTick: state.simulationTick,
  });
  const boundary = deepFreeze({
    ...state,
    scores: precondition.scores,
    effectLedger: precondition.ledger,
  });
  const result = advanceRunnerLaboratory(context, boundary);
  const contact = result.events.find((event) => event.type === "contact-resolved");
  if (
    contact?.type !== "contact-resolved" ||
    contact.contact.effect?.requestedDelta !== 1 ||
    contact.contact.effect.actualDelta !== 0 ||
    contact.contact.effect.after !== 100
  ) {
    throw new Error("isolated production contact seam did not emit the exact clamp event");
  }
  const presentationTransition = replayProductionTransition(
    state,
    presentationCarrierResult.state,
    result.events,
    1_001,
  );
  const replayedContact = presentationTransition.after.events.find((event) =>
    event.type === "contact-resolved");
  const eventObjectIdentityPreserved = replayedContact === contact;
  if (!eventObjectIdentityPreserved) {
    throw new Error("presentation carrier did not consume the exact production clamp event object");
  }
  const transition: RecordedTransition = {
    before: evidenceSnapshot(boundary),
    after: evidenceSnapshot(result.state, result.events),
  };
  proofs.set("clamped-effect-result-with-requested-and-actual-delta", {
    ...emptyProof("isolated-nonpersisted-production-contact-seam", transition),
    contact: contactEvidence(transition),
    boundaryPrecondition: {
      effectId: precondition.effect.effectId,
      source: precondition.effect.source,
      requestedDelta: precondition.effect.requestedDelta,
      actualDelta: precondition.effect.actualDelta,
      after: precondition.effect.after,
      persisted: false,
    },
    presentationCarrier: {
      carrierKind: "authentic-unclamped-production-state",
      simulationTick: presentationCarrierResult.state.simulationTick,
      scoreId: contact.contact.effect.scoreId,
      carrierScore: presentationCarrierResult.state.scores[contact.contact.effect.scoreId],
      eventScoreAfter: contact.contact.effect.after,
      eventObjectIdentityPreserved,
    },
  });
}

async function publishSemanticWitness(): Promise<void> {
  const runtime = createRuntime("semantic-assist");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic Semantic runner did not start");
  runtime.pump();
  pumpUntil(runtime, () => runtime.latest().pauseReasons.includes("semantic"), 900);
  const beforeChoice = runtime.latest();
  const pending = beforeChoice.state.runner?.activeEntities.find(({ kind, instanceId }) =>
    kind === "opportunity" && !beforeChoice.state.runner?.spawn.resolvedEntityIds.includes(instanceId));
  if (pending === undefined) throw new Error("Semantic session omitted its pending marker");
  if (!runtime.session.chooseLane(0)) throw new Error("authentic Semantic choice was rejected");
  const transition = matchingTransition(runtime, ({ type }) => type === "decision-marker-resolved");
  const decision = transition.after.events.find(({ type }) => type === "decision-marker-resolved");
  if (decision?.type !== "decision-marker-resolved") throw new Error("Semantic decision event is absent");
  proofs.set("semantic-prompt-open-and-choice-confirmation", {
    ...emptyProof("createRunnerSession", transition),
    decision: {
      markerInstanceId: decision.entityInstanceId,
      courseMarkerInstanceId: pending.instanceId,
      simulationTick: decision.simulationTick,
      controlMode: decision.controlMode,
      targetLane: decision.targetLane,
      unresolvedBefore: !transition.before.state.runner!.spawn.resolvedEntityIds.includes(decision.entityInstanceId),
      resolvedAfter: transition.after.state.runner!.spawn.resolvedEntityIds.includes(decision.entityInstanceId),
    },
  });
}

async function publishPauseWitness(): Promise<void> {
  const runtime = createRuntime("manual");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic runner did not start");
  runtime.pump();
  if (!runtime.session.setUserPaused(true)) throw new Error("authentic user pause was rejected");
  const paused = matchingTransition(runtime, (event) =>
    event.type === "user-pause-changed" && event.active);
  if (!runtime.session.setUserPaused(false)) throw new Error("authentic user resume was rejected");
  const resumed = matchingTransition(runtime, (event) =>
    event.type === "user-pause-changed" && !event.active);
  proofs.set("pause-and-resume-with-reason", {
    ...emptyProof("createRunnerSession", { before: paused.before, after: resumed.after }),
    eventTypes: [...eventTypes(paused), ...eventTypes(resumed)],
    pause: {
      activeSequence: [true, false],
      eventTypeSequence: ["user-pause-changed", "user-pause-changed"],
      intermediate: stateEvidence(paused.after),
    },
  });
}

async function publishErrorWitness(): Promise<void> {
  const runtime = createRuntime("manual");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic runner did not start");
  runtime.pump();
  const before = runtime.latest();
  const message = "Runner input failed. Review the status and return to the title to recover.";
  window.setTimeout(() => {
    if (!runtime.session.reportPresentationFault(message)) {
      throw new Error("authentic presentation fault was rejected");
    }
    const after = runtime.latest();
    const recoverySelector = "[data-runner-fault-return-title]";
    const recovery = root.querySelector<HTMLElement>(recoverySelector);
    const transition = { before, after };
    proofs.set("actionable-error-with-recovery-action", {
      ...emptyProof("createRunnerSession", transition),
      error: {
        recoveryActionSelector: recoverySelector,
        recoveryActionVisible: recovery !== null && !recovery.hidden,
        recoveryActionFocused: recovery !== null && document.activeElement === recovery,
      },
    });
  }, 1_001);
}

async function publishCompletionWitness(): Promise<void> {
  const runtime = createRuntime("automatic-assist");
  await Promise.resolve();
  if (!runtime.session.start()) throw new Error("authentic Automatic runner did not start");
  runtime.pump();
  pumpUntil(runtime, () => runtime.latest().status === "completed", 3_100);
  const transition = matchingTransition(runtime, ({ type }) => type === "settlement-applied");
  const settlement = transition.after.events.find(({ type }) => type === "settlement-applied");
  if (settlement?.type !== "settlement-applied") throw new Error("completion settlement event is absent");
  proofs.set("completion-with-singleton-fact-and-memory", {
    ...emptyProof("createRunnerSession", transition),
    completion: {
      settlementEventTick: settlement.simulationTick,
      factIds: transition.after.state.storyState.facts.map(({ factId }) => factId),
      memoryIds: transition.after.state.storyState.memories.map(({ memoryId }) => memoryId),
      expectedFactId: RUNNER_LABORATORY_COMPLETION_FACT.factId,
      expectedMemoryId: RUNNER_LABORATORY_COMPLETION_MEMORY.memoryId,
    },
  });
}

async function emitWitness(witnessId: WitnessId): Promise<void> {
  switch (witnessId) {
    case "approach-warning-with-lane-and-time": await publishApproachWitness(); return;
    case "actual-benefit-contact-with-score-and-delta":
      await publishContactWitness(witnessId, "benefit-applied"); return;
    case "actual-hazard-contact-with-score-and-delta":
      await publishContactWitness(witnessId, "hazard-applied"); return;
    case "suppressed-hazard-contact-with-no-score-change": await publishSuppressedWitness(); return;
    case "clamped-effect-result-with-requested-and-actual-delta": await publishClampedWitness(); return;
    case "semantic-prompt-open-and-choice-confirmation": await publishSemanticWitness(); return;
    case "pause-and-resume-with-reason": await publishPauseWitness(); return;
    case "actionable-error-with-recovery-action": await publishErrorWitness(); return;
    case "completion-with-singleton-fact-and-memory": await publishCompletionWitness(); return;
  }
}

let proofStart = 0;
let duplicateAttemptAt: number | null = null;
let duplicateTransitionObserved = false;
window["__runnerBrowserHarness"] = {
  "writes": () => writes.map(wireHarnessWrite),
  "emitWitness": emitWitness,
  "witnessProof"(witnessId): HarnessWitnessProof {
    const proof = proofs.get(witnessId);
    if (proof === undefined) throw new Error(`witness proof ${witnessId} is absent`);
    return structuredClone(wireWitnessProof(proof));
  },
  "proveThrottleBehavior"(): void {
    const runtime = createRuntime("manual");
    if (!runtime.session.start()) throw new Error("authentic throttle runner did not start");
    runtime.pump();
    proofStart = writes.length;
    duplicateAttemptAt = null;
    duplicateTransitionObserved = false;
    runtime.session.setUserPaused(true);
    runtime.session.setModalOpen(true);
    runtime.session.setUserPaused(false);
    runtime.session.setModalOpen(false);
    window.setTimeout(() => {
      duplicateAttemptAt = performance.now();
      duplicateTransitionObserved =
        runtime.session.setModalOpen(true) &&
        runtime.session.setModalOpen(false);
    }, 1_001);
  },
  "throttleProof"(): ThrottleProof {
    const proofWrites = writes.slice(proofStart);
    const duplicateWrites = duplicateAttemptAt === null
      ? proofWrites
      : proofWrites.filter(({ atMonotonicMilliseconds }) =>
        atMonotonicMilliseconds >= duplicateAttemptAt!);
    const latestWrites = duplicateAttemptAt === null
      ? []
      : proofWrites.filter(({ atMonotonicMilliseconds }) =>
        atMonotonicMilliseconds < duplicateAttemptAt!);
    const resumed = latestWrites.filter(({ text }) => text === "Runner resumed.").length;
    return wireThrottleProof({
      latestMessageWinsObserved:
        resumed === 1 && latestWrites.every(({ text }) =>
          !text.includes("User pause") && !text.includes("Modal dialog")),
      duplicateSuppressionObserved:
        duplicateTransitionObserved && duplicateWrites.length === 0,
      duplicateWriteCount: duplicateWrites.length,
    });
  },
};

const baselineRuntime = createRuntime("manual");
if (!baselineRuntime.session.start()) throw new Error("authentic baseline runner did not start");
baselineRuntime.pump();
if (!baselineRuntime.session.reportPresentationFault(
  "Browser evidence baseline alert. Return to the title to recover.",
)) throw new Error("authentic baseline alert was rejected");

const ready = document.createElement("span");
ready.hidden = true;
ready.dataset.runnerHarnessReady = "";
root.append(ready);
