import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import {
  RUNNER_BROWSER_MATRIX_ARTIFACT_ID,
  RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS,
  assertCanonicalBrowserBaseUrl,
  awaitAllSettledOrThrow,
  awaitRunnerPauseUi,
  awaitRunnerUnpausedUi,
  collectAnnouncementCells,
  executeWithAllSettledCleanup,
  expectedRunnerBrowserMatrixCellIds,
  pauseRunnerBrowserClock,
  startHarnessServer,
  validateRunnerBrowserMatrixArtifact,
  validateWitnessTransitionEvidence,
  visibleRunnerSwipeGesture,
  type RunnerBrowserMatrixArtifact,
} from "./runner-browser-matrix";
import { rejectStandaloneRunnerBrowserMatrixInvocation } from "./runner-browser-matrix-cli";

const SOURCE_DIGEST = "a".repeat(64);
let fixture: any;

beforeAll(async () => {
  fixture = JSON.parse(await readFile(path.join(
    process.cwd(),
    "docs",
    "balance",
    "runner-fixtures",
    "runner-laboratory-fixture-v1.json",
  ), "utf8"));
});

function semanticTree() {
  return {
    runnerRegionElement: "SECTION",
    runnerRegionAccessibleName: "Runner status",
    summaryElement: "DL",
    summaryTermCount: 4,
    summaryDescriptionCount: 4,
    scoreOutputCount: 3,
    scoreOutputNames: ["Health: 65", "Happiness: 60", "Financial security: 35"],
    progressElement: "PROGRESS",
    progressAccessibleName: "Runner laboratory progress",
    playfieldAriaHidden: "true",
    playfieldFocusableDescendantCount: 0,
    decisionElement: "FIELDSET",
    decisionLegendPresent: true,
    semanticChoiceCount: 3,
    semanticChoiceLabelsContainUrgency: true,
    laneSummaryAriaLive: "",
    statusRegionCount: 1,
    statusRegionRole: "status",
    statusRegionPoliteness: "polite",
    statusRegionAtomic: "true",
    alertRegionCount: 1,
    alertRegionRole: "alert",
    alertRegionPoliteness: "assertive",
    alertRegionAtomic: "true",
  };
}

function accessibilityTree() {
  const node = (selector: string, role: string, name: string, ignored = false) => ({
    selector,
    role,
    name,
    ignored,
  });
  return {
    provenance: "chromium-cdp-accessibility-tree-v1",
    playfieldTraversal: "chromium-cdp-full-ax-subtree-v1",
    runnerRegion: node("[data-runner-view]", "region", "Runner status"),
    scoreOutputs: [
      node("[data-runner-score-output]:nth(0)", "status", "Health: 65"),
      node("[data-runner-score-output]:nth(1)", "status", "Happiness: 60"),
      node("[data-runner-score-output]:nth(2)", "status", "Financial security: 35"),
    ],
    semanticChoices: [0, 1, 2].map((lane) => node(
      `[data-runner-semantic-lane]:nth(${lane})`,
      "button",
      `Lane ${lane}. Urgency: 10 ticks (200 ms).`,
    )),
    playfield: node("[data-runner-play-surface]", "", "", true),
    movingEntityDomCount: 2,
    movingEntities: [
      node("[data-runner-entity-id]:nth(0)", "", "", true),
      node("[data-runner-entity-id]:nth(1)", "", "", true),
    ],
    playfieldAxDescendantCount: 2,
    unexpectedExposedPlayfieldNodeCount: 0,
  };
}

function completeLayoutSamples(path: string) {
  const active = Array.from({ length: 600 }, (_, sequence) => {
    const simulationTick = sequence * 5;
    const patternIndex = Math.min(10, Math.floor(simulationTick / 250));
    return {
      sequence,
      monotonicMilliseconds: sequence * 100,
      simulationTick,
      patternIndex,
      resolvedEntityCount: patternIndex,
      motionKind: sequence % 50 === 10 ? "moving" : "idle",
      semanticPromptVisible: path === "semantic-assist" &&
        patternIndex > 0 && sequence % 50 === 0,
      visibleWarningCount: sequence % 50 === 20 ? 1 : 0,
      visiblePlayerCount: 1,
      visiblePlayfieldCount: 1,
      visibleControlClusterCount: path.startsWith("manual-") ? 1 : 0,
      visibleInteractiveTargetCount: 1,
      runStatus: "active",
      stagePhase: "active",
      horizontalOverflowCssPx: 0,
      clippedTextCssPx: 0,
      playerControlOverlapCssPx2: 0,
      playerPlayfieldEscapeCssPx: 0,
      minimumTargetWidthCssPx: 44,
      minimumTargetHeightCssPx: 44,
    };
  });
  const settling = {
    ...active.at(-1)!,
    sequence: 600,
    monotonicMilliseconds: 60_000,
    simulationTick: 3000,
    patternIndex: 11,
    resolvedEntityCount: 37,
    motionKind: "idle",
    semanticPromptVisible: false,
    visibleWarningCount: 0,
    visibleInteractiveTargetCount: 0,
    runStatus: "active",
    stagePhase: "settling",
    minimumTargetWidthCssPx: 0,
    minimumTargetHeightCssPx: 0,
  };
  const completed = {
    ...settling,
    sequence: 601,
    monotonicMilliseconds: 60_100,
    resolvedEntityCount: 0,
    motionKind: "none",
    visiblePlayerCount: 0,
    visiblePlayfieldCount: 1,
    visibleControlClusterCount: 0,
    visibleInteractiveTargetCount: 2,
    runStatus: "completed",
    stagePhase: "complete",
    minimumTargetWidthCssPx: 44,
    minimumTargetHeightCssPx: 44,
  };
  return [...active, settling, completed];
}

function focusSelector(transitionId: string): string {
  return ({
    "entry-to-start": "#runner-start-button",
    "start-to-persistent-runner": "#runner-user-pause-button",
    "semantic-prompt-open": '[data-runner-semantic-lane="0"]',
    "semantic-choice-submit": "#runner-status-heading",
    "user-pause-resume": "#runner-user-pause-button",
    "visibility-pause-resume": "#runner-visibility-resume-button",
    "focus-interruption-resume": "#runner-focus-resume-button",
    "modal-open": '[data-runner-remap="lane-up"]',
    "modal-close": "[data-runner-configure-bindings]",
    completion: "#runner-completion-heading",
  } as Record<string, string>)[transitionId]!;
}

function pauseSummary(transitionId: string): string {
  return ({
    "user-pause-resume": "paused by you",
    "visibility-pause-resume": "page hidden",
    "focus-interruption-resume": "window focus interrupted",
    "modal-open": "dialog open",
  } as Record<string, string>)[transitionId] ?? "Not paused";
}

const announcementTexts: Readonly<Record<string, string>> = {
  "approach-warning-with-lane-and-time": "Choice ahead. Top lane. Benefit: Health +1. Hazard: No hazard. Urgency: 10 ticks (200 ms) to the nearest event. Middle lane. Benefit: No benefit. Hazard: No hazard. Urgency: 10 ticks (200 ms) to the nearest event. Bottom lane. Benefit: No benefit. Hazard: No hazard. Urgency: 10 ticks (200 ms) to the nearest event.",
  "actual-benefit-contact-with-score-and-delta": "Top lane: Health increased by 1 to 66.",
  "actual-hazard-contact-with-score-and-delta": "Top lane: Health decreased by 1 to 64.",
  "suppressed-hazard-contact-with-no-score-change": "Top lane: Health changed by 0 and remains 65 because the hazard was suppressed.",
  "clamped-effect-result-with-requested-and-actual-delta": "Middle lane: Financial security did not change to 100. Requested +1; the limit changed the actual result.",
  "semantic-prompt-open-and-choice-confirmation": "Lane choice confirmed: Top lane.",
  "pause-and-resume-with-reason": "Runner resumed.",
  "actionable-error-with-recovery-action": "Review the status and return to the title to recover.",
  "completion-with-singleton-fact-and-memory": "Runner laboratory complete: one learning fact (fact-runner-laboratory-complete-v1: value-runner-laboratory-practice-v1) and one milestone memory (memory-runner-laboratory-complete-v1: Completed the runner laboratory.) were recorded. Practice scores: Health 65, Happiness 60, Financial security 35. These practice scores do not affect your life journey.",
};

function witnessState(overrides: Record<string, unknown> = {}) {
  return {
    simulationTick: 0,
    sessionStatus: "running",
    runStatus: "active",
    stagePhase: "active",
    scores: { health: 65, happiness: 60, money: 35 },
    pauseReasons: [],
    runnerUserPaused: false,
    invulnerableUntilTick: 0,
    resolvedEntityCount: 1,
    factIds: [],
    memoryIds: [],
    noticeTone: null,
    noticeMessage: null,
    ...overrides,
  };
}

function contactTransition(
  outcome: "benefit-applied" | "hazard-applied" | "hazard-suppressed",
  options: { clamp?: boolean } = {},
) {
  const benefit = outcome === "benefit-applied";
  const suppressed = outcome === "hazard-suppressed";
  const tick = suppressed ? 568 : 550;
  const beforeScore = options.clamp ? 100 : 65;
  const actual = suppressed || options.clamp ? 0 : benefit ? 1 : -1;
  const afterScore = beforeScore + actual;
  const contentId = options.clamp
    ? "runner-lab-money-token-v1"
    : benefit ? "runner-lab-health-token-v1" : "runner-lab-clutter-hazard-v1";
  const entityHex = options.clamp
    ? "0000000000000004"
    : outcome === "benefit-applied" ? "0000000000000001"
      : outcome === "hazard-applied" ? "0000000000000002" : "0000000000000003";
  const entityId = `entity-${entityHex}`;
  const scoreId = options.clamp ? "money" : "health";
  const beforeScores = {
    health: scoreId === "health" ? beforeScore : 65,
    happiness: suppressed ? 59 : 60,
    money: scoreId === "money" ? beforeScore : 35,
  };
  const afterScores = { ...beforeScores, [scoreId]: afterScore };
  return {
    before: witnessState({
      simulationTick: tick - 1,
      scores: beforeScores,
      invulnerableUntilTick: suppressed ? 575 : 0,
    }),
    after: witnessState({
      simulationTick: tick,
      scores: afterScores,
      invulnerableUntilTick: suppressed ? 575 : benefit ? 0 : 575,
      resolvedEntityCount: 2,
    }),
    eventTypes: ["clock-advanced", "contact-resolved"],
    contact: {
      entityInstanceId: entityId,
      contentId,
      outcome,
      simulationTick: tick,
      scoreId,
      definitionRequestedDelta: benefit ? 1 : -1,
      effectId: suppressed ? null : `effect-${entityHex}`,
      effectRequestedDelta: suppressed ? null : benefit ? 1 : -1,
      effectActualDelta: suppressed ? null : actual,
      effectBefore: suppressed ? null : beforeScore,
      effectAfter: suppressed ? null : afterScore,
      stateScoreBefore: beforeScore,
      stateScoreAfter: afterScore,
      resolvedBefore: false,
      resolvedAfter: true,
      courseEntityInstanceId: entityId,
      courseContentId: contentId,
      courseEntityKind: benefit ? "benefit" : "hazard",
      courseLane: options.clamp ? 1 : 0,
      courseContactTick: tick,
    },
  };
}

function transitionEvidence(witnessId: string) {
  const common = {
    provenance: "createRunnerSession",
    before: witnessState({ simulationTick: 299 }),
    after: witnessState({ simulationTick: 300 }),
    eventTypes: [] as string[],
    pattern: null as any,
    contact: null as any,
    suppressionSource: null as any,
    decision: null as any,
    pause: null as any,
    error: null as any,
    completion: null as any,
    boundaryPrecondition: null as any,
    presentationCarrier: null as any,
  };
  if (witnessId === "approach-warning-with-lane-and-time") {
    const entityId = "entity-000000000000000a";
    const markerId = "entity-000000000000000b";
    const ids = [entityId, markerId];
    return {
      ...common,
      eventTypes: ["clock-advanced", "pattern-appended"],
      pattern: {
        patternIndex: 1, eventSimulationTick: 300, courseSpawnTick: 300,
        courseAnchorTick: 310,
        eventEntityInstanceIds: ids, courseEntityInstanceIds: ids,
        courseDecisionMarkerInstanceId: markerId,
        courseEntities: [{
          instanceId: entityId,
          contentId: "runner-lab-health-token-v1",
          kind: "benefit",
          lane: 0,
          contactTick: 310,
          scoreId: "health",
          requestedDelta: 1,
        }],
      },
    };
  }
  if (witnessId === "actual-benefit-contact-with-score-and-delta") {
    return { ...common, ...contactTransition("benefit-applied") };
  }
  if (witnessId === "actual-hazard-contact-with-score-and-delta") {
    return { ...common, ...contactTransition("hazard-applied") };
  }
  if (witnessId === "suppressed-hazard-contact-with-no-score-change") {
    const source = contactTransition("hazard-applied");
    source.before = witnessState({
      simulationTick: 549,
      scores: { health: 65, happiness: 60, money: 35 },
      invulnerableUntilTick: 0,
    });
    source.after = witnessState({
      simulationTick: 550,
      scores: { health: 65, happiness: 59, money: 35 },
      invulnerableUntilTick: 575,
      resolvedEntityCount: 2,
    });
    source.contact = {
      ...source.contact,
      entityInstanceId: "entity-0000000000000005",
      courseEntityInstanceId: "entity-0000000000000005",
      contentId: "runner-lab-pressure-hazard-v1",
      courseContentId: "runner-lab-pressure-hazard-v1",
      scoreId: "happiness",
      stateScoreBefore: 60,
      stateScoreAfter: 59,
      effectId: "effect-0000000000000005",
      effectBefore: 60,
      effectAfter: 59,
    };
    return {
      ...common,
      ...contactTransition("hazard-suppressed"),
      suppressionSource: {
        before: source.before,
        after: source.after,
        contact: source.contact,
      },
    };
  }
  if (witnessId === "clamped-effect-result-with-requested-and-actual-delta") {
    return {
      ...common,
      ...contactTransition("benefit-applied", { clamp: true }),
      provenance: "isolated-nonpersisted-production-contact-seam",
      boundaryPrecondition: {
        effectId: "browser-clamp-precondition-1", source: "system", requestedDelta: 65,
        actualDelta: 65, after: 100, persisted: false,
      },
      presentationCarrier: {
        carrierKind: "authentic-unclamped-production-state",
        simulationTick: 550,
        scoreId: "money",
        carrierScore: 36,
        eventScoreAfter: 100,
        eventObjectIdentityPreserved: true,
      },
    };
  }
  if (witnessId === "semantic-prompt-open-and-choice-confirmation") {
    const marker = "marker-semantic-1";
    return {
      ...common,
      before: witnessState({ simulationTick: 300, sessionStatus: "paused", pauseReasons: ["semantic"] }),
      after: witnessState({ simulationTick: 301, resolvedEntityCount: 2 }),
      eventTypes: ["decision-marker-resolved", "clock-advanced"],
      decision: {
        markerInstanceId: marker, courseMarkerInstanceId: marker, simulationTick: 300,
        controlMode: "semantic-assist", targetLane: 0, unresolvedBefore: true, resolvedAfter: true,
      },
    };
  }
  if (witnessId === "pause-and-resume-with-reason") {
    return {
      ...common,
      before: witnessState(),
      after: witnessState(),
      eventTypes: ["user-pause-changed", "user-pause-changed"],
      pause: {
        activeSequence: [true, false],
        eventTypeSequence: ["user-pause-changed", "user-pause-changed"],
        intermediate: witnessState({
          sessionStatus: "paused", pauseReasons: ["user"], runnerUserPaused: true,
        }),
      },
    };
  }
  if (witnessId === "actionable-error-with-recovery-action") {
    return {
      ...common,
      before: witnessState(),
      after: witnessState({
        sessionStatus: "faulted", noticeTone: "error",
        noticeMessage: "Review the status and return to the title to recover.",
      }),
      eventTypes: [],
      error: {
        recoveryActionSelector: "[data-runner-fault-return-title]",
        recoveryActionVisible: true,
        recoveryActionFocused: true,
      },
    };
  }
  return {
    ...common,
    before: witnessState({ simulationTick: 3000, sessionStatus: "settling", stagePhase: "settling" }),
    after: witnessState({
      simulationTick: 3000, sessionStatus: "completed", runStatus: "completed",
      stagePhase: "complete", runnerUserPaused: null, invulnerableUntilTick: null,
      factIds: ["fact-runner-laboratory-complete-v1"],
      memoryIds: ["memory-runner-laboratory-complete-v1"],
    }),
    eventTypes: ["settlement-applied"],
    completion: {
      settlementEventTick: 3000,
      factIds: ["fact-runner-laboratory-complete-v1"],
      memoryIds: ["memory-runner-laboratory-complete-v1"],
      expectedFactId: "fact-runner-laboratory-complete-v1",
      expectedMemoryId: "memory-runner-laboratory-complete-v1",
    },
  };
}

const contrastCategories = [
  "text", "control", "focus", "warning", "status", "alert", "dialog", "completion",
  "fault", "player", "entity", "lane", "progress",
] as const;

function contrastMeasurements(
  motionSource: "normal" | "saved-reduced" | "os-reduced",
  textScalePercent: number,
  contrast: "standard" | "high" | "forced-colors",
) {
  const measurements = [
    {
      category: "text", state: "running", kind: "normal-text", selector: "#normal-text",
      variant: null,
      sampleMotionSource: motionSource,
      foregroundColor: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
    },
    {
      category: "text", state: "running", kind: "large-text", selector: "#large-text",
      variant: null,
      sampleMotionSource: motionSource,
      foregroundColor: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
    },
    ...contrastCategories.filter((category) => category !== "text").map((category) => ({
      category,
      state: category === "dialog" ? "dialog" : category === "completion" ? "completion" :
        category === "fault" || category === "alert" ? "fault" : "running",
      kind: "non-text",
      variant: category === "entity" ? "opportunity" : category === "lane" ? "lane-0" :
        category === "progress" ? "value-track" : null,
      sampleMotionSource: category === "entity" ? "normal" : motionSource,
      selector: `#${category}-sample`,
      foregroundColor: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)",
      contrastRatio: 21,
    })),
    ...["dialog", "completion", "fault"].flatMap((state) => [
      {
        category: "text", state, kind: "normal-text", variant: null, sampleMotionSource: motionSource,
        selector: `#${state}-text`, foregroundColor: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
      },
      {
        category: "control", state, kind: "non-text", variant: null, sampleMotionSource: motionSource,
        selector: `#${state}-control`, foregroundColor: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
      },
      {
        category: "focus", state, kind: "non-text", variant: null, sampleMotionSource: motionSource,
        selector: `#${state}-focus`, foregroundColor: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
      },
    ]),
    ...["benefit", "hazard"].map((variant) => ({
      category: "entity", state: "running", kind: "non-text", variant,
      sampleMotionSource: "normal",
      selector: `#entity-${variant}`, foregroundColor: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
    })),
    {
      category: "lane", state: "running", kind: "non-text", variant: "lane-1",
      sampleMotionSource: motionSource,
      selector: "#lane-1", foregroundColor: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)", contrastRatio: 21,
    },
  ];
  return measurements.map((measurement) => {
    const renderedGraphic = measurement.kind === "non-text" &&
      ["player", "entity", "lane", "progress"].includes(measurement.category);
    return {
      ...measurement,
      sampleMethod: renderedGraphic ? "rendered-pixel-pair" : "computed-style",
      samplePoints: renderedGraphic
        ? { foreground: { x: 1, y: 1 }, background: { x: 2, y: 1 } }
        : null,
      stateProof: {
        effectiveContrastMode: contrast === "high" ? "high" : "standard",
        forcedColorsActive: contrast === "forced-colors",
        effectiveTextScaleRatio: textScalePercent / 100,
        effectiveReducedMotion: measurement.sampleMotionSource !== "normal",
        horizontalOverflowCssPx: 0,
        clippedTextCssPx: 0,
        minimumTargetWidthCssPx: 44,
        minimumTargetHeightCssPx: 44,
      },
    };
  });
}

function validArtifact(): RunnerBrowserMatrixArtifact {
  const completed = Date.now() - 100;
  const started = completed - 20_000;
  const matrix = fixture.accessibility.browserMatrix;
  const cells: any[] = [];
  for (const completionPath of matrix.completionReflowMatrix.paths) {
    for (const viewport of matrix.completionReflowMatrix.viewports) {
      for (const textScalePercent of matrix.completionReflowMatrix.textScalePercent) {
        const pathActivations = completionPath === "automatic-assist"
          ? 0
          : completionPath === "semantic-assist" ? 10 : 1;
        const pathSelector = completionPath === "manual-keyboard"
          ? "keyboard:ArrowUp"
          : completionPath === "manual-buttons"
            ? '[data-runner-lane-command="lane-up"]'
            : completionPath === "manual-swipe"
              ? "[data-runner-play-surface]:swipe-up"
              : completionPath === "semantic-assist"
                ? '[data-runner-semantic-lane="0"]'
                : null;
        cells.push({
          group: "completionReflow",
          cellId: `completion-reflow:${completionPath}:${viewport.width}x${viewport.height}:${textScalePercent}`,
          path: completionPath,
          viewport: { ...viewport },
          textScalePercent,
          observations: {
            runStatus: "completed",
            completionHeadingSelector: "#runner-completion-heading",
            completionHeadingVisible: true,
            startActivations: 1,
            pathActivations,
            unexpectedActivations: 0,
            activatedSelectors: [
              "#runner-start-button",
              ...Array.from({ length: pathActivations }, () => pathSelector),
            ],
            startTransition: {
              source: "production-durable-checkpoint",
              selector: "#runner-start-button",
              beforeSessionStatus: "awaiting-start",
              afterSessionStatus: "running",
              beforeSimulationTick: 0,
              afterSimulationTick: 0,
              beforeStartButtonVisible: true,
              afterStartButtonVisible: false,
              beforeResolvedEntityIds: [],
              afterResolvedEntityIds: ["entity-0d4571d6b34db692"],
              productionStateChanged: true,
            },
            activationTransitions: Array.from({ length: pathActivations }, () => ({
              selector: pathSelector,
              beforeLaneSummary: completionPath.startsWith("manual-")
                ? "Middle lane"
                : "Top lane",
              afterLaneSummary: "Top lane",
              beforeSemanticPromptVisible: completionPath === "semantic-assist",
              afterSemanticPromptVisible: false,
              productionStateChanged: true,
            })),
            layoutSamples: completeLayoutSamples(completionPath),
            horizontalOverflowCssPx: 0,
            clippedTextCssPx: 0,
            playerControlOverlapCssPx2: 0,
            playerPlayfieldEscapeCssPx: 0,
            minimumTargetWidthCssPx: 44,
            minimumTargetHeightCssPx: 44,
          },
          thresholds: {
            requiredRunStatus: "completed",
            requiredStartActivations: 1,
            requiredPathActivations: pathActivations,
            maximumUnexpectedActivations: 0,
            maximumHorizontalOverflowCssPx: 0,
            maximumClippedTextCssPx: 0,
            maximumPlayerControlOverlapCssPx2: 0,
            maximumPlayerPlayfieldEscapeCssPx: 0,
            minimumTargetCssPx: 44,
            minimumLayoutSampleCount: 300,
            maximumLayoutSampleIntervalMilliseconds: 100,
            minimumLayoutSamplingSpanMilliseconds: 59_000,
            lateStateTickMinimum: 2500,
            allPatternIndexesRequired: true,
          },
        });
      }
    }
  }
  for (const viewport of matrix.presentationMatrix.viewports) {
    for (const textScalePercent of matrix.presentationMatrix.textScalePercent) {
      for (const contrast of matrix.presentationMatrix.contrast) {
        for (const motionSource of matrix.presentationMatrix.motionSource) {
          const reduced = motionSource !== "normal";
          cells.push({
            group: "presentation",
            cellId: `presentation:${viewport.width}x${viewport.height}:${textScalePercent}:${contrast}:${motionSource}`,
            viewport: { ...viewport },
            textScalePercent,
            contrast,
            motionSource,
            observations: {
              horizontalOverflowCssPx: 0,
              clippedTextCssPx: 0,
              minimumTargetWidthCssPx: 44,
              minimumTargetHeightCssPx: 44,
              normalTextContrastRatio: 21,
              largeTextContrastRatio: 21,
              nonTextContrastRatio: 21,
              contrastMeasurements: contrastMeasurements(motionSource, textScalePercent, contrast),
              contrastCategories: [...contrastCategories],
              worstNormalTextSample: "#normal-text",
              worstLargeTextSample: "#large-text",
              worstNonTextSample: "#control-sample",
              forcedColorsActive: contrast === "forced-colors",
              forcedColorAdjust: "auto",
              effectiveContrastMode: contrast === "high" ? "high" : "standard",
              effectiveTextScale: String(textScalePercent / 100),
              effectiveTextScaleRatio: textScalePercent / 100,
              effectiveReducedMotion: reduced,
              entityFieldDisplayed: !reduced,
              worldTransform: reduced ? "none" : "matrix(1, 0, 0, 1, -5, 0)",
              worldAnimationName: "none",
              playerAnimationName: "none",
              semanticTree: semanticTree(),
              accessibilityTree: accessibilityTree(),
            },
            thresholds: {
              maximumHorizontalOverflowCssPx: 0,
              maximumClippedTextCssPx: 0,
              minimumTargetCssPx: 44,
              minimumNormalTextContrastRatio: 4.5,
              minimumLargeTextContrastRatio: 4.5,
              minimumNonTextContrastRatio: 3,
              forcedColorsTreatmentRequired: contrast === "forced-colors",
              effectiveReducedMotionRequired: reduced,
              playfieldExcludedFromAccessibilityTree: true,
              scoreOutputCount: 3,
              summaryFieldCount: 4,
              semanticChoiceCount: 3,
            },
          });
        }
      }
    }
  }
  for (const viewport of matrix.safeAreaOneHandMatrix.mobileViewports) {
    for (const textScalePercent of matrix.safeAreaOneHandMatrix.textScalePercent) {
      for (const reach of matrix.safeAreaOneHandMatrix.reach) {
        const rect = (rectangleLeft: number, rectangleRight: number, top: number, bottom: number) => ({
          top, right: rectangleRight, bottom, left: rectangleLeft,
          width: rectangleRight - rectangleLeft, height: bottom - top,
        });
        const orientation = (
          orientationName: "portrait" | "landscape",
          width: number,
          height: number,
        ) => {
          const clusterWidth = Math.min(104, Math.floor(width / 2) - 20);
          const left = reach === "left" ? 33 : width - 31 - clusterWidth;
          const right = left + clusterWidth;
          return {
            orientation: orientationName,
            viewport: { width, height },
            clusterCount: 1,
            clusterPlacement: reach,
            placementControlValue: reach,
            placementControlLabel: reach === "left"
              ? "Move lane controls to right side"
              : "Move lane controls to left side",
            safeAreaContainerSelector: ".col-shell",
            viewRect: rect(0, width, 0, height),
            playerRect: rect(width / 2 - 20, width / 2 + 20, height - 100, height - 50),
            playfieldRect: rect(0, width, 180, height),
            clusterRect: rect(left, right, 100, 160),
            buttonRects: [
              rect(left + 5, left + 49, 108, 152),
              rect(right - 49, right - 5, 108, 152),
            ],
            visibleInteractiveControlCount: 2,
            interactiveControlRects: [
              rect(left + 5, left + 49, 108, 152),
              rect(right - 49, right - 5, 108, 152),
            ],
            playerControlOverlapCssPx2: 0,
            computedPaddingCssPx: { top: 37, right: 39, bottom: 45, left: 41 },
            horizontalOverflowCssPx: 0,
            viewportEscapeCssPx: 0,
          };
        };
        cells.push({
          group: "safeAreaOneHand",
          cellId: `safe-area:${viewport.width}x${viewport.height}:${textScalePercent}:${reach}`,
          viewport: { ...viewport },
          textScalePercent,
          reach,
          observations: {
            cssEnvironmentSafeAreaSupported: true,
            emulatedSafeAreaInsetsCssPx: { top: 29, right: 31, bottom: 37, left: 33 },
            orientations: {
              portrait: orientation("portrait", viewport.width, viewport.height),
              landscape: orientation("landscape", viewport.height, viewport.width),
            },
            multiPointerCancellationRecovered: true,
            multiPointerCancellationWitness: {
              laneBefore: "Middle lane",
              laneAfterCancellation: "Middle lane",
              laneAfterRecovery: "Top lane",
              durableBefore: {
                simulationTick: 2,
                motionKind: "idle",
                currentLane: 1,
                targetLane: 1,
                inputBuffer: null,
              },
              durableAfterCancellation: {
                simulationTick: 32,
                motionKind: "idle",
                currentLane: 1,
                targetLane: 1,
                inputBuffer: null,
              },
              durableAfterRecovery: {
                simulationTick: 62,
                motionKind: "idle",
                currentLane: 0,
                targetLane: 0,
                inputBuffer: null,
              },
            },
          },
          thresholds: {
            requiredOrientationCount: 2,
            requiredNonzeroSafeAreaSides: 4,
            requiredClusterCount: 1,
            requiredButtonCount: 2,
            minimumTargetCssPx: 44,
            maximumHorizontalOverflowCssPx: 0,
            maximumViewportEscapeCssPx: 0,
            maximumPlayerControlOverlapCssPx2: 0,
            requiredClusterPlacement: reach,
            multiPointerCancellationRecoveryRequired: true,
          },
        });
      }
    }
  }
  for (const transition of matrix.focusTransitions) {
    const modalOpen = transition.transitionId === "modal-open";
    const modalClose = transition.transitionId === "modal-close";
    const selector = focusSelector(transition.transitionId);
    cells.push({
      group: "focus",
      cellId: `focus:${transition.transitionId}`,
      transitionId: transition.transitionId,
      expectedFocus: transition.expectedFocus,
      viewport: { width: 320, height: 568 },
      textScalePercent: 200,
      observations: {
        actualFocusedSelector: selector,
        trace: [{ action: transition.transitionId, selector, atMonotonicMilliseconds: 100 }],
        effectiveTextScale: "2",
        effectiveTextScaleRatio: 2,
        focusIndicatorStyle: "solid",
        focusIndicatorWidthCssPx: 3,
        focusIndicatorContrastRatio: 4,
        focusIndicatorVisible: true,
        focusedRect: {
          top: 10, right: 310, bottom: 54, left: 10, width: 300, height: 44,
        },
        focusIndicatorRect: {
          top: 7, right: 313, bottom: 57, left: 7, width: 306, height: 50,
        },
        focusedViewportEscapeCssPx: 0,
        obstructionSamplePoints: 5,
        unobscuredSamplePoints: 5,
        indicatorRingSamplePoints: 4,
        unobscuredIndicatorRingSamplePoints: 4,
        indicatorClippingAncestorCount: 0,
        modalBackgroundInert: modalOpen ? true : null,
        forwardTrapSelector: modalOpen ? '[data-runner-remap="lane-up"]' : null,
        backwardTrapSelector: modalOpen ? "[data-runner-close-bindings]" : null,
        invokerSelector: modalClose ? "[data-runner-configure-bindings]" : null,
        restoredInvokerSelector: modalClose ? "[data-runner-configure-bindings]" : null,
        runnerPauseSummary: pauseSummary(transition.transitionId),
      },
      thresholds: {
        requiredFocusedSelector: selector,
        minimumFocusIndicatorWidthCssPx: 2,
        minimumFocusIndicatorContrastRatio: 3,
        visibleFocusIndicatorRequired: true,
        maximumFocusedViewportEscapeCssPx: 0,
        requiredUnobscuredSamplePoints: 5,
        requiredUnobscuredIndicatorRingSamplePoints: 4,
        maximumIndicatorClippingAncestorCount: 0,
        modalBackgroundInertRequired: modalOpen,
        forwardTabContainmentRequired: modalOpen,
        backwardTabContainmentRequired: modalOpen,
        exactInvokerRestoreRequired: modalClose,
        requiredPauseSummary: pauseSummary(transition.transitionId) === "Not paused"
          ? ""
          : pauseSummary(transition.transitionId),
      },
    });
  }
  matrix.liveRegions.announcementWitnesses.forEach((witnessId: string, index: number) => {
    const at = (index + 1) * 1_001;
    cells.push({
      group: "announcements",
      cellId: `announcement:${witnessId}`,
      witnessId,
      observations: {
        region: witnessId === "actionable-error-with-recovery-action" ? "alert" : "status",
        text: announcementTexts[witnessId],
        writtenAtUtc: new Date(started + at).toISOString(),
        atMonotonicMilliseconds: at,
        previousWriteMonotonicMilliseconds: at - 1_001,
        intervalFromPreviousMilliseconds: 1_001,
        duplicateWriteCount: 0,
        latestMessageWinsObserved: true,
        duplicateSuppressionObserved: true,
        transitionEvidence: transitionEvidence(witnessId),
      },
      thresholds: {
        minimumIntervalMilliseconds: 1000,
        maximumDuplicateWriteCount: 0,
        latestMessageWinsRequired: true,
        duplicateSuppressionRequired: true,
      },
    });
  });
  cells.sort((left, right) => left.cellId.localeCompare(right.cellId));
  return {
    schemaVersion: 1,
    artifactId: RUNNER_BROWSER_MATRIX_ARTIFACT_ID,
    evaluatorId: "runner-laboratory-evaluator-v1",
    fixtureId: fixture.fixtureId,
    evaluatedSourceSha256: SOURCE_DIGEST,
    startedAtUtc: new Date(started).toISOString(),
    completedAtUtc: new Date(completed).toISOString(),
    playwrightPackage: "@playwright/test",
    playwrightVersion: "1.62.1",
    browserEngine: "chromium",
    browserChannel: "chromium",
    browserVersion: "140.0.0.0",
    baseUrl: "http://127.0.0.1:4173/",
    cells,
  };
}

describe("runner browser matrix closed evidence validator", () => {
  it("samples on the common RAF and logical-tick lattice below the locked maximum", () => {
    expect(RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS).toBe(80);
    expect(RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS % 16).toBe(0);
    expect(RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS % 20).toBe(0);
    expect(RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS).toBeLessThanOrEqual(100 - 20);
  });

  it("accepts exactly the locked 139 rich measurements", () => {
    const artifact = validArtifact();
    const result = validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST);
    expect(result.groupCounts).toEqual({
      completionReflow: 40,
      presentation: 72,
      safeAreaOneHand: 8,
      focus: 10,
      announcements: 9,
      total: 139,
    });
    expect(expectedRunnerBrowserMatrixCellIds(fixture)).toHaveLength(139);
  });

  it("rejects a fabricated declarative pass flag", () => {
    const artifact = structuredClone(validArtifact()) as any;
    artifact.cells[0].status = "passed";
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/keys differ/);
  });

  it("rejects an omitted measured observation", () => {
    const artifact = structuredClone(validArtifact()) as any;
    const completion = artifact.cells.find(({ group }: any) => group === "completionReflow");
    delete completion.observations.playerPlayfieldEscapeCssPx;
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/observations keys differ/);
  });

  it("rejects a relaxed threshold and an observed threshold failure", () => {
    const relaxed = structuredClone(validArtifact()) as any;
    const presentation = relaxed.cells.find(({ group }: any) => group === "presentation");
    presentation.thresholds.minimumNonTextContrastRatio = 2;
    expect(() => validateRunnerBrowserMatrixArtifact(relaxed, fixture, SOURCE_DIGEST))
      .toThrow(/thresholds differ/);

    const failed = structuredClone(validArtifact()) as any;
    const completion = failed.cells.find(({ group }: any) => group === "completionReflow");
    completion.observations.minimumTargetWidthCssPx = 43.9;
    completion.observations.layoutSamples[0].minimumTargetWidthCssPx = 43.9;
    expect(() => validateRunnerBrowserMatrixArtifact(failed, fixture, SOURCE_DIGEST))
      .toThrow(/failed reflow/);
  });

  it("awaits every browser collector before preserving the primary failure", async () => {
    const primary = new Error("primary collector failed");
    const events: string[] = [];
    const sibling = new Promise<string>((resolve) => {
      setTimeout(() => {
        events.push("sibling settled");
        resolve("done");
      }, 5);
    });
    await expect(awaitAllSettledOrThrow([
      Promise.reject(primary),
      sibling,
    ] as const)).rejects.toBe(primary);
    expect(events).toEqual(["sibling settled"]);
  });

  it("runs every cleanup step and does not mask the operation failure", async () => {
    const primary = new Error("operation failed");
    const cleanupFailure = new Error("context close failed");
    const events: string[] = [];
    await expect(executeWithAllSettledCleanup(
      async () => { throw primary; },
      () => [
        async () => {
          events.push("context");
          throw cleanupFailure;
        },
        async () => { events.push("harness"); },
        async () => { events.push("temporary directory"); },
      ],
    )).rejects.toBe(primary);
    expect(events).toEqual(["context", "harness", "temporary directory"]);

    await expect(executeWithAllSettledCleanup(
      async () => "complete",
      () => [async () => { throw cleanupFailure; }],
    )).rejects.toBe(cleanupFailure);
  });

  it("rejects a transient late-state layout failure and an omitted Semantic prompt", () => {
    const lateFailure = structuredClone(validArtifact()) as any;
    const lateCell = lateFailure.cells.find(({ group }: any) =>
      group === "completionReflow");
    const lateSample = lateCell.observations.layoutSamples.find(
      ({ simulationTick }: any) => simulationTick === 2750,
    );
    lateSample.clippedTextCssPx = 3;
    lateCell.observations.clippedTextCssPx = 3;
    expect(() => validateRunnerBrowserMatrixArtifact(lateFailure, fixture, SOURCE_DIGEST))
      .toThrow(/failed reflow/);

    const omittedPrompt = structuredClone(validArtifact()) as any;
    const semanticCell = omittedPrompt.cells.find(({ path }: any) =>
      path === "semantic-assist");
    semanticCell.observations.layoutSamples.forEach((sample: any) => {
      if (sample.patternIndex === 10) sample.semanticPromptVisible = false;
    });
    expect(() => validateRunnerBrowserMatrixArtifact(omittedPrompt, fixture, SOURCE_DIGEST))
      .toThrow(/all ten Semantic prompts/);
  });

  it("rejects missing active UI and an unmeasured layout-sampling interval", () => {
    const missingPlayer = structuredClone(validArtifact()) as any;
    const activeCell = missingPlayer.cells.find(({ path }: any) =>
      path === "automatic-assist");
    activeCell.observations.layoutSamples[120].visiblePlayerCount = 0;
    expect(() => validateRunnerBrowserMatrixArtifact(missingPlayer, fixture, SOURCE_DIGEST))
      .toThrow(/omitted required active runner UI/);

    const cadenceGap = structuredClone(validArtifact()) as any;
    const cadenceCell = cadenceGap.cells.find(({ path }: any) =>
      path === "semantic-assist");
    cadenceCell.observations.layoutSamples[120].monotonicMilliseconds += 101;
    expect(() => validateRunnerBrowserMatrixArtifact(cadenceGap, fixture, SOURCE_DIGEST))
      .toThrow(/skipped or reversed an active layout interval/);

    const tickGap = structuredClone(validArtifact()) as any;
    const tickGapCell = tickGap.cells.find(({ path }: any) =>
      path === "automatic-assist");
    tickGapCell.observations.layoutSamples[120].simulationTick += 1;
    expect(() => validateRunnerBrowserMatrixArtifact(tickGap, fixture, SOURCE_DIGEST))
      .toThrow(/skipped or reversed an active layout interval/);

    const flatCadence = structuredClone(validArtifact()) as any;
    const flatCadenceCell = flatCadence.cells.find(({ path }: any) =>
      path === "manual-keyboard");
    flatCadenceCell.observations.layoutSamples.forEach((sample: any) => {
      sample.monotonicMilliseconds = 123;
    });
    expect(() => validateRunnerBrowserMatrixArtifact(flatCadence, fixture, SOURCE_DIGEST))
      .toThrow(/skipped or reversed an active layout interval/);

    const lifecycleBypass = structuredClone(validArtifact()) as any;
    const lifecycleCell = lifecycleBypass.cells.find(({ path }: any) =>
      path === "automatic-assist");
    const bypassedSample = lifecycleCell.observations.layoutSamples[120];
    bypassedSample.runStatus = "paused";
    bypassedSample.stagePhase = "paused";
    bypassedSample.visiblePlayerCount = 0;
    bypassedSample.visiblePlayfieldCount = 0;
    bypassedSample.visibleInteractiveTargetCount = 0;
    expect(() => validateRunnerBrowserMatrixArtifact(lifecycleBypass, fixture, SOURCE_DIGEST))
      .toThrow(/lifecycle provenance is malformed/);
  });

  it("accepts the exact durable settling handoff and rejects forged terminal lifecycles", () => {
    const valid = validArtifact();
    expect(() => validateRunnerBrowserMatrixArtifact(valid, fixture, SOURCE_DIGEST))
      .not.toThrow();
    const validCell = valid.cells.find(({ group, path }: any) =>
      group === "completionReflow" && path === "automatic-assist") as any;
    const validSettling = validCell.observations.layoutSamples.find(
      ({ stagePhase }: any) => stagePhase === "settling",
    );
    expect(validSettling).toMatchObject({
      simulationTick: 3000,
      patternIndex: 11,
      motionKind: "idle",
      visiblePlayerCount: 1,
      visiblePlayfieldCount: 1,
      visibleInteractiveTargetCount: 0,
      minimumTargetWidthCssPx: 0,
      minimumTargetHeightCssPx: 0,
      runStatus: "active",
      stagePhase: "settling",
    });
    expect(validCell.observations).toMatchObject({
      minimumTargetWidthCssPx: 44,
      minimumTargetHeightCssPx: 44,
      playerPlayfieldEscapeCssPx: 0,
    });

    for (const mutation of [
      (sample: any) => { sample.simulationTick = 2999; },
      (sample: any) => { sample.patternIndex = 10; },
      (sample: any) => { sample.motionKind = "moving"; },
      (sample: any) => { sample.runStatus = "completed"; },
      (sample: any) => { sample.stagePhase = "complete"; },
    ]) {
      const forged = structuredClone(validArtifact()) as any;
      const cell = forged.cells.find(({ group, path }: any) =>
        group === "completionReflow" && path === "automatic-assist");
      const settling = cell.observations.layoutSamples.find(
        ({ stagePhase }: any) => stagePhase === "settling",
      );
      mutation(settling);
      expect(() => validateRunnerBrowserMatrixArtifact(forged, fixture, SOURCE_DIGEST))
        .toThrow(/lifecycle provenance is malformed/);
    }

    const reverted = structuredClone(validArtifact()) as any;
    const revertedCell = reverted.cells.find(({ group, path }: any) =>
      group === "completionReflow" && path === "automatic-assist");
    const completed = revertedCell.observations.layoutSamples.find(
      ({ stagePhase }: any) => stagePhase === "complete",
    );
    completed.runStatus = "active";
    completed.stagePhase = "active";
    completed.motionKind = "idle";
    completed.visiblePlayerCount = 1;
    completed.visibleInteractiveTargetCount = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(reverted, fixture, SOURCE_DIGEST))
      .toThrow(/lifecycle provenance is malformed|reverted from the settling lifecycle/);

    const prematureFinishPattern = structuredClone(validArtifact()) as any;
    const prematureFinishCell = prematureFinishPattern.cells.find(({ group, path }: any) =>
      group === "completionReflow" && path === "automatic-assist");
    prematureFinishCell.observations.layoutSamples[120].patternIndex = 11;
    expect(() => validateRunnerBrowserMatrixArtifact(
      prematureFinishPattern,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/lifecycle provenance is malformed/);

    const staleSettling = structuredClone(validArtifact()) as any;
    const staleSettlingCell = staleSettling.cells.find(({ group, path }: any) =>
      group === "completionReflow" && path === "automatic-assist");
    staleSettlingCell.observations.layoutSamples.find(
      ({ stagePhase }: any) => stagePhase === "settling",
    ).visibleWarningCount = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(staleSettling, fixture, SOURCE_DIGEST))
      .toThrow(/stale settling guidance/);

    for (const mutation of [
      (sample: any) => { sample.visiblePlayerCount = 1; },
      (sample: any) => { sample.visiblePlayfieldCount = 0; },
      (sample: any) => { sample.visibleControlClusterCount = 1; },
      (sample: any) => {
        sample.visibleInteractiveTargetCount = 0;
        sample.minimumTargetWidthCssPx = 0;
        sample.minimumTargetHeightCssPx = 0;
      },
      (sample: any) => { sample.semanticPromptVisible = true; },
      (sample: any) => { sample.visibleWarningCount = 1; },
    ]) {
      const forged = structuredClone(validArtifact()) as any;
      const cell = forged.cells.find(({ group, path }: any) =>
        group === "completionReflow" && path === "automatic-assist");
      const terminal = cell.observations.layoutSamples.find(
        ({ stagePhase }: any) => stagePhase === "complete",
      );
      mutation(terminal);
      expect(() => validateRunnerBrowserMatrixArtifact(forged, fixture, SOURCE_DIGEST))
        .toThrow(/malformed completion UI/);
    }
  });

  it("requires nonzero safe-area emulation and both authentic orientations", () => {
    const zeroInset = structuredClone(validArtifact()) as any;
    const zeroInsetCell = zeroInset.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    zeroInsetCell.observations.emulatedSafeAreaInsetsCssPx.top = 0;
    expect(() => validateRunnerBrowserMatrixArtifact(zeroInset, fixture, SOURCE_DIGEST))
      .toThrow(/nonzero safe-area inset/);

    const ignoredTopInset = structuredClone(validArtifact()) as any;
    const ignoredTopCell = ignoredTopInset.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    ignoredTopCell.observations.orientations.portrait.computedPaddingCssPx.top = 16;
    expect(() => validateRunnerBrowserMatrixArtifact(
      ignoredTopInset,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/did not honor the emulated top safe-area inset/);

    const missingLandscape = structuredClone(validArtifact()) as any;
    const missingLandscapeCell = missingLandscape.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    delete missingLandscapeCell.observations.orientations.landscape;
    expect(() => validateRunnerBrowserMatrixArtifact(
      missingLandscape,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/orientations keys differ/);

    const fabricatedPlacement = structuredClone(validArtifact()) as any;
    const fabricatedCell = fabricatedPlacement.cells.find(({ group }: any) =>
      group === "safeAreaOneHand" && group !== undefined);
    fabricatedCell.observations.orientations.portrait.placementControlValue = "opposite";
    expect(() => validateRunnerBrowserMatrixArtifact(
      fabricatedPlacement,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/authentic one-hand placement/);

    const spanningCluster = structuredClone(validArtifact()) as any;
    const spanningCell = spanningCluster.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    const half = spanningCell.viewport.width / 2;
    spanningCell.observations.orientations.portrait.clusterRect = {
      top: 100, right: half + 60, bottom: 160, left: half - 60,
      width: 120, height: 60,
    };
    spanningCell.observations.orientations.portrait.buttonRects = [
      { top: 108, right: half - 11, bottom: 152, left: half - 55, width: 44, height: 44 },
      { top: 108, right: half + 55, bottom: 152, left: half + 11, width: 44, height: 44 },
    ];
    expect(() => validateRunnerBrowserMatrixArtifact(
      spanningCluster,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/wrong one-hand side/);

    const inconsistentRectangle = structuredClone(validArtifact()) as any;
    const inconsistentCell = inconsistentRectangle.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    inconsistentCell.observations.orientations.portrait.buttonRects[0].width = 99;
    expect(() => validateRunnerBrowserMatrixArtifact(
      inconsistentRectangle,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/edges and dimensions are inconsistent/);

    const verticalEscape = structuredClone(validArtifact()) as any;
    const escapedCell = verticalEscape.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    escapedCell.observations.orientations.portrait.viewportEscapeCssPx = 2;
    expect(() => validateRunnerBrowserMatrixArtifact(
      verticalEscape,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/lane controls escaped the viewport/);

    const underInset = structuredClone(validArtifact()) as any;
    const underInsetCell = underInset.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    const underInsetOrientation = underInsetCell.observations.orientations.portrait;
    underInsetOrientation.clusterRect = {
      ...underInsetOrientation.clusterRect,
      top: 1,
      bottom: 61,
    };
    underInsetOrientation.buttonRects = underInsetOrientation.buttonRects.map(
      (rectangle: any) => ({ ...rectangle, top: 9, bottom: 53 }),
    );
    underInsetOrientation.interactiveControlRects =
      underInsetOrientation.interactiveControlRects.map(
        (rectangle: any) => ({ ...rectangle, top: 9, bottom: 53 }),
      );
    expect(() => validateRunnerBrowserMatrixArtifact(
      underInset,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/escaped the emulated safe-area bounds/);

    const canceledGestureMoved = structuredClone(validArtifact()) as any;
    const gestureCell = canceledGestureMoved.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    gestureCell.observations.multiPointerCancellationWitness.laneAfterCancellation = "Top lane";
    gestureCell.observations.multiPointerCancellationWitness.durableAfterCancellation.currentLane = 0;
    gestureCell.observations.multiPointerCancellationWitness.durableAfterCancellation.targetLane = 0;
    expect(() => validateRunnerBrowserMatrixArtifact(
      canceledGestureMoved,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/cancel-without-request/);

    const playerOverlap = structuredClone(validArtifact()) as any;
    const overlapCell = playerOverlap.cells.find(({ group }: any) =>
      group === "safeAreaOneHand");
    overlapCell.observations.orientations.portrait.interactiveControlRects[0] =
      structuredClone(overlapCell.observations.orientations.portrait.playerRect);
    overlapCell.observations.orientations.portrait.playerControlOverlapCssPx2 = 2_000;
    expect(() => validateRunnerBrowserMatrixArtifact(
      playerOverlap,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/player overlaps a visible interactive control/);
  });

  it("rejects a reduced-motion cell whose hidden entity field is reported visible", () => {
    const artifact = structuredClone(validArtifact()) as any;
    const reduced = artifact.cells.find(({ group, motionSource }: any) =>
      group === "presentation" && motionSource === "saved-reduced");
    reduced.observations.entityFieldDisplayed = true;
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/static reduced-motion entity treatment/);
  });

  it("requires visible named score nodes and excludes moving gameplay from Chromium AX", () => {
    const hiddenOutput = structuredClone(validArtifact()) as any;
    const hiddenOutputCell = hiddenOutput.cells.find(({ group }: any) =>
      group === "presentation");
    hiddenOutputCell.observations.accessibilityTree.scoreOutputs[0].ignored = true;
    expect(() => validateRunnerBrowserMatrixArtifact(hiddenOutput, fixture, SOURCE_DIGEST))
      .toThrow(/score output is hidden/);

    const exposedEntity = structuredClone(validArtifact()) as any;
    const exposedEntityCell = exposedEntity.cells.find(({ group }: any) =>
      group === "presentation");
    exposedEntityCell.observations.accessibilityTree.movingEntities[0].ignored = false;
    exposedEntityCell.observations.accessibilityTree.unexpectedExposedPlayfieldNodeCount = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(exposedEntity, fixture, SOURCE_DIGEST))
      .toThrow(/exposes moving visual gameplay nodes/);

    const exposedDescendant = structuredClone(validArtifact()) as any;
    const exposedDescendantCell = exposedDescendant.cells.find(({ group }: any) =>
      group === "presentation");
    exposedDescendantCell.observations.accessibilityTree.unexpectedExposedPlayfieldNodeCount = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(
      exposedDescendant,
      fixture,
      SOURCE_DIGEST,
    )).toThrow(/exposes moving visual gameplay nodes/);
  });

  it("requires exact production-backed start and path activation transitions", () => {
    const noStartMarker = structuredClone(validArtifact()) as any;
    const manual = noStartMarker.cells.find(({ path }: any) => path === "manual-keyboard");
    manual.observations.startTransition.afterResolvedEntityIds = [];
    expect(() => validateRunnerBrowserMatrixArtifact(noStartMarker, fixture, SOURCE_DIGEST))
      .toThrow(/start-marker transition/);

    const noLaneChange = structuredClone(validArtifact()) as any;
    const manualWithoutChange = noLaneChange.cells.find(({ path }: any) => path === "manual-keyboard");
    manualWithoutChange.observations.activationTransitions[0].afterLaneSummary = "Middle lane";
    manualWithoutChange.observations.activationTransitions[0].productionStateChanged = false;
    expect(() => validateRunnerBrowserMatrixArtifact(noLaneChange, fixture, SOURCE_DIGEST))
      .toThrow(/not bound to production state/);

    const extraSemanticAction = structuredClone(validArtifact()) as any;
    const semantic = extraSemanticAction.cells.find(({ path }: any) => path === "semantic-assist");
    semantic.observations.pathActivations += 1;
    semantic.observations.activatedSelectors.push('[data-runner-semantic-lane="0"]');
    semantic.observations.activationTransitions.push(
      structuredClone(semantic.observations.activationTransitions[0]),
    );
    expect(() => validateRunnerBrowserMatrixArtifact(extraSemanticAction, fixture, SOURCE_DIGEST))
      .toThrow(/exact path contract/);
  });

  it("rejects duplicate cells even when the total remains 139", () => {
    const artifact = structuredClone(validArtifact()) as any;
    artifact.cells[1] = structuredClone(artifact.cells[0]);
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/duplicate cell/);
  });

  it("rejects fabricated transition evidence and duplicate completion records", () => {
    const fabricated = structuredClone(validArtifact()) as any;
    const benefit = fabricated.cells.find(({ cellId }: any) =>
      cellId === "announcement:actual-benefit-contact-with-score-and-delta");
    benefit.observations.transitionEvidence.contact.effectActualDelta = 0;
    expect(() => validateRunnerBrowserMatrixArtifact(fabricated, fixture, SOURCE_DIGEST))
      .toThrow(/exact production score effect/);

    const duplicate = structuredClone(validArtifact()) as any;
    const completion = duplicate.cells.find(({ cellId }: any) =>
      cellId === "announcement:completion-with-singleton-fact-and-memory");
    completion.observations.transitionEvidence.completion.factIds.push(
      "fact-runner-laboratory-complete-v1",
    );
    expect(() => validateRunnerBrowserMatrixArtifact(duplicate, fixture, SOURCE_DIGEST))
      .toThrow(/singleton settlement fact and memory/);
  });

  it("binds every announcement text and region to its authenticated transition", () => {
    const wrongText = structuredClone(validArtifact()) as any;
    const clamp = wrongText.cells.find(({ cellId }: any) =>
      cellId === "announcement:clamped-effect-result-with-requested-and-actual-delta");
    clamp.observations.text = "Top lane: Health did not change to 100. Requested +1; the limit changed the actual result.";
    expect(() => validateRunnerBrowserMatrixArtifact(wrongText, fixture, SOURCE_DIGEST))
      .toThrow(/exact result/);

    const wrongRegion = structuredClone(validArtifact()) as any;
    const error = wrongRegion.cells.find(({ cellId }: any) =>
      cellId === "announcement:actionable-error-with-recovery-action");
    error.observations.region = "status";
    expect(() => validateRunnerBrowserMatrixArtifact(wrongRegion, fixture, SOURCE_DIGEST))
      .toThrow(/wrong live region/);
  });

  it("rejects an invented contrast ratio and inactive visual options", () => {
    const inventedRatio = structuredClone(validArtifact()) as any;
    const presentation = inventedRatio.cells.find(({ group }: any) => group === "presentation");
    presentation.observations.contrastMeasurements[0].contrastRatio = 20;
    expect(() => validateRunnerBrowserMatrixArtifact(inventedRatio, fixture, SOURCE_DIGEST))
      .toThrow(/not derived from its colors/);

    const inactiveScale = structuredClone(validArtifact()) as any;
    const scaled = inactiveScale.cells.find(({ group, textScalePercent }: any) =>
      group === "presentation" && textScalePercent === 200);
    scaled.observations.effectiveTextScaleRatio = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(inactiveScale, fixture, SOURCE_DIGEST))
      .toThrow(/requested visual options/);
  });

  it("requires rendered graphic pixels and per-state effective layout proof", () => {
    const inferredGraphic = structuredClone(validArtifact()) as any;
    const graphicPresentation = inferredGraphic.cells.find(({ group }: any) => group === "presentation");
    const player = graphicPresentation.observations.contrastMeasurements.find(
      ({ category }: any) => category === "player",
    );
    player.sampleMethod = "computed-style";
    player.samplePoints = null;
    expect(() => validateRunnerBrowserMatrixArtifact(inferredGraphic, fixture, SOURCE_DIGEST))
      .toThrow(/wrong measurement source/);

    const staleState = structuredClone(validArtifact()) as any;
    const scaledPresentation = staleState.cells.find(({ group, textScalePercent }: any) =>
      group === "presentation" && textScalePercent === 200);
    scaledPresentation.observations.contrastMeasurements[0].stateProof.effectiveTextScaleRatio = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(staleState, fixture, SOURCE_DIGEST))
      .toThrow(/effective state layout/);

    const clippedState = structuredClone(validArtifact()) as any;
    const clippedPresentation = clippedState.cells.find(({ group }: any) => group === "presentation");
    clippedPresentation.observations.contrastMeasurements[0].stateProof.clippedTextCssPx = 1;
    expect(() => validateRunnerBrowserMatrixArtifact(clippedState, fixture, SOURCE_DIGEST))
      .toThrow(/effective state layout/);
  });

  it("rejects a fabricated suppression source chain", () => {
    const artifact = structuredClone(validArtifact()) as any;
    const suppression = artifact.cells.find(({ cellId }: any) =>
      cellId === "announcement:suppressed-hazard-contact-with-no-score-change");
    suppression.observations.transitionEvidence.suppressionSource.contact.contentId =
      "runner-lab-clutter-hazard-v1";
    suppression.observations.transitionEvidence.suppressionSource.contact.courseContentId =
      "runner-lab-clutter-hazard-v1";
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/score-neutral contact inside authentic invulnerability/);
  });

  it("rejects declarative contrast coverage and a hidden or clipped focus target", () => {
    const contrast = structuredClone(validArtifact()) as any;
    const presentation = contrast.cells.find(({ group }: any) => group === "presentation");
    presentation.observations.contrastMeasurements =
      presentation.observations.contrastMeasurements.filter(({ category }: any) => category !== "fault");
    expect(() => validateRunnerBrowserMatrixArtifact(contrast, fixture, SOURCE_DIGEST))
      .toThrow(/declarative contrast coverage/);

    const focus = structuredClone(validArtifact()) as any;
    const focusCell = focus.cells.find(({ group }: any) => group === "focus");
    focusCell.observations.focusedViewportEscapeCssPx = 1;
    focusCell.observations.unobscuredSamplePoints = 4;
    expect(() => validateRunnerBrowserMatrixArtifact(focus, fixture, SOURCE_DIGEST))
      .toThrow(/visible target/);
  });

  it("rejects focus evidence whose pause summary is not the production label", () => {
    const artifact = structuredClone(validArtifact()) as any;
    const focusCell = artifact.cells.find(({ cellId }: any) =>
      cellId === "focus:focus-interruption-resume");
    focusCell.observations.runnerPauseSummary = "Focus interruption";
    expect(() => validateRunnerBrowserMatrixArtifact(artifact, fixture, SOURCE_DIGEST))
      .toThrow(/required pause reason/);

    const extraReason = structuredClone(validArtifact()) as any;
    const extraReasonCell = extraReason.cells.find(({ cellId }: any) =>
      cellId === "focus:focus-interruption-resume");
    extraReasonCell.observations.runnerPauseSummary =
      "window focus interrupted, dialog open";
    expect(() => validateRunnerBrowserMatrixArtifact(extraReason, fixture, SOURCE_DIGEST))
      .toThrow(/required pause reason/);
  });

  it("rejects a stale source digest and stale timestamps", () => {
    const staleDigest = structuredClone(validArtifact()) as any;
    staleDigest.evaluatedSourceSha256 = "b".repeat(64);
    expect(() => validateRunnerBrowserMatrixArtifact(staleDigest, fixture, SOURCE_DIGEST))
      .toThrow(/source/);

    const staleTime = structuredClone(validArtifact()) as any;
    staleTime.startedAtUtc = new Date(Date.now() - 3_700_000).toISOString();
    staleTime.completedAtUtc = new Date(Date.now() - 3_600_000).toISOString();
    expect(() => validateRunnerBrowserMatrixArtifact(staleTime, fixture, SOURCE_DIGEST))
      .toThrow(/stale/);
  });

  it("rejects external or credentialed URLs for canonical browser evidence", () => {
    expect(() => assertCanonicalBrowserBaseUrl("https://example.test/"))
      .toThrow(/managed local preview/);
    expect(() => assertCanonicalBrowserBaseUrl("http://user:secret@127.0.0.1:4178/"))
      .toThrow(/managed local preview/);
    expect(() => assertCanonicalBrowserBaseUrl("http://127.0.0.1:4178/"))
      .not.toThrow();
    expect(() => rejectStandaloneRunnerBrowserMatrixInvocation())
      .toThrow(/cannot generate canonical evidence.*non-canonical diagnostics/);
  });

  it("makes the isolated browser harness apply the real root accessibility settings", async () => {
    const harnessSource = await readFile(path.join(
      process.cwd(),
      "scripts",
      "browser-fixtures",
      "runner-browser-harness.ts",
    ), "utf8");
    expect(harnessSource).toContain("root.dataset.contrast = harnessContrast");
    expect(harnessSource).toContain("root.dataset.reducedMotion = String(harnessMotionReduced)");
    expect(harnessSource).toContain(
      'root.style.setProperty("--col-text-scale", String(harnessTextScaleMultiplier))',
    );
  });

  it("pauses installed browser time before controlled evidence advances", async () => {
    let browserTime = 12_345;
    let performanceTime = 456;
    let evaluationCount = 0;
    const pauseAt = vi.fn(async (target: number) => {
      browserTime = target;
    });
    const evaluate = vi.fn(async () => {
      evaluationCount += 1;
      return evaluationCount === 1
        ? browserTime
        : { dateMilliseconds: browserTime, performanceMilliseconds: performanceTime };
    });
    const page = { clock: { pauseAt }, evaluate } as any;

    await expect(pauseRunnerBrowserClock(page)).resolves.toBe(22_345);
    expect(pauseAt).toHaveBeenCalledExactlyOnceWith(22_345);
    expect(evaluate).toHaveBeenCalledTimes(3);

    evaluationCount = 0;
    const driftingPage = {
      clock: { pauseAt: vi.fn(async () => undefined) },
      evaluate: vi.fn(async () => {
        evaluationCount += 1;
        if (evaluationCount === 1) return browserTime;
        performanceTime += 1;
        return { dateMilliseconds: browserTime + 10_000, performanceMilliseconds: performanceTime };
      }),
    } as any;
    await expect(pauseRunnerBrowserClock(driftingPage))
      .rejects.toThrow(/Date\/performance clocks did not pause/);
  });

  it("waits for exact published interruption UI instead of assuming one frame is enough", async () => {
    let frame = 0;
    const runFor = vi.fn(async () => {
      frame += 1;
    });
    const page = {
      clock: { runFor },
      evaluate: vi.fn(async () => frame >= 2
        ? "#runner-focus-resume-button"
        : "#runner-user-pause-button"),
      locator: vi.fn((selector: string) => ({
        textContent: async () => selector === '[data-runner-summary="pause"]' && frame >= 2
          ? "window focus interrupted"
          : "Not paused",
        isVisible: async () => selector === "#runner-focus-resume-button" && frame >= 2,
      })),
    } as any;

    await expect(awaitRunnerPauseUi(
      page,
      "window focus interrupted",
      "#runner-focus-resume-button",
      true,
      "window focus return",
      3,
    )).resolves.toBeUndefined();
    expect(runFor).toHaveBeenCalledTimes(2);

    frame = 0;
    await expect(awaitRunnerPauseUi(
      page,
      "window focus interrupted",
      "#runner-focus-resume-button",
      true,
      "window focus return",
      1,
    )).rejects.toThrow(/did not publish its exact pause UI.*summary=.*Not paused/);
  });

  it("requires Resume to clear every interruption and restore the exact control", async () => {
    let frame = 0;
    let lingeringFocusResume = false;
    const runFor = vi.fn(async () => {
      frame += 1;
    });
    const page = {
      clock: { runFor },
      evaluate: vi.fn(async () => frame >= 2
        ? "#runner-user-pause-button"
        : "#runner-focus-resume-button"),
      locator: vi.fn((selector: string) => ({
        textContent: async () => selector === '[data-runner-summary="pause"]' && frame >= 2
          ? "Not paused"
          : "window focus interrupted",
        isVisible: async () => {
          if (selector === "#runner-focus-resume-button") {
            return frame < 2 || lingeringFocusResume;
          }
          return false;
        },
      })),
    } as any;

    await expect(awaitRunnerUnpausedUi(
      page,
      "#runner-user-pause-button",
      "focus Resume",
      3,
    )).resolves.toBeUndefined();
    expect(runFor).toHaveBeenCalledTimes(2);

    frame = 0;
    lingeringFocusResume = true;
    await expect(awaitRunnerUnpausedUi(
      page,
      "#runner-user-pause-button",
      "focus Resume",
      2,
    )).rejects.toThrow(/did not restore exact unpaused UI.*focusResumeVisible=true/);
  });

  it("builds the isolated witness harness with the audited production property mangling", async () => {
    const server = await startHarnessServer(process.cwd());
    let browser: Browser | null = null;
    try {
      const htmlResponse = await fetch(server.url);
      expect(htmlResponse.ok).toBe(true);
      const html = await htmlResponse.text();
      const scriptSource = html.match(/<script[^>]+src="([^"]+)"/i)?.[1];
      expect(scriptSource).toBeTypeOf("string");
      const scriptResponse = await fetch(new URL(scriptSource!, server.url));
      expect(scriptResponse.ok).toBe(true);
      const builtJavaScript = await scriptResponse.text();
      expect(builtJavaScript).toContain("__runnerBrowserHarness");
      expect(builtJavaScript).toContain("contactTick");
      expect(builtJavaScript).toContain("decision");
      expect(builtJavaScript).not.toContain("getSnapshot");
      expect(builtJavaScript).not.toContain("reportPresentationFault");
      browser = await chromium.launch({ channel: "chromium", headless: true });
      const cells = await collectAnnouncementCells(
        browser,
        process.cwd(),
        fixture,
        Date.now(),
      );
      expect(cells).toHaveLength(9);
      for (const cell of cells) {
        expect(() => validateWitnessTransitionEvidence(
          cell.observations.transitionEvidence,
          cell.witnessId,
          cell.cellId,
        )).not.toThrow();
        expect(Object.keys(cell.observations).sort()).toEqual([
          "region", "text", "writtenAtUtc", "atMonotonicMilliseconds",
          "previousWriteMonotonicMilliseconds", "intervalFromPreviousMilliseconds",
          "duplicateWriteCount", "latestMessageWinsObserved",
          "duplicateSuppressionObserved", "transitionEvidence",
        ].sort());
        expect(cell.observations.duplicateWriteCount).toBe(0);
        expect(cell.observations.latestMessageWinsObserved).toBe(true);
        expect(cell.observations.duplicateSuppressionObserved).toBe(true);
      }
      const approach = cells.find(({ witnessId }) =>
        witnessId === "approach-warning-with-lane-and-time");
      expect(approach).toBeDefined();
      const approachPattern = approach!.observations.transitionEvidence.pattern!;
      expect(Object.keys(approachPattern).sort()).toEqual([
        "patternIndex", "eventSimulationTick", "courseSpawnTick", "courseAnchorTick",
        "eventEntityInstanceIds", "courseEntityInstanceIds", "courseDecisionMarkerInstanceId",
        "courseEntities",
      ].sort());
      expect(approachPattern.courseEntities.length).toBeGreaterThan(0);
      expect(Object.keys(approachPattern.courseEntities[0]!).sort()).toEqual([
        "instanceId", "contentId", "kind", "lane", "contactTick", "scoreId",
        "requestedDelta",
      ].sort());
    } finally {
      await awaitAllSettledOrThrow([
        ...(browser === null ? [] : [browser.close()]),
        server.close(),
      ] as const);
    }
  }, 60_000);

  it("keeps swipe endpoints inside the visible play-surface intersection", () => {
    expect(visibleRunnerSwipeGesture(
      { x: 100, y: 400, width: 1_000, height: 480 },
      { width: 1_280, height: 720 },
    )).toEqual({ x: 600, startY: 712, endY: 408 });
    const oversized = visibleRunnerSwipeGesture(
      { x: 8, y: -132, width: 304, height: 832 },
      { width: 320, height: 568 },
    );
    expect(oversized).toEqual({ x: 160, startY: 560, endY: 8 });
    expect(oversized.startY - oversized.endY).toBeGreaterThanOrEqual(24);
    expect(() => visibleRunnerSwipeGesture(
      { x: 400, y: 700, width: 200, height: 100 },
      { width: 320, height: 568 },
    )).toThrow(/lacks a threshold-sized visible intersection/);
  });
});
