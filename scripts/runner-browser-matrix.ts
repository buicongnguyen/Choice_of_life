import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  AUDITED_PRODUCTION_MINIFICATION_APPROVED,
  createProductionMinificationPipeline,
  createProductionTerserOptions,
} from "../vite.config";
import { RUNNER_SWIPE_THRESHOLD_CSS_PX } from "../src/choice-of-life/platform/runner-input";
import { evaluationSourceSha256 } from "./fixture-lock.mjs";
import type { HarnessWitnessProof } from "./browser-fixtures/runner-browser-harness";

export const RUNNER_BROWSER_MATRIX_ARTIFACT_ID =
  "runner-accessibility-browser-matrix-artifact-v1" as const;
export const RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS = 80;
const RUNNER_EVALUATOR_ID = "runner-laboratory-evaluator-v1" as const;
const PLAYWRIGHT_PACKAGE = "@playwright/test" as const;
const PINNED_PLAYWRIGHT_VERSION = "1.62.1" as const;
const BROWSER_ENGINE = "chromium" as const;
const BROWSER_CHANNEL = "chromium" as const;
const FRESH_ARTIFACT_WINDOW_MILLISECONDS = 30 * 60 * 1_000;
const MAX_RUN_DURATION_MILLISECONDS = 2 * 60 * 60 * 1_000;
const CLOCK_PAUSE_HEADROOM_MILLISECONDS = 10_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_AREA_INSETS_CSS_PX = Object.freeze({
  top: 29,
  right: 31,
  bottom: 37,
  left: 33,
});

export interface RunnerBrowserViewport {
  readonly width: number;
  readonly height: number;
}

interface CompletionReflowCell {
  readonly group: "completionReflow";
  readonly cellId: string;
  readonly path: string;
  readonly viewport: RunnerBrowserViewport;
  readonly textScalePercent: number;
  readonly observations: {
    readonly runStatus: string;
    readonly completionHeadingSelector: string;
    readonly completionHeadingVisible: boolean;
    readonly startActivations: number;
    readonly pathActivations: number;
    readonly unexpectedActivations: number;
    readonly activatedSelectors: readonly string[];
    readonly startTransition: {
      readonly source: "production-durable-checkpoint";
      readonly selector: "#runner-start-button";
      readonly beforeSessionStatus: "awaiting-start";
      readonly afterSessionStatus: "running";
      readonly beforeSimulationTick: 0;
      readonly afterSimulationTick: 0;
      readonly beforeStartButtonVisible: true;
      readonly afterStartButtonVisible: false;
      readonly beforeResolvedEntityIds: readonly [];
      readonly afterResolvedEntityIds: readonly [string];
      readonly productionStateChanged: true;
    };
    readonly activationTransitions: readonly {
      readonly selector: string;
      readonly beforeLaneSummary: string;
      readonly afterLaneSummary: string;
      readonly beforeSemanticPromptVisible: boolean;
      readonly afterSemanticPromptVisible: boolean;
      readonly productionStateChanged: boolean;
    }[];
    readonly layoutSamples: readonly LayoutSampleObservation[];
    readonly horizontalOverflowCssPx: number;
    readonly clippedTextCssPx: number;
    readonly playerControlOverlapCssPx2: number;
    readonly playerPlayfieldEscapeCssPx: number;
    readonly minimumTargetWidthCssPx: number;
    readonly minimumTargetHeightCssPx: number;
  };
  readonly thresholds: {
    readonly requiredRunStatus: "completed";
    readonly requiredStartActivations: 1;
    readonly requiredPathActivations: number;
    readonly maximumUnexpectedActivations: 0;
    readonly maximumHorizontalOverflowCssPx: 0;
    readonly maximumClippedTextCssPx: 0;
    readonly maximumPlayerControlOverlapCssPx2: 0;
    readonly maximumPlayerPlayfieldEscapeCssPx: 0;
    readonly minimumTargetCssPx: 44;
    readonly minimumLayoutSampleCount: 300;
    readonly maximumLayoutSampleIntervalMilliseconds: 100;
    readonly minimumLayoutSamplingSpanMilliseconds: 59000;
    readonly lateStateTickMinimum: 2500;
    readonly allPatternIndexesRequired: true;
  };
}

interface SemanticTreeObservation {
  readonly runnerRegionElement: string;
  readonly runnerRegionAccessibleName: string;
  readonly summaryElement: string;
  readonly summaryTermCount: number;
  readonly summaryDescriptionCount: number;
  readonly scoreOutputCount: number;
  readonly scoreOutputNames: readonly string[];
  readonly progressElement: string;
  readonly progressAccessibleName: string;
  readonly playfieldAriaHidden: string;
  readonly playfieldFocusableDescendantCount: number;
  readonly decisionElement: string;
  readonly decisionLegendPresent: boolean;
  readonly semanticChoiceCount: number;
  readonly semanticChoiceLabelsContainUrgency: boolean;
  readonly laneSummaryAriaLive: string;
  readonly statusRegionCount: number;
  readonly statusRegionRole: string;
  readonly statusRegionPoliteness: string;
  readonly statusRegionAtomic: string;
  readonly alertRegionCount: number;
  readonly alertRegionRole: string;
  readonly alertRegionPoliteness: string;
  readonly alertRegionAtomic: string;
}

interface AccessibilityNodeObservation {
  readonly selector: string;
  readonly role: string;
  readonly name: string;
  readonly ignored: boolean;
}

interface AccessibilityTreeObservation {
  readonly provenance: "chromium-cdp-accessibility-tree-v1";
  readonly playfieldTraversal: "chromium-cdp-full-ax-subtree-v1";
  readonly runnerRegion: AccessibilityNodeObservation;
  readonly scoreOutputs: readonly AccessibilityNodeObservation[];
  readonly semanticChoices: readonly AccessibilityNodeObservation[];
  readonly playfield: AccessibilityNodeObservation;
  readonly movingEntityDomCount: number;
  readonly movingEntities: readonly AccessibilityNodeObservation[];
  readonly playfieldAxDescendantCount: number;
  readonly unexpectedExposedPlayfieldNodeCount: number;
}

interface ContrastMeasurement {
  readonly category:
    | "text" | "control" | "focus" | "warning" | "status" | "alert" | "dialog"
    | "completion" | "fault" | "player" | "entity" | "lane" | "progress";
  readonly state: "running" | "dialog" | "completion" | "fault";
  readonly kind: "normal-text" | "large-text" | "non-text";
  readonly variant: string | null;
  readonly sampleMotionSource: "normal" | "saved-reduced" | "os-reduced";
  readonly sampleMethod: "computed-style" | "rendered-pixel-pair";
  readonly samplePoints: null | Readonly<{
    foreground: Readonly<{ x: number; y: number }>;
    background: Readonly<{ x: number; y: number }>;
  }>;
  readonly stateProof: Readonly<{
    effectiveContrastMode: "standard" | "high";
    forcedColorsActive: boolean;
    effectiveTextScaleRatio: number;
    effectiveReducedMotion: boolean;
    horizontalOverflowCssPx: number;
    clippedTextCssPx: number;
    minimumTargetWidthCssPx: number;
    minimumTargetHeightCssPx: number;
  }>;
  readonly selector: string;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly contrastRatio: number;
}

interface PresentationCell {
  readonly group: "presentation";
  readonly cellId: string;
  readonly viewport: RunnerBrowserViewport;
  readonly textScalePercent: number;
  readonly contrast: string;
  readonly motionSource: string;
  readonly observations: {
    readonly horizontalOverflowCssPx: number;
    readonly clippedTextCssPx: number;
    readonly minimumTargetWidthCssPx: number;
    readonly minimumTargetHeightCssPx: number;
    readonly normalTextContrastRatio: number;
    readonly largeTextContrastRatio: number;
    readonly nonTextContrastRatio: number;
    readonly contrastMeasurements: readonly ContrastMeasurement[];
    readonly contrastCategories: readonly ContrastMeasurement["category"][];
    readonly worstNormalTextSample: string;
    readonly worstLargeTextSample: string;
    readonly worstNonTextSample: string;
    readonly forcedColorsActive: boolean;
    readonly forcedColorAdjust: string;
    readonly effectiveContrastMode: "standard" | "high";
    readonly effectiveTextScale: string;
    readonly effectiveTextScaleRatio: number;
    readonly effectiveReducedMotion: boolean;
    readonly entityFieldDisplayed: boolean;
    readonly worldTransform: string;
    readonly worldAnimationName: string;
    readonly playerAnimationName: string;
    readonly semanticTree: SemanticTreeObservation;
    readonly accessibilityTree: AccessibilityTreeObservation;
  };
  readonly thresholds: {
    readonly maximumHorizontalOverflowCssPx: 0;
    readonly maximumClippedTextCssPx: 0;
    readonly minimumTargetCssPx: 44;
    readonly minimumNormalTextContrastRatio: 4.5;
    readonly minimumLargeTextContrastRatio: 4.5;
    readonly minimumNonTextContrastRatio: 3;
    readonly forcedColorsTreatmentRequired: boolean;
    readonly effectiveReducedMotionRequired: boolean;
    readonly playfieldExcludedFromAccessibilityTree: true;
    readonly scoreOutputCount: 3;
    readonly summaryFieldCount: 4;
    readonly semanticChoiceCount: 3;
  };
}

interface RectangleObservation {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface SafeAreaOrientationObservation {
  readonly orientation: "portrait" | "landscape";
  readonly viewport: RunnerBrowserViewport;
  readonly clusterCount: number;
  readonly clusterPlacement: string;
  readonly placementControlValue: string;
  readonly placementControlLabel: string;
  readonly safeAreaContainerSelector: ".col-shell";
  readonly viewRect: RectangleObservation;
  readonly playerRect: RectangleObservation;
  readonly playfieldRect: RectangleObservation;
  readonly clusterRect: RectangleObservation;
  readonly buttonRects: readonly RectangleObservation[];
  readonly visibleInteractiveControlCount: number;
  readonly interactiveControlRects: readonly RectangleObservation[];
  readonly playerControlOverlapCssPx2: number;
  readonly computedPaddingCssPx: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly horizontalOverflowCssPx: number;
  readonly viewportEscapeCssPx: number;
}

interface DurableLaneCheckpointObservation {
  readonly simulationTick: number;
  readonly motionKind: "idle" | "moving";
  readonly currentLane: number;
  readonly targetLane: number;
  readonly inputBuffer: "up" | "down" | null;
}

interface MultiPointerCancellationObservation {
  readonly laneBefore: string;
  readonly laneAfterCancellation: string;
  readonly laneAfterRecovery: string;
  readonly durableBefore: DurableLaneCheckpointObservation;
  readonly durableAfterCancellation: DurableLaneCheckpointObservation;
  readonly durableAfterRecovery: DurableLaneCheckpointObservation;
}

interface SafeAreaCell {
  readonly group: "safeAreaOneHand";
  readonly cellId: string;
  readonly viewport: RunnerBrowserViewport;
  readonly textScalePercent: number;
  readonly reach: string;
  readonly observations: {
    readonly cssEnvironmentSafeAreaSupported: boolean;
    readonly emulatedSafeAreaInsetsCssPx: {
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };
    readonly orientations: {
      readonly portrait: SafeAreaOrientationObservation;
      readonly landscape: SafeAreaOrientationObservation;
    };
    readonly multiPointerCancellationRecovered: boolean;
    readonly multiPointerCancellationWitness: MultiPointerCancellationObservation;
  };
  readonly thresholds: {
    readonly requiredOrientationCount: 2;
    readonly requiredNonzeroSafeAreaSides: 4;
    readonly requiredClusterCount: 1;
    readonly requiredButtonCount: 2;
    readonly minimumTargetCssPx: 44;
    readonly maximumHorizontalOverflowCssPx: 0;
    readonly maximumViewportEscapeCssPx: 0;
    readonly maximumPlayerControlOverlapCssPx2: 0;
    readonly requiredClusterPlacement: string;
    readonly multiPointerCancellationRecoveryRequired: true;
  };
}

interface FocusTraceEntry {
  readonly action: string;
  readonly selector: string;
  readonly atMonotonicMilliseconds: number;
}

interface FocusCell {
  readonly group: "focus";
  readonly cellId: string;
  readonly transitionId: string;
  readonly expectedFocus: string;
  readonly viewport: RunnerBrowserViewport;
  readonly textScalePercent: 200;
  readonly observations: {
    readonly actualFocusedSelector: string;
    readonly trace: readonly FocusTraceEntry[];
    readonly effectiveTextScale: string;
    readonly effectiveTextScaleRatio: number;
    readonly focusIndicatorStyle: string;
    readonly focusIndicatorWidthCssPx: number;
    readonly focusIndicatorContrastRatio: number;
    readonly focusIndicatorVisible: boolean;
    readonly focusedRect: RectangleObservation;
    readonly focusIndicatorRect: RectangleObservation;
    readonly focusedViewportEscapeCssPx: number;
    readonly obstructionSamplePoints: number;
    readonly unobscuredSamplePoints: number;
    readonly indicatorRingSamplePoints: number;
    readonly unobscuredIndicatorRingSamplePoints: number;
    readonly indicatorClippingAncestorCount: number;
    readonly modalBackgroundInert: boolean | null;
    readonly forwardTrapSelector: string | null;
    readonly backwardTrapSelector: string | null;
    readonly invokerSelector: string | null;
    readonly restoredInvokerSelector: string | null;
    readonly runnerPauseSummary: string;
  };
  readonly thresholds: {
    readonly requiredFocusedSelector: string;
    readonly minimumFocusIndicatorWidthCssPx: 2;
    readonly minimumFocusIndicatorContrastRatio: 3;
    readonly visibleFocusIndicatorRequired: true;
    readonly maximumFocusedViewportEscapeCssPx: 0;
    readonly requiredUnobscuredSamplePoints: 5;
    readonly requiredUnobscuredIndicatorRingSamplePoints: 4;
    readonly maximumIndicatorClippingAncestorCount: 0;
    readonly modalBackgroundInertRequired: boolean;
    readonly forwardTabContainmentRequired: boolean;
    readonly backwardTabContainmentRequired: boolean;
    readonly exactInvokerRestoreRequired: boolean;
    readonly requiredPauseSummary: string;
  };
}

interface AnnouncementCell {
  readonly group: "announcements";
  readonly cellId: string;
  readonly witnessId: string;
  readonly observations: {
    readonly region: "status" | "alert";
    readonly text: string;
    readonly writtenAtUtc: string;
    readonly atMonotonicMilliseconds: number;
    readonly previousWriteMonotonicMilliseconds: number | null;
    readonly intervalFromPreviousMilliseconds: number | null;
    readonly duplicateWriteCount: number;
    readonly latestMessageWinsObserved: boolean;
    readonly duplicateSuppressionObserved: boolean;
    readonly transitionEvidence: HarnessWitnessProof;
  };
  readonly thresholds: {
    readonly minimumIntervalMilliseconds: 1000;
    readonly maximumDuplicateWriteCount: 0;
    readonly latestMessageWinsRequired: true;
    readonly duplicateSuppressionRequired: true;
  };
}

export type RunnerBrowserMatrixCell =
  | CompletionReflowCell
  | PresentationCell
  | SafeAreaCell
  | FocusCell
  | AnnouncementCell;

export interface RunnerBrowserMatrixArtifact {
  readonly schemaVersion: 1;
  readonly artifactId: typeof RUNNER_BROWSER_MATRIX_ARTIFACT_ID;
  readonly evaluatorId: typeof RUNNER_EVALUATOR_ID;
  readonly fixtureId: string;
  readonly evaluatedSourceSha256: string;
  readonly startedAtUtc: string;
  readonly completedAtUtc: string;
  readonly playwrightPackage: typeof PLAYWRIGHT_PACKAGE;
  readonly playwrightVersion: typeof PINNED_PLAYWRIGHT_VERSION;
  readonly browserEngine: typeof BROWSER_ENGINE;
  readonly browserChannel: typeof BROWSER_CHANNEL;
  readonly browserVersion: string;
  readonly baseUrl: string;
  readonly cells: readonly RunnerBrowserMatrixCell[];
}

export interface RunnerBrowserMatrixGroupCounts {
  readonly completionReflow: 40;
  readonly presentation: 72;
  readonly safeAreaOneHand: 8;
  readonly focus: 10;
  readonly announcements: 9;
  readonly total: 139;
}

export interface RunnerBrowserMatrixValidationSummary {
  readonly artifact: RunnerBrowserMatrixArtifact;
  readonly groupCounts: RunnerBrowserMatrixGroupCounts;
}

interface ExpectedCell {
  readonly group: RunnerBrowserMatrixCell["group"];
  readonly cellId: string;
  readonly path?: string;
  readonly viewport?: RunnerBrowserViewport;
  readonly textScalePercent?: number;
  readonly contrast?: string;
  readonly motionSource?: string;
  readonly reach?: string;
  readonly transitionId?: string;
  readonly expectedFocus?: string;
  readonly witnessId?: string;
}

function fail(message: string): never {
  throw new Error(`runner browser matrix: ${message}`);
}

export async function awaitAllSettledOrThrow<T extends readonly unknown[]>(
  tasks: { readonly [Index in keyof T]: Promise<T[Index]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure !== undefined) throw failure.reason;
  return results.map((result) =>
    (result as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

export async function executeWithAllSettledCleanup<T>(
  operation: () => Promise<T>,
  cleanupSteps: () => readonly (() => Promise<void>)[],
): Promise<T> {
  let operationSucceeded = false;
  let operationValue: T | undefined;
  let operationFailure: unknown;
  try {
    operationValue = await operation();
    operationSucceeded = true;
  } catch (error) {
    operationFailure = error;
  }

  const cleanupResults = await Promise.allSettled(
    cleanupSteps().map((cleanup) => Promise.resolve().then(cleanup)),
  );
  if (!operationSucceeded) throw operationFailure;
  const cleanupFailure = cleanupResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (cleanupFailure !== undefined) throw cleanupFailure.reason;
  return operationValue as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys differ: expected ${expected.join(", ")}; received ${actual.join(", ")}`);
  }
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) fail(`${label} must be non-negative`);
  return number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const number = nonNegativeNumber(value, label);
  if (!Number.isInteger(number)) fail(`${label} must be an integer`);
  return number;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

type RgbaColor = [number, number, number, number];

function parsedCssColor(input: string): RgbaColor {
  if (input === "transparent") return [0, 0, 0, 0];
  const rgb = input.match(/rgba?\(([^)]+)\)/i);
  if (rgb !== null) {
    const values = rgb[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
  }
  const srgb = input.match(/color\(srgb\s+([^)]*)\)/i);
  if (srgb !== null) {
    const values = srgb[1]!.split(/[ /]+/).filter(Boolean).map(Number);
    return [
      (values[0] ?? 0) * 255,
      (values[1] ?? 0) * 255,
      (values[2] ?? 0) * 255,
      values[3] ?? 1,
    ];
  }
  fail(`unsupported measured CSS color ${input}`);
}

function compositeColor(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
    alpha,
  ];
}

function contrastLuminance(color: readonly number[]): number {
  const components = color.slice(0, 3).map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
}

function measuredContrastRatio(foreground: string, background: string): number {
  const opaqueBackground = compositeColor(parsedCssColor(background), [255, 255, 255, 1]);
  const renderedForeground = compositeColor(parsedCssColor(foreground), opaqueBackground);
  const one = contrastLuminance(renderedForeground);
  const two = contrastLuminance(opaqueBackground);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

function exactViewport(value: unknown, expected: RunnerBrowserViewport, label: string): void {
  assertExactKeys(value, ["width", "height"], label);
  if (value.width !== expected.width || value.height !== expected.height) {
    fail(`${label} differs from the locked viewport`);
  }
}

function expectedCells(fixture: any): readonly ExpectedCell[] {
  const matrix: any = fixture?.accessibility?.browserMatrix;
  if (!isObject(matrix)) fail("fixture browser matrix is absent");
  const browserMatrix = matrix as any;
  const cells: ExpectedCell[] = [];
  for (const completionPath of browserMatrix.completionReflowMatrix.paths) {
    for (const viewport of browserMatrix.completionReflowMatrix.viewports) {
      for (const textScalePercent of browserMatrix.completionReflowMatrix.textScalePercent) {
        cells.push({
          group: "completionReflow",
          cellId: `completion-reflow:${completionPath}:${viewport.width}x${viewport.height}:${textScalePercent}`,
          path: completionPath,
          viewport,
          textScalePercent,
        });
      }
    }
  }
  for (const viewport of browserMatrix.presentationMatrix.viewports) {
    for (const textScalePercent of browserMatrix.presentationMatrix.textScalePercent) {
      for (const contrast of browserMatrix.presentationMatrix.contrast) {
        for (const motionSource of browserMatrix.presentationMatrix.motionSource) {
          cells.push({
            group: "presentation",
            cellId: `presentation:${viewport.width}x${viewport.height}:${textScalePercent}:${contrast}:${motionSource}`,
            viewport,
            textScalePercent,
            contrast,
            motionSource,
          });
        }
      }
    }
  }
  for (const viewport of browserMatrix.safeAreaOneHandMatrix.mobileViewports) {
    for (const textScalePercent of browserMatrix.safeAreaOneHandMatrix.textScalePercent) {
      for (const reach of browserMatrix.safeAreaOneHandMatrix.reach) {
        cells.push({
          group: "safeAreaOneHand",
          cellId: `safe-area:${viewport.width}x${viewport.height}:${textScalePercent}:${reach}`,
          viewport,
          textScalePercent,
          reach,
        });
      }
    }
  }
  for (const transition of browserMatrix.focusTransitions) {
    cells.push({
      group: "focus",
      cellId: `focus:${transition.transitionId}`,
      transitionId: transition.transitionId,
      expectedFocus: transition.expectedFocus,
    });
  }
  for (const witnessId of browserMatrix.liveRegions.announcementWitnesses) {
    cells.push({
      group: "announcements",
      cellId: `announcement:${witnessId}`,
      witnessId,
    });
  }
  cells.sort((left, right) => left.cellId.localeCompare(right.cellId));
  if (cells.length !== 139 || new Set(cells.map(({ cellId }) => cellId)).size !== 139) {
    fail("fixture does not close over exactly 139 unique browser cells");
  }
  return Object.freeze(cells.map((cell) => Object.freeze(cell)));
}

export function expectedRunnerBrowserMatrixCellIds(fixture: any): readonly string[] {
  return Object.freeze(expectedCells(fixture).map(({ cellId }) => cellId));
}

function expectedPathActivations(pathId: string): number {
  switch (pathId) {
    case "automatic-assist":
      return 0;
    case "semantic-assist":
      return 10;
    case "manual-keyboard":
    case "manual-buttons":
    case "manual-swipe":
      return 1;
    default:
      fail(`unsupported completion path ${pathId}`);
  }
}

function expectedFocusSelector(transitionId: string): string {
  const selectors: Readonly<Record<string, string>> = Object.freeze({
    "entry-to-start": "#runner-start-button",
    "start-to-persistent-runner": "#runner-user-pause-button",
    "semantic-prompt-open": "[data-runner-semantic-lane=\"0\"]",
    "semantic-choice-submit": "#runner-status-heading",
    "user-pause-resume": "#runner-user-pause-button",
    "visibility-pause-resume": "#runner-visibility-resume-button",
    "focus-interruption-resume": "#runner-focus-resume-button",
    "modal-open": "[data-runner-remap=\"lane-up\"]",
    "modal-close": "[data-runner-configure-bindings]",
    "completion": "#runner-completion-heading",
  });
  return selectors[transitionId] ?? fail(`unsupported focus transition ${transitionId}`);
}

function expectedPauseSummary(transitionId: string): string {
  const summaries: Readonly<Record<string, string>> = Object.freeze({
    "user-pause-resume": "paused by you",
    "visibility-pause-resume": "page hidden",
    "focus-interruption-resume": "window focus interrupted",
    "modal-open": "dialog open",
  });
  return summaries[transitionId] ?? "";
}

function validateRectangle(value: unknown, label: string): RectangleObservation {
  assertExactKeys(value, ["top", "right", "bottom", "left", "width", "height"], label);
  for (const key of ["top", "right", "bottom", "left", "width", "height"] as const) {
    finiteNumber(value[key], `${label}.${key}`);
  }
  const width = finiteNumber(value.width, `${label}.width`);
  const height = finiteNumber(value.height, `${label}.height`);
  const top = finiteNumber(value.top, `${label}.top`);
  const right = finiteNumber(value.right, `${label}.right`);
  const bottom = finiteNumber(value.bottom, `${label}.bottom`);
  const left = finiteNumber(value.left, `${label}.left`);
  if (
    width < 0 || height < 0 || right < left || bottom < top ||
    Math.abs(width - (right - left)) > 0.002 ||
    Math.abs(height - (bottom - top)) > 0.002
  ) fail(`${label} edges and dimensions are inconsistent`);
  return value as unknown as RectangleObservation;
}

function validateCompletionCell(raw: Record<string, unknown>, expected: ExpectedCell): void {
  assertExactKeys(raw, [
    "group", "cellId", "path", "viewport", "textScalePercent", "observations", "thresholds",
  ], expected.cellId);
  if (
    raw.group !== "completionReflow" || raw.cellId !== expected.cellId ||
    raw.path !== expected.path || raw.textScalePercent !== expected.textScalePercent
  ) fail(`${expected.cellId} dimensions differ from the fixture`);
  exactViewport(raw.viewport, expected.viewport!, `${expected.cellId}.viewport`);
  assertExactKeys(raw.thresholds, [
    "requiredRunStatus", "requiredStartActivations", "requiredPathActivations",
    "maximumUnexpectedActivations", "maximumHorizontalOverflowCssPx",
    "maximumClippedTextCssPx", "maximumPlayerControlOverlapCssPx2",
    "maximumPlayerPlayfieldEscapeCssPx", "minimumTargetCssPx",
    "minimumLayoutSampleCount", "maximumLayoutSampleIntervalMilliseconds",
    "minimumLayoutSamplingSpanMilliseconds",
    "lateStateTickMinimum", "allPatternIndexesRequired",
  ], `${expected.cellId}.thresholds`);
  const threshold = raw.thresholds;
  const requiredPathActivations = expectedPathActivations(expected.path!);
  if (
    threshold.requiredRunStatus !== "completed" || threshold.requiredStartActivations !== 1 ||
    threshold.requiredPathActivations !== requiredPathActivations ||
    threshold.maximumUnexpectedActivations !== 0 ||
    threshold.maximumHorizontalOverflowCssPx !== 0 ||
    threshold.maximumClippedTextCssPx !== 0 ||
    threshold.maximumPlayerControlOverlapCssPx2 !== 0 ||
    threshold.maximumPlayerPlayfieldEscapeCssPx !== 0 || threshold.minimumTargetCssPx !== 44 ||
    threshold.minimumLayoutSampleCount !== 300 ||
    threshold.maximumLayoutSampleIntervalMilliseconds !== 100 ||
    threshold.minimumLayoutSamplingSpanMilliseconds !== 59_000 ||
    threshold.lateStateTickMinimum !== 2500 || threshold.allPatternIndexesRequired !== true
  ) fail(`${expected.cellId} thresholds differ from the locked contract`);
  assertExactKeys(raw.observations, [
    "runStatus", "completionHeadingSelector", "completionHeadingVisible", "startActivations",
    "pathActivations", "unexpectedActivations", "activatedSelectors", "startTransition",
    "activationTransitions", "layoutSamples",
    "horizontalOverflowCssPx", "clippedTextCssPx", "playerControlOverlapCssPx2",
    "playerPlayfieldEscapeCssPx",
    "minimumTargetWidthCssPx", "minimumTargetHeightCssPx",
  ], `${expected.cellId}.observations`);
  const observation = raw.observations;
  if (
    observation.runStatus !== threshold.requiredRunStatus ||
    observation.completionHeadingSelector !== "#runner-completion-heading" ||
    observation.completionHeadingVisible !== true
  ) fail(`${expected.cellId} did not reach visible completion`);
  const startActivations = nonNegativeInteger(observation.startActivations, `${expected.cellId}.startActivations`);
  const pathActivations = nonNegativeInteger(observation.pathActivations, `${expected.cellId}.pathActivations`);
  const unexpected = nonNegativeInteger(observation.unexpectedActivations, `${expected.cellId}.unexpectedActivations`);
  if (startActivations !== 1 || pathActivations !== requiredPathActivations || unexpected !== 0) {
    fail(`${expected.cellId} activation observations differ from the exact path contract`);
  }
  if (!Array.isArray(observation.activatedSelectors)) {
    fail(`${expected.cellId} activated selector log is absent`);
  }
  for (const [index, selector] of observation.activatedSelectors.entries()) {
    nonEmptyString(selector, `${expected.cellId}.activatedSelectors[${index}]`);
  }
  const expectedPathSelector = expected.path === "manual-keyboard"
    ? "keyboard:ArrowUp"
    : expected.path === "manual-buttons"
      ? '[data-runner-lane-command="lane-up"]'
      : expected.path === "manual-swipe"
        ? "[data-runner-play-surface]:swipe-up"
        : expected.path === "semantic-assist" ? '[data-runner-semantic-lane="0"]' : null;
  const derivedStartActivations = observation.activatedSelectors.filter(
    (selector) => selector === "#runner-start-button",
  ).length;
  const derivedPathActivations = expectedPathSelector === null
    ? 0
    : observation.activatedSelectors.filter((selector) => selector === expectedPathSelector).length;
  const derivedUnexpectedActivations = observation.activatedSelectors.length -
    derivedStartActivations - derivedPathActivations;
  if (
    observation.activatedSelectors.length !== 1 + requiredPathActivations ||
    observation.activatedSelectors[0] !== "#runner-start-button" ||
    startActivations !== derivedStartActivations ||
    pathActivations !== derivedPathActivations ||
    unexpected !== derivedUnexpectedActivations
  ) fail(`${expected.cellId} activation counts are not derived from the observed action log`);
  assertExactKeys(observation.startTransition, [
    "source", "selector", "beforeSessionStatus", "afterSessionStatus",
    "beforeSimulationTick", "afterSimulationTick", "beforeStartButtonVisible",
    "afterStartButtonVisible", "beforeResolvedEntityIds", "afterResolvedEntityIds",
    "productionStateChanged",
  ], `${expected.cellId}.startTransition`);
  const startTransition = observation.startTransition;
  if (
    startTransition.source !== "production-durable-checkpoint" ||
    startTransition.selector !== "#runner-start-button" ||
    startTransition.beforeSessionStatus !== "awaiting-start" ||
    startTransition.afterSessionStatus !== "running" ||
    startTransition.beforeSimulationTick !== 0 || startTransition.afterSimulationTick !== 0 ||
    startTransition.beforeStartButtonVisible !== true ||
    startTransition.afterStartButtonVisible !== false ||
    !Array.isArray(startTransition.beforeResolvedEntityIds) ||
    startTransition.beforeResolvedEntityIds.length !== 0 ||
    !Array.isArray(startTransition.afterResolvedEntityIds) ||
    startTransition.afterResolvedEntityIds.length !== 1 ||
    !/^entity-[0-9a-f]{16}$/.test(String(startTransition.afterResolvedEntityIds[0])) ||
    startTransition.productionStateChanged !== true
  ) fail(`${expected.cellId} does not prove the production start-marker transition`);
  if (
    !Array.isArray(observation.activationTransitions) ||
    observation.activationTransitions.length !== pathActivations
  ) fail(`${expected.cellId} activation transitions do not match the measured path actions`);
  for (const [index, transition] of observation.activationTransitions.entries()) {
    assertExactKeys(transition, [
      "selector", "beforeLaneSummary", "afterLaneSummary", "beforeSemanticPromptVisible",
      "afterSemanticPromptVisible", "productionStateChanged",
    ], `${expected.cellId}.activationTransitions[${index}]`);
    if (
      transition.selector !== expectedPathSelector ||
      observation.activatedSelectors[startActivations + index] !== transition.selector ||
      transition.productionStateChanged !== true ||
      typeof transition.beforeLaneSummary !== "string" ||
      typeof transition.afterLaneSummary !== "string" ||
      typeof transition.beforeSemanticPromptVisible !== "boolean" ||
      typeof transition.afterSemanticPromptVisible !== "boolean" ||
      (expected.path?.startsWith("manual-") &&
        (transition.beforeLaneSummary !== "Middle lane" ||
          transition.afterLaneSummary !== "Top lane")) ||
      (expected.path === "semantic-assist" &&
        (transition.beforeSemanticPromptVisible !== true ||
          transition.afterSemanticPromptVisible !== false))
    ) fail(`${expected.cellId}.activationTransitions[${index}] is not bound to production state`);
  }
  const rawLayoutSamples = observation.layoutSamples;
  if (
    !Array.isArray(rawLayoutSamples) ||
    rawLayoutSamples.length < 300
  ) fail(`${expected.cellId} lacks complete-through layout sampling`);
  const layoutSamples: LayoutSampleObservation[] = [];
  let completedLifecycleObserved = false;
  let settlingLifecycleObserved = false;
  rawLayoutSamples.forEach((sample, index) => {
    const label = `${expected.cellId}.layoutSamples[${index}]`;
    assertExactKeys(sample, [
      "sequence", "monotonicMilliseconds", "simulationTick", "patternIndex",
      "resolvedEntityCount", "motionKind", "semanticPromptVisible", "visibleWarningCount",
      "visiblePlayerCount", "visiblePlayfieldCount", "visibleControlClusterCount",
      "visibleInteractiveTargetCount", "runStatus", "stagePhase",
      "horizontalOverflowCssPx", "clippedTextCssPx", "playerControlOverlapCssPx2",
      "playerPlayfieldEscapeCssPx", "minimumTargetWidthCssPx", "minimumTargetHeightCssPx",
    ], label);
    const simulationTick = nonNegativeInteger(sample.simulationTick, `${label}.simulationTick`);
    const patternIndex = nonNegativeInteger(sample.patternIndex, `${label}.patternIndex`);
    const resolvedEntityCount = nonNegativeInteger(
      sample.resolvedEntityCount,
      `${label}.resolvedEntityCount`,
    );
    const visibleWarningCount = nonNegativeInteger(
      sample.visibleWarningCount,
      `${label}.visibleWarningCount`,
    );
    const visiblePlayerCount = nonNegativeInteger(
      sample.visiblePlayerCount,
      `${label}.visiblePlayerCount`,
    );
    const visiblePlayfieldCount = nonNegativeInteger(
      sample.visiblePlayfieldCount,
      `${label}.visiblePlayfieldCount`,
    );
    const visibleControlClusterCount = nonNegativeInteger(
      sample.visibleControlClusterCount,
      `${label}.visibleControlClusterCount`,
    );
    const visibleInteractiveTargetCount = nonNegativeInteger(
      sample.visibleInteractiveTargetCount,
      `${label}.visibleInteractiveTargetCount`,
    );
    const runStatus = String(sample.runStatus);
    const stagePhase = String(sample.stagePhase);
    const activeLifecycle = runStatus === "active" && stagePhase === "active" &&
      simulationTick < 3000 && patternIndex <= 10 &&
      ["idle", "moving"].includes(String(sample.motionKind));
    const settlingLifecycle = runStatus === "active" && stagePhase === "settling" &&
      simulationTick === 3000 && patternIndex === 11 && sample.motionKind === "idle";
    const completedLifecycle = runStatus === "completed" && stagePhase === "complete" &&
      simulationTick === 3000 && patternIndex === 11 && resolvedEntityCount === 0 &&
      sample.motionKind === "none";
    if (
      nonNegativeInteger(sample.sequence, `${label}.sequence`) !== index ||
      nonNegativeNumber(sample.monotonicMilliseconds, `${label}.monotonicMilliseconds`) < 0 ||
      simulationTick > 3000 || patternIndex > 11 ||
      !["idle", "moving", "none"].includes(String(sample.motionKind)) ||
      typeof sample.semanticPromptVisible !== "boolean" ||
      visibleWarningCount > 3 ||
      visiblePlayerCount > 1 || visiblePlayfieldCount > 1 ||
      visibleControlClusterCount > 1 || visibleInteractiveTargetCount > 16 ||
      (!activeLifecycle && !settlingLifecycle && !completedLifecycle)
    ) fail(`${label} lifecycle provenance is malformed`);
    for (const key of [
      "horizontalOverflowCssPx", "clippedTextCssPx", "playerControlOverlapCssPx2",
      "playerPlayfieldEscapeCssPx",
    ] as const) nonNegativeNumber(sample[key], `${label}.${key}`);
    const minimumTargetWidthCssPx = nonNegativeNumber(
      sample.minimumTargetWidthCssPx,
      `${label}.minimumTargetWidthCssPx`,
    );
    const minimumTargetHeightCssPx = nonNegativeNumber(
      sample.minimumTargetHeightCssPx,
      `${label}.minimumTargetHeightCssPx`,
    );
    if (
      (visibleInteractiveTargetCount === 0 &&
        (minimumTargetWidthCssPx !== 0 || minimumTargetHeightCssPx !== 0)) ||
      (visibleInteractiveTargetCount > 0 &&
        (minimumTargetWidthCssPx <= 0 || minimumTargetHeightCssPx <= 0))
    ) fail(`${label} target-size provenance is malformed`);
    const typedSample = sample as unknown as LayoutSampleObservation;
    const previous = layoutSamples.at(-1);
    const monotonicDelta = previous === undefined
      ? null
      : typedSample.monotonicMilliseconds - previous.monotonicMilliseconds;
    const allowedTerminalDuplicate = previous !== undefined &&
      index === rawLayoutSamples.length - 1 &&
      previous.runStatus === "completed" && typedSample.runStatus === "completed" &&
      monotonicDelta === 0;
    if (
      previous !== undefined &&
      (typedSample.simulationTick < previous.simulationTick ||
        typedSample.simulationTick - previous.simulationTick > 5 ||
        monotonicDelta! < 0 || monotonicDelta! > 100 ||
        (monotonicDelta === 0 && !allowedTerminalDuplicate))
    ) {
      fail(
        `${label} skipped or reversed an active layout interval ` +
          `(previousTick=${previous?.simulationTick ?? "none"}, ` +
          `currentTick=${typedSample.simulationTick}, ` +
          `previousMilliseconds=${previous?.monotonicMilliseconds ?? "none"}, ` +
          `currentMilliseconds=${typedSample.monotonicMilliseconds}, ` +
          `deltaMilliseconds=${monotonicDelta ?? "none"}, maximumMilliseconds=100)`,
      );
    }
    if (completedLifecycleObserved && typedSample.runStatus !== "completed") {
      fail(`${label} reverted from the completed lifecycle`);
    }
    if (
      settlingLifecycleObserved &&
      !(typedSample.runStatus === "completed" && typedSample.stagePhase === "complete")
    ) fail(`${label} reverted from the settling lifecycle`);
    if (settlingLifecycle) {
      if (settlingLifecycleObserved) fail(`${label} duplicated the settling lifecycle`);
      settlingLifecycleObserved = true;
    }
    if (typedSample.runStatus === "completed") completedLifecycleObserved = true;
    if (
      typedSample.runStatus === "active" &&
      (typedSample.visiblePlayerCount !== 1 || typedSample.visiblePlayfieldCount !== 1 ||
        (typedSample.stagePhase === "active" && typedSample.visibleInteractiveTargetCount < 1) ||
        (typedSample.stagePhase === "active" && expected.path?.startsWith("manual-") &&
          typedSample.visibleControlClusterCount !== 1))
    ) fail(`${label} omitted required active runner UI`);
    if (
      typedSample.stagePhase === "settling" &&
      (typedSample.semanticPromptVisible || typedSample.visibleWarningCount !== 0)
    ) fail(`${label} retained stale settling guidance`);
    if (
      typedSample.runStatus === "completed" &&
      (typedSample.visiblePlayerCount !== 0 || typedSample.visiblePlayfieldCount !== 1 ||
        typedSample.visibleControlClusterCount !== 0 ||
        typedSample.visibleInteractiveTargetCount < 1 || typedSample.semanticPromptVisible ||
        typedSample.visibleWarningCount !== 0)
    ) fail(`${label} exposed malformed completion UI`);
    layoutSamples.push(typedSample);
  });
  const observedSamplingSpanMilliseconds =
    layoutSamples.at(-1)!.monotonicMilliseconds - layoutSamples[0]!.monotonicMilliseconds;
  if (observedSamplingSpanMilliseconds < threshold.minimumLayoutSamplingSpanMilliseconds) {
    fail(`${expected.cellId} layout sampling did not span the complete run`);
  }
  const patternIndexes = new Set(layoutSamples.map(({ patternIndex }) => patternIndex));
  if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((index) => !patternIndexes.has(index))) {
    fail(`${expected.cellId} did not sample every runner pattern`);
  }
  const lastSample = layoutSamples.at(-1)!;
  if (
    layoutSamples[0]!.simulationTick > 5 || lastSample.simulationTick !== 3000 ||
    lastSample.runStatus !== "completed" ||
    !layoutSamples.some(({ simulationTick }) => simulationTick >= 2500) ||
    !layoutSamples.some(({ motionKind }) => motionKind === "moving") ||
    !layoutSamples.some(({ visibleWarningCount }) => visibleWarningCount > 0)
  ) fail(`${expected.cellId} lacks early, moving, warning, late, or terminal layout coverage`);
  if (expected.path === "semantic-assist") {
    const promptedPatterns = new Set(layoutSamples
      .filter(({ semanticPromptVisible }) => semanticPromptVisible)
      .map(({ patternIndex }) => patternIndex));
    if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((index) => !promptedPatterns.has(index))) {
      fail(`${expected.cellId} did not sample all ten Semantic prompts`);
    }
  } else if (layoutSamples.some(({ semanticPromptVisible }) => semanticPromptVisible)) {
    fail(`${expected.cellId} exposed a Semantic prompt on a non-Semantic path`);
  }
  const maximum = (key: keyof LayoutMeasurements): number =>
    Math.max(...layoutSamples.map((sample) => sample[key]));
  const targetSamples = layoutSamples.filter(({ visibleInteractiveTargetCount }) =>
    visibleInteractiveTargetCount > 0);
  if (targetSamples.length === 0) fail(`${expected.cellId} never exposed an interactive target`);
  const minimum = (key: keyof LayoutMeasurements): number =>
    Math.min(...targetSamples.map((sample) => sample[key]));
  if (
    observation.horizontalOverflowCssPx !== maximum("horizontalOverflowCssPx") ||
    observation.clippedTextCssPx !== maximum("clippedTextCssPx") ||
    observation.playerControlOverlapCssPx2 !== maximum("playerControlOverlapCssPx2") ||
    observation.playerPlayfieldEscapeCssPx !== maximum("playerPlayfieldEscapeCssPx") ||
    observation.minimumTargetWidthCssPx !== minimum("minimumTargetWidthCssPx") ||
    observation.minimumTargetHeightCssPx !== minimum("minimumTargetHeightCssPx")
  ) fail(`${expected.cellId} summary is not derived from its complete layout samples`);
  if (
    nonNegativeNumber(observation.horizontalOverflowCssPx, `${expected.cellId}.horizontalOverflowCssPx`) > 0 ||
    nonNegativeNumber(observation.clippedTextCssPx, `${expected.cellId}.clippedTextCssPx`) > 0 ||
    nonNegativeNumber(observation.playerControlOverlapCssPx2, `${expected.cellId}.playerControlOverlapCssPx2`) > 0 ||
    nonNegativeNumber(observation.playerPlayfieldEscapeCssPx, `${expected.cellId}.playerPlayfieldEscapeCssPx`) > 0 ||
    nonNegativeNumber(observation.minimumTargetWidthCssPx, `${expected.cellId}.minimumTargetWidthCssPx`) < 44 ||
    nonNegativeNumber(observation.minimumTargetHeightCssPx, `${expected.cellId}.minimumTargetHeightCssPx`) < 44
  ) fail(`${expected.cellId} failed reflow, overlap, or target-size thresholds`);
}

function validateSemanticTree(value: unknown, label: string): SemanticTreeObservation {
  assertExactKeys(value, [
    "runnerRegionElement", "runnerRegionAccessibleName", "summaryElement", "summaryTermCount",
    "summaryDescriptionCount", "scoreOutputCount", "scoreOutputNames", "progressElement",
    "progressAccessibleName", "playfieldAriaHidden", "playfieldFocusableDescendantCount",
    "decisionElement", "decisionLegendPresent", "semanticChoiceCount",
    "semanticChoiceLabelsContainUrgency", "laneSummaryAriaLive",
    "statusRegionCount", "statusRegionRole", "statusRegionPoliteness", "statusRegionAtomic",
    "alertRegionCount", "alertRegionRole", "alertRegionPoliteness", "alertRegionAtomic",
  ], label);
  if (
    value.runnerRegionElement !== "SECTION" || value.runnerRegionAccessibleName !== "Runner status" ||
    value.summaryElement !== "DL" || value.summaryTermCount !== 4 ||
    value.summaryDescriptionCount !== 4 || value.scoreOutputCount !== 3 ||
    value.progressElement !== "PROGRESS" || value.progressAccessibleName !== "Runner laboratory progress" ||
    value.playfieldAriaHidden !== "true" || value.playfieldFocusableDescendantCount !== 0 ||
    value.decisionElement !== "FIELDSET" || value.decisionLegendPresent !== true ||
    value.semanticChoiceCount !== 3 || value.semanticChoiceLabelsContainUrgency !== true ||
    value.laneSummaryAriaLive !== "" || value.statusRegionCount !== 1 ||
    value.statusRegionRole !== "status" || value.statusRegionPoliteness !== "polite" ||
    value.statusRegionAtomic !== "true" || value.alertRegionCount !== 1 ||
    value.alertRegionRole !== "alert" || value.alertRegionPoliteness !== "assertive" ||
    value.alertRegionAtomic !== "true"
  ) fail(`${label} does not expose the locked semantic structure`);
  const scoreOutputNames = value.scoreOutputNames;
  if (
    !Array.isArray(scoreOutputNames) ||
    scoreOutputNames.length !== 3 ||
    ["Health", "Happiness", "Financial security"].some((name, index) =>
      typeof scoreOutputNames[index] !== "string" ||
      !scoreOutputNames[index]!.startsWith(`${name}:`))
  ) fail(`${label} score output names are incomplete or out of order`);
  return value as unknown as SemanticTreeObservation;
}

function validateAccessibilityTree(
  value: unknown,
  label: string,
): AccessibilityTreeObservation {
  assertExactKeys(value, [
    "provenance", "playfieldTraversal", "runnerRegion", "scoreOutputs",
    "semanticChoices", "playfield", "movingEntityDomCount", "movingEntities",
    "playfieldAxDescendantCount", "unexpectedExposedPlayfieldNodeCount",
  ], label);
  if (
    value.provenance !== "chromium-cdp-accessibility-tree-v1" ||
    value.playfieldTraversal !== "chromium-cdp-full-ax-subtree-v1"
  ) {
    fail(`${label} lacks Chromium accessibility-tree provenance`);
  }
  const node = (
    candidate: unknown,
    nodeLabel: string,
  ): AccessibilityNodeObservation => {
    assertExactKeys(candidate, ["selector", "role", "name", "ignored"], nodeLabel);
    nonEmptyString(candidate.selector, `${nodeLabel}.selector`);
    if (
      typeof candidate.role !== "string" || typeof candidate.name !== "string" ||
      typeof candidate.ignored !== "boolean"
    ) fail(`${nodeLabel} accessibility node is malformed`);
    return candidate as unknown as AccessibilityNodeObservation;
  };
  const runner = node(value.runnerRegion, `${label}.runnerRegion`);
  if (runner.ignored || runner.role !== "region" || runner.name !== "Runner status") {
    fail(`${label} runner region has the wrong computed role or name`);
  }
  if (!Array.isArray(value.scoreOutputs) || value.scoreOutputs.length !== 3) {
    fail(`${label} does not contain exactly three accessibility-tree score outputs`);
  }
  const scores = value.scoreOutputs.map((candidate, index) =>
    node(candidate, `${label}.scoreOutputs[${index}]`));
  for (const [index, expectedName] of [
    "Health:", "Happiness:", "Financial security:",
  ].entries()) {
    const score = scores[index]!;
    if (score.ignored || score.role !== "status" || !score.name.startsWith(expectedName)) {
      fail(`${label} score output is hidden or has the wrong computed role/name`);
    }
  }
  if (!Array.isArray(value.semanticChoices) || value.semanticChoices.length !== 3) {
    fail(`${label} does not contain exactly three accessibility-tree Semantic choices`);
  }
  const choices = value.semanticChoices.map((candidate, index) =>
    node(candidate, `${label}.semanticChoices[${index}]`));
  if (choices.some((choice) =>
    choice.ignored || choice.role !== "button" || !/Urgency:.*(?:ticks|ms)/i.test(choice.name))) {
    fail(`${label} Semantic choice is hidden or has the wrong computed role/name`);
  }
  const playfield = node(value.playfield, `${label}.playfield`);
  if (!playfield.ignored) fail(`${label} exposes the visual playfield in the accessibility tree`);
  const movingEntityDomCount = nonNegativeInteger(
    value.movingEntityDomCount,
    `${label}.movingEntityDomCount`,
  );
  if (
    movingEntityDomCount < 1 || !Array.isArray(value.movingEntities) ||
    value.movingEntities.length !== movingEntityDomCount
  ) fail(`${label} lacks a non-vacuous moving-entity accessibility witness`);
  const movingEntities = value.movingEntities.map((candidate, index) =>
    node(candidate, `${label}.movingEntities[${index}]`));
  nonNegativeInteger(
    value.playfieldAxDescendantCount,
    `${label}.playfieldAxDescendantCount`,
  );
  nonNegativeInteger(
    value.unexpectedExposedPlayfieldNodeCount,
    `${label}.unexpectedExposedPlayfieldNodeCount`,
  );
  if (
    movingEntities.some(({ ignored }) => !ignored) ||
    value.unexpectedExposedPlayfieldNodeCount !== 0
  ) fail(`${label} exposes moving visual gameplay nodes in the accessibility tree`);
  return value as unknown as AccessibilityTreeObservation;
}

function validatePresentationCell(raw: Record<string, unknown>, expected: ExpectedCell): void {
  assertExactKeys(raw, [
    "group", "cellId", "viewport", "textScalePercent", "contrast", "motionSource",
    "observations", "thresholds",
  ], expected.cellId);
  if (
    raw.group !== "presentation" || raw.cellId !== expected.cellId ||
    raw.textScalePercent !== expected.textScalePercent || raw.contrast !== expected.contrast ||
    raw.motionSource !== expected.motionSource
  ) fail(`${expected.cellId} dimensions differ from the fixture`);
  exactViewport(raw.viewport, expected.viewport!, `${expected.cellId}.viewport`);
  assertExactKeys(raw.thresholds, [
    "maximumHorizontalOverflowCssPx", "maximumClippedTextCssPx", "minimumTargetCssPx",
    "minimumNormalTextContrastRatio", "minimumLargeTextContrastRatio", "minimumNonTextContrastRatio",
    "forcedColorsTreatmentRequired", "effectiveReducedMotionRequired",
    "playfieldExcludedFromAccessibilityTree", "scoreOutputCount", "summaryFieldCount",
    "semanticChoiceCount",
  ], `${expected.cellId}.thresholds`);
  const threshold = raw.thresholds;
  const reducedRequired = expected.motionSource !== "normal";
  const forcedRequired = expected.contrast === "forced-colors";
  if (
    threshold.maximumHorizontalOverflowCssPx !== 0 || threshold.maximumClippedTextCssPx !== 0 ||
    threshold.minimumTargetCssPx !== 44 || threshold.minimumNormalTextContrastRatio !== 4.5 ||
    threshold.minimumLargeTextContrastRatio !== 4.5 || threshold.minimumNonTextContrastRatio !== 3 ||
    threshold.forcedColorsTreatmentRequired !== forcedRequired ||
    threshold.effectiveReducedMotionRequired !== reducedRequired ||
    threshold.playfieldExcludedFromAccessibilityTree !== true || threshold.scoreOutputCount !== 3 ||
    threshold.summaryFieldCount !== 4 || threshold.semanticChoiceCount !== 3
  ) fail(`${expected.cellId} thresholds differ from the locked contract`);
  assertExactKeys(raw.observations, [
    "horizontalOverflowCssPx", "clippedTextCssPx", "minimumTargetWidthCssPx",
    "minimumTargetHeightCssPx", "normalTextContrastRatio", "largeTextContrastRatio",
    "nonTextContrastRatio", "contrastMeasurements", "contrastCategories",
    "worstNormalTextSample", "worstLargeTextSample", "worstNonTextSample",
    "forcedColorsActive", "forcedColorAdjust", "effectiveContrastMode", "effectiveTextScale",
    "effectiveTextScaleRatio",
    "effectiveReducedMotion", "entityFieldDisplayed", "worldTransform", "worldAnimationName",
    "playerAnimationName",
    "semanticTree", "accessibilityTree",
  ], `${expected.cellId}.observations`);
  const observation = raw.observations;
  const expectedTextScale = expected.textScalePercent! / 100;
  const expectedContrastMode = expected.contrast === "high" ? "high" : "standard";
  if (
    observation.effectiveContrastMode !== expectedContrastMode ||
    observation.effectiveTextScale !== String(expectedTextScale) ||
    finiteNumber(observation.effectiveTextScaleRatio, `${expected.cellId}.effectiveTextScaleRatio`) !==
      expectedTextScale
  ) fail(`${expected.cellId} did not activate its requested visual options`);
  const requiredContrastCategories = [
    "text", "control", "focus", "warning", "status", "alert", "dialog", "completion",
    "fault", "player", "entity", "lane", "progress",
  ] as const;
  if (!Array.isArray(observation.contrastMeasurements) || observation.contrastMeasurements.length === 0) {
    fail(`${expected.cellId} contrast measurements are absent`);
  }
  const contrastMeasurements = observation.contrastMeasurements.map((measurement, index) => {
    assertExactKeys(measurement, [
      "category", "state", "kind", "selector", "foregroundColor", "backgroundColor",
      "contrastRatio", "variant", "sampleMotionSource", "sampleMethod", "samplePoints", "stateProof",
    ], `${expected.cellId}.contrastMeasurements[${index}]`);
    if (!requiredContrastCategories.includes(measurement.category as any)) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] has an unsupported category`);
    }
    if (!["running", "dialog", "completion", "fault"].includes(String(measurement.state))) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] has an unsupported state`);
    }
    if (!["normal-text", "large-text", "non-text"].includes(String(measurement.kind))) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] has an unsupported kind`);
    }
    if (measurement.variant !== null && typeof measurement.variant !== "string") {
      fail(`${expected.cellId}.contrastMeasurements[${index}].variant is invalid`);
    }
    if (!["normal", "saved-reduced", "os-reduced"].includes(String(measurement.sampleMotionSource))) {
      fail(`${expected.cellId}.contrastMeasurements[${index}].sampleMotionSource is invalid`);
    }
    const renderedGraphic = measurement.kind === "non-text" &&
      ["player", "entity", "lane", "progress"].includes(String(measurement.category));
    if (measurement.sampleMethod !== (renderedGraphic ? "rendered-pixel-pair" : "computed-style")) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] has the wrong measurement source`);
    }
    if (renderedGraphic) {
      assertExactKeys(measurement.samplePoints, ["foreground", "background"],
        `${expected.cellId}.contrastMeasurements[${index}].samplePoints`);
      const samplePoints = measurement.samplePoints;
      for (const role of ["foreground", "background"] as const) {
        assertExactKeys(samplePoints[role], ["x", "y"],
          `${expected.cellId}.contrastMeasurements[${index}].samplePoints.${role}`);
        nonNegativeInteger(samplePoints[role].x,
          `${expected.cellId}.contrastMeasurements[${index}].samplePoints.${role}.x`);
        nonNegativeInteger(samplePoints[role].y,
          `${expected.cellId}.contrastMeasurements[${index}].samplePoints.${role}.y`);
      }
      const foregroundPoint = samplePoints.foreground as Record<string, unknown>;
      const backgroundPoint = samplePoints.background as Record<string, unknown>;
      if (
        foregroundPoint.x === backgroundPoint.x && foregroundPoint.y === backgroundPoint.y
      ) fail(`${expected.cellId}.contrastMeasurements[${index}] reused one rendered pixel`);
    } else if (measurement.samplePoints !== null) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] fabricated pixel coordinates`);
    }
    if (
      measurement.category === "entity"
        ? measurement.sampleMotionSource !== "normal"
        : measurement.sampleMotionSource !== expected.motionSource
    ) fail(`${expected.cellId}.contrastMeasurements[${index}] obscures its motion provenance`);
    assertExactKeys(measurement.stateProof, [
      "effectiveContrastMode", "forcedColorsActive", "effectiveTextScaleRatio",
      "effectiveReducedMotion", "horizontalOverflowCssPx", "clippedTextCssPx",
      "minimumTargetWidthCssPx", "minimumTargetHeightCssPx",
    ], `${expected.cellId}.contrastMeasurements[${index}].stateProof`);
    const stateProof = measurement.stateProof;
    if (
      stateProof.effectiveContrastMode !== expectedContrastMode ||
      stateProof.forcedColorsActive !== forcedRequired ||
      finiteNumber(
        stateProof.effectiveTextScaleRatio,
        `${expected.cellId}.contrastMeasurements[${index}].stateProof.effectiveTextScaleRatio`,
      ) !== expectedTextScale ||
      stateProof.effectiveReducedMotion !== (measurement.sampleMotionSource !== "normal") ||
      nonNegativeNumber(
        stateProof.horizontalOverflowCssPx,
        `${expected.cellId}.contrastMeasurements[${index}].stateProof.horizontalOverflowCssPx`,
      ) > 0 ||
      nonNegativeNumber(
        stateProof.clippedTextCssPx,
        `${expected.cellId}.contrastMeasurements[${index}].stateProof.clippedTextCssPx`,
      ) > 0 ||
      nonNegativeNumber(
        stateProof.minimumTargetWidthCssPx,
        `${expected.cellId}.contrastMeasurements[${index}].stateProof.minimumTargetWidthCssPx`,
      ) < 44 ||
      nonNegativeNumber(
        stateProof.minimumTargetHeightCssPx,
        `${expected.cellId}.contrastMeasurements[${index}].stateProof.minimumTargetHeightCssPx`,
      ) < 44
    ) fail(`${expected.cellId}.contrastMeasurements[${index}] is not bound to its effective state layout`);
    nonEmptyString(measurement.selector, `${expected.cellId}.contrastMeasurements[${index}].selector`);
    const foregroundColor = nonEmptyString(
      measurement.foregroundColor,
      `${expected.cellId}.contrastMeasurements[${index}].foregroundColor`,
    );
    const backgroundColor = nonEmptyString(
      measurement.backgroundColor,
      `${expected.cellId}.contrastMeasurements[${index}].backgroundColor`,
    );
    const ratio = nonNegativeNumber(
      measurement.contrastRatio,
      `${expected.cellId}.contrastMeasurements[${index}].contrastRatio`,
    );
    const recomputedRatio = Math.round(measuredContrastRatio(
      foregroundColor,
      backgroundColor,
    ) * 1_000) / 1_000;
    if (ratio !== recomputedRatio) {
      fail(`${expected.cellId}.contrastMeasurements[${index}] ratio is not derived from its colors`);
    }
    const minimum = measurement.kind === "non-text" ? 3 : 4.5;
    if (ratio < minimum) fail(`${expected.cellId}.contrastMeasurements[${index}] failed contrast`);
    return measurement as unknown as ContrastMeasurement;
  });
  const categories = exactStringArray(
    observation.contrastCategories,
    `${expected.cellId}.contrastCategories`,
  );
  if (!sameStrings(categories, requiredContrastCategories)) {
    fail(`${expected.cellId} did not cover every required visible contrast category`);
  }
  for (const category of requiredContrastCategories) {
    if (!contrastMeasurements.some((measurement) => measurement.category === category)) {
      fail(`${expected.cellId} has declarative contrast coverage without a ${category} measurement`);
    }
  }
  for (const [category, states] of Object.entries({
    text: ["running", "dialog", "completion", "fault"],
    control: ["running", "dialog", "completion", "fault"],
    focus: ["running", "dialog", "completion", "fault"],
    warning: ["running"],
    status: ["running"],
    alert: ["fault"],
    dialog: ["dialog"],
    completion: ["completion"],
    fault: ["fault"],
    player: ["running"],
    entity: ["running"],
    lane: ["running"],
    progress: ["running"],
  })) {
    for (const state of states) {
      if (!contrastMeasurements.some((measurement) =>
        measurement.category === category && measurement.state === state)) {
        fail(`${expected.cellId} omitted the ${category} contrast state ${state}`);
      }
    }
  }
  for (const variant of ["benefit", "hazard", "opportunity"]) {
    if (!contrastMeasurements.some((measurement) =>
      measurement.category === "entity" && measurement.variant === variant)) {
      fail(`${expected.cellId} omitted the ${variant} entity graphic contrast`);
    }
  }
  for (const variant of ["lane-0", "lane-1"]) {
    if (!contrastMeasurements.some((measurement) =>
      measurement.category === "lane" && measurement.variant === variant)) {
      fail(`${expected.cellId} omitted the ${variant} divider contrast`);
    }
  }
  if (!contrastMeasurements.some((measurement) =>
    measurement.category === "progress" && measurement.variant === "value-track" &&
    measurement.sampleMethod === "rendered-pixel-pair")) {
    fail(`${expected.cellId} omitted the rendered progress value-to-track contrast`);
  }
  const worst = (kind: ContrastMeasurement["kind"]): ContrastMeasurement => {
    const candidates = contrastMeasurements.filter((measurement) => measurement.kind === kind);
    if (candidates.length === 0) fail(`${expected.cellId} has no ${kind} contrast measurements`);
    return candidates.reduce((minimum, candidate) =>
      candidate.contrastRatio < minimum.contrastRatio ? candidate : minimum);
  };
  const normalWorst = worst("normal-text");
  const largeWorst = worst("large-text");
  const nonTextWorst = worst("non-text");
  if (
    observation.normalTextContrastRatio !== normalWorst.contrastRatio ||
    observation.largeTextContrastRatio !== largeWorst.contrastRatio ||
    observation.nonTextContrastRatio !== nonTextWorst.contrastRatio ||
    observation.worstNormalTextSample !== normalWorst.selector ||
    observation.worstLargeTextSample !== largeWorst.selector ||
    observation.worstNonTextSample !== nonTextWorst.selector
  ) fail(`${expected.cellId} did not record the true worst contrast samples`);
  if (
    nonNegativeNumber(observation.horizontalOverflowCssPx, `${expected.cellId}.horizontalOverflowCssPx`) > 0 ||
    nonNegativeNumber(observation.clippedTextCssPx, `${expected.cellId}.clippedTextCssPx`) > 0 ||
    nonNegativeNumber(observation.minimumTargetWidthCssPx, `${expected.cellId}.minimumTargetWidthCssPx`) < 44 ||
    nonNegativeNumber(observation.minimumTargetHeightCssPx, `${expected.cellId}.minimumTargetHeightCssPx`) < 44 ||
    nonNegativeNumber(observation.normalTextContrastRatio, `${expected.cellId}.normalTextContrastRatio`) < 4.5 ||
    nonNegativeNumber(observation.largeTextContrastRatio, `${expected.cellId}.largeTextContrastRatio`) < 4.5 ||
    nonNegativeNumber(observation.nonTextContrastRatio, `${expected.cellId}.nonTextContrastRatio`) < 3
  ) fail(`${expected.cellId} failed presentation measurements`);
  if (
    observation.forcedColorsActive !== forcedRequired ||
    (forcedRequired && observation.forcedColorAdjust !== "auto") ||
    observation.effectiveReducedMotion !== reducedRequired
  ) fail(`${expected.cellId} contrast or reduced-motion state was not actually active`);
  if (observation.entityFieldDisplayed !== !reducedRequired) {
    fail(`${expected.cellId} did not expose the expected static reduced-motion entity treatment`);
  }
  if (reducedRequired) {
    const transform = String(observation.worldTransform);
    if (transform !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(transform)) {
      fail(`${expected.cellId} retained world translation under reduced motion`);
    }
    if (observation.worldAnimationName !== "none" || observation.playerAnimationName !== "none") {
      fail(`${expected.cellId} retained animation under reduced motion`);
    }
  }
  validateSemanticTree(observation.semanticTree, `${expected.cellId}.semanticTree`);
  validateAccessibilityTree(
    observation.accessibilityTree,
    `${expected.cellId}.accessibilityTree`,
  );
}

function validateSafeAreaCell(raw: Record<string, unknown>, expected: ExpectedCell): void {
  assertExactKeys(raw, [
    "group", "cellId", "viewport", "textScalePercent", "reach", "observations", "thresholds",
  ], expected.cellId);
  if (
    raw.group !== "safeAreaOneHand" || raw.cellId !== expected.cellId ||
    raw.textScalePercent !== expected.textScalePercent || raw.reach !== expected.reach
  ) fail(`${expected.cellId} dimensions differ from the fixture`);
  exactViewport(raw.viewport, expected.viewport!, `${expected.cellId}.viewport`);
  assertExactKeys(raw.thresholds, [
    "requiredOrientationCount", "requiredNonzeroSafeAreaSides",
    "requiredClusterCount", "requiredButtonCount", "minimumTargetCssPx",
    "maximumHorizontalOverflowCssPx", "maximumViewportEscapeCssPx",
    "maximumPlayerControlOverlapCssPx2", "requiredClusterPlacement",
    "multiPointerCancellationRecoveryRequired",
  ], `${expected.cellId}.thresholds`);
  const threshold = raw.thresholds;
  if (
    threshold.requiredOrientationCount !== 2 ||
    threshold.requiredNonzeroSafeAreaSides !== 4 ||
    threshold.requiredClusterCount !== 1 || threshold.requiredButtonCount !== 2 ||
    threshold.minimumTargetCssPx !== 44 || threshold.maximumHorizontalOverflowCssPx !== 0 ||
    threshold.maximumViewportEscapeCssPx !== 0 ||
    threshold.maximumPlayerControlOverlapCssPx2 !== 0 ||
    threshold.requiredClusterPlacement !== expected.reach ||
    threshold.multiPointerCancellationRecoveryRequired !== true
  ) fail(`${expected.cellId} thresholds differ from the locked contract`);
  assertExactKeys(raw.observations, [
    "cssEnvironmentSafeAreaSupported", "emulatedSafeAreaInsetsCssPx", "orientations",
    "multiPointerCancellationRecovered", "multiPointerCancellationWitness",
  ], `${expected.cellId}.observations`);
  const observation = raw.observations;
  if (
    observation.cssEnvironmentSafeAreaSupported !== true ||
    observation.multiPointerCancellationRecovered !== true
  ) fail(`${expected.cellId} did not activate the locked safe-area cluster`);
  assertExactKeys(observation.multiPointerCancellationWitness, [
    "laneBefore", "laneAfterCancellation", "laneAfterRecovery", "durableBefore",
    "durableAfterCancellation", "durableAfterRecovery",
  ], `${expected.cellId}.multiPointerCancellationWitness`);
  const pointerWitness = observation.multiPointerCancellationWitness;
  const durableCheckpoint = (
    value: unknown,
    label: string,
  ): DurableLaneCheckpointObservation => {
    assertExactKeys(value, [
      "simulationTick", "motionKind", "currentLane", "targetLane", "inputBuffer",
    ], label);
    nonNegativeInteger(value.simulationTick, `${label}.simulationTick`);
    if (
      !["idle", "moving"].includes(String(value.motionKind)) ||
      ![0, 1, 2].includes(nonNegativeInteger(value.currentLane, `${label}.currentLane`)) ||
      ![0, 1, 2].includes(nonNegativeInteger(value.targetLane, `${label}.targetLane`)) ||
      ![null, "up", "down"].includes(value.inputBuffer as null | string)
    ) fail(`${label} is not a durable production lane checkpoint`);
    return value as unknown as DurableLaneCheckpointObservation;
  };
  const durableBefore = durableCheckpoint(
    pointerWitness.durableBefore,
    `${expected.cellId}.multiPointerCancellationWitness.durableBefore`,
  );
  const durableAfterCancellation = durableCheckpoint(
    pointerWitness.durableAfterCancellation,
    `${expected.cellId}.multiPointerCancellationWitness.durableAfterCancellation`,
  );
  const durableAfterRecovery = durableCheckpoint(
    pointerWitness.durableAfterRecovery,
    `${expected.cellId}.multiPointerCancellationWitness.durableAfterRecovery`,
  );
  if (
    typeof pointerWitness.laneBefore !== "string" ||
    pointerWitness.laneAfterCancellation !== pointerWitness.laneBefore ||
    !/Middle lane/i.test(pointerWitness.laneBefore) ||
    typeof pointerWitness.laneAfterRecovery !== "string" ||
    !/Top lane/i.test(pointerWitness.laneAfterRecovery) ||
    durableBefore.motionKind !== "idle" || durableBefore.currentLane !== 1 ||
    durableBefore.targetLane !== 1 || durableBefore.inputBuffer !== null ||
    durableAfterCancellation.simulationTick <= durableBefore.simulationTick ||
    durableAfterCancellation.motionKind !== "idle" ||
    durableAfterCancellation.currentLane !== durableBefore.currentLane ||
    durableAfterCancellation.targetLane !== durableBefore.targetLane ||
    durableAfterCancellation.inputBuffer !== durableBefore.inputBuffer ||
    durableAfterRecovery.simulationTick <= durableAfterCancellation.simulationTick ||
    durableAfterRecovery.motionKind !== "idle" || durableAfterRecovery.currentLane !== 0 ||
    durableAfterRecovery.targetLane !== 0 || durableAfterRecovery.inputBuffer !== null
  ) fail(`${expected.cellId} did not prove cancel-without-request before swipe recovery`);
  assertExactKeys(
    observation.emulatedSafeAreaInsetsCssPx,
    ["top", "right", "bottom", "left"],
    `${expected.cellId}.emulatedSafeAreaInsetsCssPx`,
  );
  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (
      nonNegativeNumber(
        observation.emulatedSafeAreaInsetsCssPx[side],
        `${expected.cellId}.emulatedSafeAreaInsetsCssPx.${side}`,
      ) !== SAFE_AREA_INSETS_CSS_PX[side]
    ) fail(`${expected.cellId} did not use the audited nonzero safe-area inset`);
  }
  assertExactKeys(
    observation.orientations,
    ["portrait", "landscape"],
    `${expected.cellId}.orientations`,
  );
  const validateOrientation = (
    candidate: unknown,
    orientation: "portrait" | "landscape",
    viewport: RunnerBrowserViewport,
  ): void => {
    const label = `${expected.cellId}.orientations.${orientation}`;
    assertExactKeys(candidate, [
      "orientation", "viewport", "clusterCount", "clusterPlacement",
      "placementControlValue", "placementControlLabel", "viewRect", "playerRect",
      "playfieldRect", "clusterRect", "safeAreaContainerSelector", "buttonRects",
      "visibleInteractiveControlCount", "interactiveControlRects",
      "playerControlOverlapCssPx2", "computedPaddingCssPx",
      "horizontalOverflowCssPx", "viewportEscapeCssPx",
    ], label);
    if (
      candidate.orientation !== orientation || candidate.clusterCount !== 1 ||
      candidate.clusterPlacement !== expected.reach ||
      candidate.placementControlValue !== expected.reach ||
      candidate.safeAreaContainerSelector !== ".col-shell" ||
      typeof candidate.placementControlLabel !== "string" ||
      !candidate.placementControlLabel.toLowerCase().includes(
        expected.reach === "left" ? "right side" : "left side",
      ) ||
      nonNegativeNumber(candidate.horizontalOverflowCssPx, `${label}.horizontalOverflowCssPx`) > 0
    ) fail(`${label} did not retain the authentic one-hand placement`);
    if (nonNegativeNumber(candidate.viewportEscapeCssPx, `${label}.viewportEscapeCssPx`) > 0) {
      fail(`${label} lane controls escaped the viewport`);
    }
    exactViewport(candidate.viewport, viewport, `${label}.viewport`);
    const viewRect = validateRectangle(candidate.viewRect, `${label}.viewRect`);
    const playerRect = validateRectangle(candidate.playerRect, `${label}.playerRect`);
    const playfieldRect = validateRectangle(candidate.playfieldRect, `${label}.playfieldRect`);
    const clusterRect = validateRectangle(candidate.clusterRect, `${label}.clusterRect`);
    if (!Array.isArray(candidate.buttonRects) || candidate.buttonRects.length !== 2) {
      fail(`${label} does not contain exactly two lane-control rectangles`);
    }
    const buttonRects = candidate.buttonRects.map((rectangle, index) =>
      validateRectangle(rectangle, `${label}.buttonRects[${index}]`));
    const interactiveControlCount = nonNegativeInteger(
      candidate.visibleInteractiveControlCount,
      `${label}.visibleInteractiveControlCount`,
    );
    if (
      !Array.isArray(candidate.interactiveControlRects) ||
      candidate.interactiveControlRects.length !== interactiveControlCount ||
      interactiveControlCount < 2
    ) fail(`${label} lacks visible interactive-control geometry`);
    const interactiveControlRects = candidate.interactiveControlRects.map((rectangle, index) =>
      validateRectangle(rectangle, `${label}.interactiveControlRects[${index}]`));
    const overlapArea = (left: RectangleObservation, right: RectangleObservation): number =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const recomputedOverlap = interactiveControlRects.reduce(
      (total, rectangle) => total + overlapArea(playerRect, rectangle),
      0,
    );
    const reportedOverlap = nonNegativeNumber(
      candidate.playerControlOverlapCssPx2,
      `${label}.playerControlOverlapCssPx2`,
    );
    if (Math.abs(reportedOverlap - recomputedOverlap) > 0.002 || reportedOverlap > 0) {
      fail(`${label} player overlaps a visible interactive control`);
    }
    assertExactKeys(
      candidate.computedPaddingCssPx,
      ["top", "right", "bottom", "left"],
      `${label}.computedPaddingCssPx`,
    );
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (
        nonNegativeNumber(
          candidate.computedPaddingCssPx[side],
          `${label}.computedPaddingCssPx.${side}`,
        ) < SAFE_AREA_INSETS_CSS_PX[side]
      ) fail(`${label} did not honor the emulated ${side} safe-area inset`);
    }
    const safeAreaRectangles = [clusterRect, ...buttonRects];
    if (safeAreaRectangles.some((rectangle) =>
      rectangle.top < SAFE_AREA_INSETS_CSS_PX.top ||
      rectangle.right > viewport.width - SAFE_AREA_INSETS_CSS_PX.right ||
      rectangle.bottom > viewport.height - SAFE_AREA_INSETS_CSS_PX.bottom ||
      rectangle.left < SAFE_AREA_INSETS_CSS_PX.left)) {
      fail(`${label} escaped the emulated safe-area bounds`);
    }
    if (
      viewRect.left < 0 || viewRect.right > viewport.width ||
      playerRect.left < playfieldRect.left || playerRect.right > playfieldRect.right ||
      playerRect.top < playfieldRect.top || playerRect.bottom > playfieldRect.bottom ||
      playfieldRect.left < viewRect.left || playfieldRect.right > viewRect.right ||
      playfieldRect.top < viewRect.top || playfieldRect.bottom > viewRect.bottom ||
      clusterRect.left < viewRect.left || clusterRect.right > viewRect.right ||
      clusterRect.top < viewRect.top || clusterRect.bottom > viewRect.bottom ||
      buttonRects.some((rectangle) =>
        rectangle.width < 44 || rectangle.height < 44 ||
        rectangle.left < clusterRect.left || rectangle.right > clusterRect.right ||
        rectangle.top < clusterRect.top || rectangle.bottom > clusterRect.bottom)
    ) fail(`${label} escaped safe geometry or contains an undersized target`);
    const center = (clusterRect.left + clusterRect.right) / 2;
    const half = viewport.width / 2;
    if (
      (expected.reach === "left" && (
        center >= half || clusterRect.right > half ||
        buttonRects.some((rectangle) => rectangle.right > half)
      )) ||
      (expected.reach === "right" && (
        center <= half || clusterRect.left < half ||
        buttonRects.some((rectangle) => rectangle.left < half)
      ))
    ) fail(`${label} cluster is on the wrong one-hand side`);
  };
  validateOrientation(
    observation.orientations.portrait,
    "portrait",
    expected.viewport!,
  );
  validateOrientation(
    observation.orientations.landscape,
    "landscape",
    { width: expected.viewport!.height, height: expected.viewport!.width },
  );
}

function validateFocusCell(raw: Record<string, unknown>, expected: ExpectedCell): void {
  assertExactKeys(raw, [
    "group", "cellId", "transitionId", "expectedFocus", "viewport", "textScalePercent",
    "observations", "thresholds",
  ], expected.cellId);
  if (
    raw.group !== "focus" || raw.cellId !== expected.cellId ||
    raw.transitionId !== expected.transitionId || raw.expectedFocus !== expected.expectedFocus ||
    raw.textScalePercent !== 200
  ) fail(`${expected.cellId} dimensions differ from the fixture`);
  exactViewport(raw.viewport, { width: 320, height: 568 }, `${expected.cellId}.viewport`);
  assertExactKeys(raw.thresholds, [
    "requiredFocusedSelector", "minimumFocusIndicatorWidthCssPx",
    "minimumFocusIndicatorContrastRatio", "visibleFocusIndicatorRequired",
    "maximumFocusedViewportEscapeCssPx", "requiredUnobscuredSamplePoints",
    "requiredUnobscuredIndicatorRingSamplePoints", "maximumIndicatorClippingAncestorCount",
    "modalBackgroundInertRequired", "forwardTabContainmentRequired",
    "backwardTabContainmentRequired", "exactInvokerRestoreRequired",
    "requiredPauseSummary",
  ], `${expected.cellId}.thresholds`);
  const threshold = raw.thresholds;
  const modalOpen = expected.transitionId === "modal-open";
  const modalClose = expected.transitionId === "modal-close";
  const selector = expectedFocusSelector(expected.transitionId!);
  if (
    threshold.requiredFocusedSelector !== selector || threshold.minimumFocusIndicatorWidthCssPx !== 2 ||
    threshold.minimumFocusIndicatorContrastRatio !== 3 ||
    threshold.visibleFocusIndicatorRequired !== true ||
    threshold.maximumFocusedViewportEscapeCssPx !== 0 ||
    threshold.requiredUnobscuredSamplePoints !== 5 ||
    threshold.requiredUnobscuredIndicatorRingSamplePoints !== 4 ||
    threshold.maximumIndicatorClippingAncestorCount !== 0 ||
    threshold.modalBackgroundInertRequired !== modalOpen ||
    threshold.forwardTabContainmentRequired !== modalOpen ||
    threshold.backwardTabContainmentRequired !== modalOpen ||
    threshold.exactInvokerRestoreRequired !== modalClose ||
    threshold.requiredPauseSummary !== expectedPauseSummary(expected.transitionId!)
  ) fail(`${expected.cellId} thresholds differ from the locked contract`);
  assertExactKeys(raw.observations, [
    "actualFocusedSelector", "trace", "effectiveTextScale", "effectiveTextScaleRatio",
    "focusIndicatorStyle", "focusIndicatorWidthCssPx",
    "focusIndicatorContrastRatio", "focusIndicatorVisible", "focusedRect", "focusIndicatorRect",
    "focusedViewportEscapeCssPx", "obstructionSamplePoints", "unobscuredSamplePoints",
    "indicatorRingSamplePoints", "unobscuredIndicatorRingSamplePoints",
    "indicatorClippingAncestorCount",
    "modalBackgroundInert", "forwardTrapSelector", "backwardTrapSelector",
    "invokerSelector", "restoredInvokerSelector", "runnerPauseSummary",
  ], `${expected.cellId}.observations`);
  const observation = raw.observations;
  if (
    observation.actualFocusedSelector !== selector ||
    observation.effectiveTextScale !== "2" ||
    finiteNumber(observation.effectiveTextScaleRatio, `${expected.cellId}.effectiveTextScaleRatio`) !== 2 ||
    observation.focusIndicatorStyle === "none" ||
    nonNegativeNumber(observation.focusIndicatorWidthCssPx, `${expected.cellId}.focusIndicatorWidthCssPx`) < 2 ||
    nonNegativeNumber(observation.focusIndicatorContrastRatio, `${expected.cellId}.focusIndicatorContrastRatio`) < 3 ||
    observation.focusIndicatorVisible !== true ||
    nonNegativeNumber(observation.focusedViewportEscapeCssPx, `${expected.cellId}.focusedViewportEscapeCssPx`) > 0 ||
    observation.obstructionSamplePoints !== 5 || observation.unobscuredSamplePoints !== 5 ||
    observation.indicatorRingSamplePoints !== 4 ||
    observation.unobscuredIndicatorRingSamplePoints !== 4 ||
    observation.indicatorClippingAncestorCount !== 0
  ) fail(`${expected.cellId} did not focus the required visible target`);
  const focusedRect = validateRectangle(observation.focusedRect, `${expected.cellId}.focusedRect`);
  const indicatorRect = validateRectangle(
    observation.focusIndicatorRect,
    `${expected.cellId}.focusIndicatorRect`,
  );
  if (
    focusedRect.width <= 0 || focusedRect.height <= 0 || focusedRect.left < 0 || focusedRect.top < 0 ||
    focusedRect.right > 320 || focusedRect.bottom > 568
  ) fail(`${expected.cellId} focused target is not fully inside the 320x568 viewport`);
  if (
    indicatorRect.width < focusedRect.width || indicatorRect.height < focusedRect.height ||
    indicatorRect.left > focusedRect.left || indicatorRect.top > focusedRect.top ||
    indicatorRect.right < focusedRect.right || indicatorRect.bottom < focusedRect.bottom ||
    indicatorRect.left < 0 || indicatorRect.top < 0 ||
    indicatorRect.right > 320 || indicatorRect.bottom > 568
  ) fail(`${expected.cellId} focus indicator is not fully visible inside the viewport`);
  const requiredPause = expectedPauseSummary(expected.transitionId!);
  if (
    typeof observation.runnerPauseSummary !== "string" ||
    (requiredPause !== "" && observation.runnerPauseSummary !== requiredPause)
  ) fail(`${expected.cellId} did not expose the required pause reason`);
  if (!Array.isArray(observation.trace) || observation.trace.length === 0) {
    fail(`${expected.cellId} focus trace is absent`);
  }
  for (const [index, item] of observation.trace.entries()) {
    assertExactKeys(item, ["action", "selector", "atMonotonicMilliseconds"], `${expected.cellId}.trace[${index}]`);
    nonEmptyString(item.action, `${expected.cellId}.trace[${index}].action`);
    nonEmptyString(item.selector, `${expected.cellId}.trace[${index}].selector`);
    nonNegativeNumber(item.atMonotonicMilliseconds, `${expected.cellId}.trace[${index}].atMonotonicMilliseconds`);
  }
  if (modalOpen) {
    if (
      observation.modalBackgroundInert !== true ||
      observation.forwardTrapSelector !== "[data-runner-remap=\"lane-up\"]" ||
      observation.backwardTrapSelector !== "[data-runner-close-bindings]"
    ) fail(`${expected.cellId} did not contain both tab directions or inert the background`);
  } else if (
    observation.modalBackgroundInert !== null || observation.forwardTrapSelector !== null ||
    observation.backwardTrapSelector !== null
  ) fail(`${expected.cellId} contains fabricated modal-open evidence`);
  if (modalClose) {
    if (
      observation.invokerSelector !== "[data-runner-configure-bindings]" ||
      observation.restoredInvokerSelector !== observation.invokerSelector
    ) fail(`${expected.cellId} did not restore the exact modal invoker`);
  } else if (observation.invokerSelector !== null || observation.restoredInvokerSelector !== null) {
    fail(`${expected.cellId} contains fabricated modal-close evidence`);
  }
}

function requiredAnnouncementPattern(witnessId: string): RegExp {
  const patterns: Readonly<Record<string, RegExp>> = Object.freeze({
    "approach-warning-with-lane-and-time": /lane.*(?:ticks|ms)/i,
    "actual-benefit-contact-with-score-and-delta": /(?:increased by|changed by \+?)\s*\d+.*(?:to|remains) \d+/i,
    "actual-hazard-contact-with-score-and-delta": /(?:decreased by|changed by -)\s*\d+.*(?:to|remains) \d+/i,
    "suppressed-hazard-contact-with-no-score-change": /(?:changed by 0|suppressed)/i,
    "clamped-effect-result-with-requested-and-actual-delta": /requested [+-]?\d+.*actual result/i,
    "semantic-prompt-open-and-choice-confirmation": /lane choice (?:ready|confirmed)/i,
    "pause-and-resume-with-reason": /runner (?:paused|resumed)/i,
    "actionable-error-with-recovery-action": /(?:try|return|review|recovery)/i,
    "completion-with-singleton-fact-and-memory": /runner laboratory complete/i,
  });
  return patterns[witnessId] ?? fail(`unsupported announcement witness ${witnessId}`);
}

const ANNOUNCEMENT_LANE_LABELS = ["Top lane", "Middle lane", "Bottom lane"] as const;
const ANNOUNCEMENT_SCORE_LABELS = Object.freeze({
  health: "Health",
  happiness: "Happiness",
  money: "Financial security",
} as const);

function expectedApproachAnnouncement(pattern: Record<string, any>): string {
  const entities = pattern.courseEntities as readonly Record<string, any>[];
  const lanes = ANNOUNCEMENT_LANE_LABELS.map((laneLabel, lane) => {
    const laneEntities = entities.filter((entity) => entity.lane === lane);
    const meaning = (entity: Record<string, any>): string => {
      const sign = entity.requestedDelta > 0 ? "+" : "−";
      return `${ANNOUNCEMENT_SCORE_LABELS[entity.scoreId as keyof typeof ANNOUNCEMENT_SCORE_LABELS]} ${sign}${Math.abs(entity.requestedDelta)}`;
    };
    const benefits = laneEntities.filter(({ kind }) => kind === "benefit");
    const hazards = laneEntities.filter(({ kind }) => kind === "hazard");
    const urgencyTicks = laneEntities.length === 0
      ? pattern.courseAnchorTick - pattern.eventSimulationTick
      : Math.min(...laneEntities.map(({ contactTick }) => contactTick - pattern.eventSimulationTick));
    const urgency = urgencyTicks === 0
      ? "At the decision line now"
      : `${urgencyTicks} ticks (${urgencyTicks * 20} ms) to the nearest event`;
    return `${laneLabel}. Benefit: ${benefits.length === 0 ? "No benefit" : benefits.map(meaning).join(", ")}. ` +
      `Hazard: ${hazards.length === 0 ? "No hazard" : hazards.map(meaning).join(", ")}. ` +
      `Urgency: ${urgency}.`;
  });
  return `Choice ahead. ${lanes.join(" ")}`;
}

function expectedContactAnnouncement(contact: Record<string, any>): string {
  const lane = ANNOUNCEMENT_LANE_LABELS[contact.courseLane as 0 | 1 | 2];
  const score = ANNOUNCEMENT_SCORE_LABELS[
    contact.scoreId as keyof typeof ANNOUNCEMENT_SCORE_LABELS
  ];
  if (contact.outcome === "hazard-suppressed") {
    return `${lane}: ${score} changed by 0 and remains ${contact.stateScoreAfter} because the hazard was suppressed.`;
  }
  const direction = contact.effectActualDelta > 0
    ? `increased by ${contact.effectActualDelta}`
    : contact.effectActualDelta < 0
      ? `decreased by ${-contact.effectActualDelta}`
      : "did not change";
  const clamp = contact.effectActualDelta === contact.effectRequestedDelta
    ? ""
    : ` Requested ${contact.effectRequestedDelta > 0 ? "+" : ""}${contact.effectRequestedDelta}; the limit changed the actual result.`;
  return `${lane}: ${score} ${direction} to ${contact.effectAfter}.${clamp}`;
}

function validateAnnouncementBinding(
  text: string,
  region: unknown,
  witnessId: string,
  evidence: Record<string, any>,
  label: string,
): void {
  const expectedRegion = witnessId === "actionable-error-with-recovery-action" ? "alert" : "status";
  if (region !== expectedRegion) fail(`${label} used the wrong live region for its transition`);
  let expectedText: string;
  if (witnessId === "approach-warning-with-lane-and-time") {
    expectedText = expectedApproachAnnouncement(evidence.pattern);
  } else if ([
    "actual-benefit-contact-with-score-and-delta",
    "actual-hazard-contact-with-score-and-delta",
    "suppressed-hazard-contact-with-no-score-change",
    "clamped-effect-result-with-requested-and-actual-delta",
  ].includes(witnessId)) {
    expectedText = expectedContactAnnouncement(evidence.contact);
  } else if (witnessId === "semantic-prompt-open-and-choice-confirmation") {
    expectedText = `Lane choice confirmed: ${ANNOUNCEMENT_LANE_LABELS[evidence.decision.targetLane]}.`;
  } else if (witnessId === "pause-and-resume-with-reason") {
    expectedText = "Runner resumed.";
  } else if (witnessId === "actionable-error-with-recovery-action") {
    expectedText = evidence.after.noticeMessage;
  } else if (witnessId === "completion-with-singleton-fact-and-memory") {
    expectedText =
      `Runner laboratory complete: one learning fact (${evidence.completion.expectedFactId}: ` +
      "value-runner-laboratory-practice-v1) and one milestone memory " +
      `(${evidence.completion.expectedMemoryId}: Completed the runner laboratory.) were recorded. ` +
      `Practice scores: Health ${evidence.after.scores.health}, Happiness ${evidence.after.scores.happiness}, ` +
      `Financial security ${evidence.after.scores.money}. ` +
      "These practice scores do not affect your life journey.";
  } else {
    fail(`${label} has no exact announcement binding`);
  }
  if (text !== expectedText) fail(`${label} text is not the exact result of its authenticated transition`);
}

function exactStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  for (const [index, item] of value.entries()) nonEmptyString(item, `${label}[${index}]`);
  return value as string[];
}

function validateWitnessState(value: unknown, label: string): Record<string, any> {
  assertExactKeys(value, [
    "simulationTick", "sessionStatus", "runStatus", "stagePhase", "scores", "pauseReasons",
    "runnerUserPaused", "invulnerableUntilTick", "resolvedEntityCount", "factIds", "memoryIds",
    "noticeTone", "noticeMessage",
  ], label);
  nonNegativeInteger(value.simulationTick, `${label}.simulationTick`);
  if (![
    "awaiting-start", "running", "paused", "settling", "completed", "faulted", "disposed",
  ].includes(String(value.sessionStatus))) fail(`${label}.sessionStatus is invalid`);
  if (value.runStatus !== "active" && value.runStatus !== "completed") {
    fail(`${label}.runStatus is invalid`);
  }
  if (!["entry", "active", "settling", "complete"].includes(String(value.stagePhase))) {
    fail(`${label}.stagePhase is invalid`);
  }
  assertExactKeys(value.scores, ["health", "happiness", "money"], `${label}.scores`);
  for (const scoreId of ["health", "happiness", "money"] as const) {
    const score = finiteNumber(value.scores[scoreId], `${label}.scores.${scoreId}`);
    if (!Number.isInteger(score) || score < 0 || score > 100) fail(`${label}.scores.${scoreId} is invalid`);
  }
  exactStringArray(value.pauseReasons, `${label}.pauseReasons`);
  if (value.runnerUserPaused !== null && typeof value.runnerUserPaused !== "boolean") {
    fail(`${label}.runnerUserPaused is invalid`);
  }
  if (value.invulnerableUntilTick !== null) {
    nonNegativeInteger(value.invulnerableUntilTick, `${label}.invulnerableUntilTick`);
  }
  nonNegativeInteger(value.resolvedEntityCount, `${label}.resolvedEntityCount`);
  exactStringArray(value.factIds, `${label}.factIds`);
  exactStringArray(value.memoryIds, `${label}.memoryIds`);
  if (value.noticeTone !== null && !["status", "warning", "error"].includes(String(value.noticeTone))) {
    fail(`${label}.noticeTone is invalid`);
  }
  if (value.noticeMessage !== null) nonEmptyString(value.noticeMessage, `${label}.noticeMessage`);
  return value;
}

function sameStrings(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function validateContactEvidence(
  value: unknown,
  before: Record<string, any>,
  after: Record<string, any>,
  label: string,
): Record<string, any> {
  assertExactKeys(value, [
    "entityInstanceId", "contentId", "outcome", "simulationTick", "scoreId",
    "definitionRequestedDelta", "effectId", "effectRequestedDelta", "effectActualDelta",
    "effectBefore", "effectAfter", "stateScoreBefore", "stateScoreAfter", "resolvedBefore",
    "resolvedAfter", "courseEntityInstanceId", "courseContentId", "courseEntityKind",
    "courseLane", "courseContactTick",
  ], label);
  nonEmptyString(value.entityInstanceId, `${label}.entityInstanceId`);
  nonEmptyString(value.contentId, `${label}.contentId`);
  nonEmptyString(value.outcome, `${label}.outcome`);
  const tick = nonNegativeInteger(value.simulationTick, `${label}.simulationTick`);
  if (value.scoreId !== "health" && value.scoreId !== "happiness" && value.scoreId !== "money") {
    fail(`${label}.scoreId is invalid`);
  }
  finiteNumber(value.definitionRequestedDelta, `${label}.definitionRequestedDelta`);
  for (const key of [
    "effectRequestedDelta", "effectActualDelta", "effectBefore", "effectAfter",
  ] as const) {
    if (value[key] !== null) finiteNumber(value[key], `${label}.${key}`);
  }
  if (value.effectId !== null) nonEmptyString(value.effectId, `${label}.effectId`);
  finiteNumber(value.stateScoreBefore, `${label}.stateScoreBefore`);
  finiteNumber(value.stateScoreAfter, `${label}.stateScoreAfter`);
  if (typeof value.resolvedBefore !== "boolean" || typeof value.resolvedAfter !== "boolean") {
    fail(`${label} resolution flags are invalid`);
  }
  if (
    value.entityInstanceId !== value.courseEntityInstanceId ||
    value.contentId !== value.courseContentId ||
    value.resolvedBefore !== false || value.resolvedAfter !== true ||
    value.courseEntityKind !== (value.outcome === "benefit-applied" ? "benefit" : "hazard") ||
    nonNegativeInteger(value.courseLane, `${label}.courseLane`) > 2 ||
    nonNegativeInteger(value.courseContactTick, `${label}.courseContactTick`) !== tick ||
    after.simulationTick !== tick || before.simulationTick !== tick - 1 ||
    (before.scores as Record<string, unknown>)[String(value.scoreId)] !== value.stateScoreBefore ||
    (after.scores as Record<string, unknown>)[String(value.scoreId)] !== value.stateScoreAfter
  ) fail(`${label} does not authenticate the event against its course and state transition`);
  return value;
}

function requireNullEvidence(
  proof: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of [
    "pattern", "contact", "suppressionSource", "decision", "pause", "error", "completion",
    "boundaryPrecondition", "presentationCarrier",
  ]) {
    if (!allowed.includes(key) && proof[key] !== null) {
      fail(`${label}.${key} contains unrelated or fabricated evidence`);
    }
  }
}

export function validateWitnessTransitionEvidence(
  value: unknown,
  witnessId: string,
  label: string,
): void {
  assertExactKeys(value, [
    "provenance", "before", "after", "eventTypes", "pattern", "contact", "suppressionSource",
    "decision", "pause", "error", "completion", "boundaryPrecondition", "presentationCarrier",
  ], label);
  const proof = value;
  const before = validateWitnessState(proof.before, `${label}.before`);
  const after = validateWitnessState(proof.after, `${label}.after`);
  const events = exactStringArray(proof.eventTypes, `${label}.eventTypes`);
  const isClamp = witnessId === "clamped-effect-result-with-requested-and-actual-delta";
  if (proof.provenance !== (isClamp
    ? "isolated-nonpersisted-production-contact-seam"
    : "createRunnerSession")) {
    fail(`${label}.provenance is not the required production transition source`);
  }

  if (witnessId === "approach-warning-with-lane-and-time") {
    requireNullEvidence(proof, ["pattern"], label);
    assertExactKeys(proof.pattern, [
      "patternIndex", "eventSimulationTick", "courseSpawnTick", "courseAnchorTick",
      "eventEntityInstanceIds", "courseEntityInstanceIds", "courseDecisionMarkerInstanceId",
      "courseEntities",
    ], `${label}.pattern`);
    const pattern = proof.pattern;
    const tick = nonNegativeInteger(pattern.eventSimulationTick, `${label}.pattern.eventSimulationTick`);
    const courseEntityIds = exactStringArray(
      pattern.courseEntityInstanceIds,
      `${label}.pattern.courseEntityInstanceIds`,
    );
    if (
      !Array.isArray(pattern.courseEntities) ||
      pattern.courseEntities.length + 1 !== courseEntityIds.length ||
      !/^entity-[0-9a-f]{16}$/.test(nonEmptyString(
        pattern.courseDecisionMarkerInstanceId,
        `${label}.pattern.courseDecisionMarkerInstanceId`,
      )) ||
      courseEntityIds.at(-1) !== pattern.courseDecisionMarkerInstanceId
    ) {
      fail(`${label}.pattern.courseEntities do not cover the appended pattern`);
    }
    for (const [index, entity] of pattern.courseEntities.entries()) {
      assertExactKeys(entity, [
        "instanceId", "contentId", "kind", "lane", "contactTick", "scoreId",
        "requestedDelta",
      ], `${label}.pattern.courseEntities[${index}]`);
      if (
        entity.instanceId !== courseEntityIds[index] ||
        !/^entity-[0-9a-f]{16}$/.test(nonEmptyString(
          entity.instanceId,
          `${label}.pattern.courseEntities[${index}].instanceId`,
        )) ||
        typeof entity.contentId !== "string" || entity.contentId.length === 0 ||
        (entity.kind !== "benefit" && entity.kind !== "hazard") ||
        nonNegativeInteger(entity.lane, `${label}.pattern.courseEntities[${index}].lane`) > 2 ||
        nonNegativeInteger(entity.contactTick, `${label}.pattern.courseEntities[${index}].contactTick`) < tick ||
        !["health", "happiness", "money"].includes(String(entity.scoreId)) ||
        finiteNumber(entity.requestedDelta, `${label}.pattern.courseEntities[${index}].requestedDelta`) !==
          (entity.kind === "benefit" ? 1 : -1)
      ) fail(`${label}.pattern.courseEntities[${index}] is not an exact course scoring precondition`);
    }
    if (
      !events.includes("pattern-appended") ||
      nonNegativeInteger(pattern.patternIndex, `${label}.pattern.patternIndex`) < 1 ||
      pattern.courseSpawnTick !== tick ||
      nonNegativeInteger(pattern.courseAnchorTick, `${label}.pattern.courseAnchorTick`) < tick ||
      after.simulationTick !== tick || before.simulationTick !== tick - 1 ||
      !sameStrings(pattern.eventEntityInstanceIds, pattern.courseEntityInstanceIds) ||
      exactStringArray(pattern.eventEntityInstanceIds, `${label}.pattern.eventEntityInstanceIds`).length === 0
    ) fail(`${label} does not prove an authentic appended-pattern warning transition`);
    return;
  }

  if ([
    "actual-benefit-contact-with-score-and-delta",
    "actual-hazard-contact-with-score-and-delta",
    "suppressed-hazard-contact-with-no-score-change",
    "clamped-effect-result-with-requested-and-actual-delta",
  ].includes(witnessId)) {
    requireNullEvidence(
      proof,
      isClamp
        ? ["contact", "boundaryPrecondition", "presentationCarrier"]
        : witnessId === "suppressed-hazard-contact-with-no-score-change"
          ? ["contact", "suppressionSource"]
          : ["contact"],
      label,
    );
    const contact = validateContactEvidence(proof.contact, before, after, `${label}.contact`);
    if (!events.includes("contact-resolved")) fail(`${label} omitted its production contact event`);
    const expected = witnessId === "actual-benefit-contact-with-score-and-delta"
      ? { outcome: "benefit-applied", requested: 1, actual: 1 }
      : witnessId === "actual-hazard-contact-with-score-and-delta"
        ? { outcome: "hazard-applied", requested: -1, actual: -1 }
        : witnessId === "clamped-effect-result-with-requested-and-actual-delta"
          ? { outcome: "benefit-applied", requested: 1, actual: 0 }
          : { outcome: "hazard-suppressed", requested: -1, actual: null };
    if (contact.outcome !== expected.outcome || contact.definitionRequestedDelta !== expected.requested) {
      fail(`${label} contact outcome or scoring definition differs from its witness`);
    }
    const entityIdentity = /^entity-([0-9a-f]{16})$/.exec(String(contact.entityInstanceId));
    if (entityIdentity === null) fail(`${label} contact entity identity is not canonical`);
    const expectedEffectId = `effect-${entityIdentity[1]}`;
    if (witnessId === "suppressed-hazard-contact-with-no-score-change") {
      assertExactKeys(
        proof.suppressionSource,
        ["before", "after", "contact"],
        `${label}.suppressionSource`,
      );
      const sourceBefore = validateWitnessState(
        proof.suppressionSource.before,
        `${label}.suppressionSource.before`,
      );
      const sourceAfter = validateWitnessState(
        proof.suppressionSource.after,
        `${label}.suppressionSource.after`,
      );
      const sourceContact = validateContactEvidence(
        proof.suppressionSource.contact,
        sourceBefore,
        sourceAfter,
        `${label}.suppressionSource.contact`,
      );
      const sourceIdentity = /^entity-([0-9a-f]{16})$/.exec(String(sourceContact.entityInstanceId));
      if (
        contact.effectId !== null || contact.effectRequestedDelta !== null ||
        contact.effectActualDelta !== null || contact.effectBefore !== null || contact.effectAfter !== null ||
        contact.stateScoreBefore !== contact.stateScoreAfter ||
        typeof before.invulnerableUntilTick !== "number" || before.invulnerableUntilTick <= contact.simulationTick ||
        after.invulnerableUntilTick !== before.invulnerableUntilTick ||
        contact.contentId !== "runner-lab-clutter-hazard-v1" || contact.simulationTick !== 568 ||
        sourceContact.outcome !== "hazard-applied" ||
        sourceContact.contentId !== "runner-lab-pressure-hazard-v1" ||
        sourceContact.simulationTick !== 550 || sourceContact.definitionRequestedDelta !== -1 ||
        sourceIdentity === null || sourceContact.effectId !== `effect-${sourceIdentity[1]}` ||
        sourceContact.effectRequestedDelta !== -1 || sourceContact.effectActualDelta !== -1 ||
        sourceContact.effectBefore !== sourceContact.stateScoreBefore ||
        sourceContact.effectAfter !== sourceContact.stateScoreAfter ||
        sourceContact.stateScoreAfter !== sourceContact.stateScoreBefore - 1 ||
        sourceAfter.invulnerableUntilTick !== 575 || before.invulnerableUntilTick !== 575 ||
        sourceContact.scoreId !== "happiness" || sourceContact.stateScoreBefore !== 60 ||
        sourceContact.stateScoreAfter !== 59 || contact.scoreId !== "health" ||
        contact.stateScoreBefore !== 65 || contact.stateScoreAfter !== 65 ||
        before.scores.happiness !== sourceContact.stateScoreAfter ||
        sourceContact.entityInstanceId === contact.entityInstanceId
      ) fail(`${label} does not prove a score-neutral contact inside authentic invulnerability`);
    } else if (
      typeof contact.effectId !== "string" ||
      contact.effectId !== expectedEffectId ||
      contact.effectRequestedDelta !== expected.requested ||
      contact.effectActualDelta !== expected.actual ||
      contact.effectBefore !== contact.stateScoreBefore ||
      contact.effectAfter !== contact.stateScoreAfter ||
      contact.effectAfter - contact.effectBefore !== contact.effectActualDelta
    ) fail(`${label} does not prove the exact production score effect`);
    if (isClamp) {
      assertExactKeys(proof.boundaryPrecondition, [
        "effectId", "source", "requestedDelta", "actualDelta", "after", "persisted",
      ], `${label}.boundaryPrecondition`);
      const boundary = proof.boundaryPrecondition;
      assertExactKeys(proof.presentationCarrier, [
        "carrierKind", "simulationTick", "scoreId", "carrierScore", "eventScoreAfter",
        "eventObjectIdentityPreserved",
      ], `${label}.presentationCarrier`);
      const carrier = proof.presentationCarrier;
      if (
        boundary.effectId !== "browser-clamp-precondition-1" || boundary.effectId === contact.effectId ||
        boundary.source !== "system" || boundary.requestedDelta !== 65 ||
        boundary.actualDelta !== 65 || boundary.after !== 100 || boundary.persisted !== false ||
        contact.scoreId !== "money" || contact.contentId !== "runner-lab-money-token-v1" ||
        contact.courseLane !== 1 || contact.simulationTick !== 550 ||
        contact.effectBefore !== 100 || contact.effectAfter !== 100 ||
        contact.stateScoreBefore !== 100 || contact.stateScoreAfter !== 100 ||
        carrier.carrierKind !== "authentic-unclamped-production-state" ||
        carrier.simulationTick !== contact.simulationTick || carrier.scoreId !== contact.scoreId ||
        carrier.carrierScore !== 36 || carrier.eventScoreAfter !== 100 ||
        carrier.eventObjectIdentityPreserved !== true
      ) fail(`${label} does not prove the honest isolated nonpersisted clamp seam`);
    }
    return;
  }

  if (witnessId === "semantic-prompt-open-and-choice-confirmation") {
    requireNullEvidence(proof, ["decision"], label);
    assertExactKeys(proof.decision, [
      "markerInstanceId", "courseMarkerInstanceId", "simulationTick", "controlMode", "targetLane",
      "unresolvedBefore", "resolvedAfter",
    ], `${label}.decision`);
    const decision = proof.decision;
    if (
      !events.includes("decision-marker-resolved") ||
      decision.markerInstanceId !== decision.courseMarkerInstanceId ||
      decision.controlMode !== "semantic-assist" ||
      nonNegativeInteger(decision.targetLane, `${label}.decision.targetLane`) > 2 ||
      decision.unresolvedBefore !== true || decision.resolvedAfter !== true ||
      before.pauseReasons?.includes("semantic") !== true ||
      after.pauseReasons?.includes("semantic") === true ||
      decision.simulationTick !== before.simulationTick || after.simulationTick !== before.simulationTick + 1 ||
      events[0] !== "decision-marker-resolved" || !events.includes("clock-advanced")
    ) fail(`${label} does not prove the authentic untimed Semantic decision transition`);
    return;
  }

  if (witnessId === "pause-and-resume-with-reason") {
    requireNullEvidence(proof, ["pause"], label);
    assertExactKeys(proof.pause, ["activeSequence", "eventTypeSequence", "intermediate"], `${label}.pause`);
    const pause = proof.pause;
    const intermediate = validateWitnessState(pause.intermediate, `${label}.pause.intermediate`);
    if (
      !sameStrings(pause.eventTypeSequence, ["user-pause-changed", "user-pause-changed"]) ||
      !Array.isArray(pause.activeSequence) || pause.activeSequence.length !== 2 ||
      pause.activeSequence[0] !== true || pause.activeSequence[1] !== false ||
      !events.every((event) => event === "user-pause-changed") || events.length !== 2 ||
      intermediate.sessionStatus !== "paused" || intermediate.runnerUserPaused !== true ||
      !intermediate.pauseReasons?.includes("user") ||
      before.runnerUserPaused !== false || after.runnerUserPaused !== false ||
      (after.pauseReasons as unknown[]).length !== 0 || before.simulationTick !== after.simulationTick
    ) fail(`${label} does not prove an authentic user pause and resume sequence`);
    return;
  }

  if (witnessId === "actionable-error-with-recovery-action") {
    requireNullEvidence(proof, ["error"], label);
    assertExactKeys(proof.error, [
      "recoveryActionSelector", "recoveryActionVisible", "recoveryActionFocused",
    ], `${label}.error`);
    if (
      events.length !== 0 || before.sessionStatus !== "running" || after.sessionStatus !== "faulted" ||
      after.noticeTone !== "error" || typeof after.noticeMessage !== "string" ||
      !/return to the title/i.test(after.noticeMessage) ||
      proof.error.recoveryActionSelector !== "[data-runner-fault-return-title]" ||
      proof.error.recoveryActionVisible !== true || proof.error.recoveryActionFocused !== true ||
      before.simulationTick !== after.simulationTick
    ) fail(`${label} does not prove an authentic fault with a visible focused recovery action`);
    return;
  }

  if (witnessId === "completion-with-singleton-fact-and-memory") {
    requireNullEvidence(proof, ["completion"], label);
    assertExactKeys(proof.completion, [
      "settlementEventTick", "factIds", "memoryIds", "expectedFactId", "expectedMemoryId",
    ], `${label}.completion`);
    const completion = proof.completion;
    const factIds = exactStringArray(completion.factIds, `${label}.completion.factIds`);
    const memoryIds = exactStringArray(completion.memoryIds, `${label}.completion.memoryIds`);
    if (
      !events.includes("settlement-applied") || before.stagePhase !== "settling" ||
      after.stagePhase !== "complete" || after.runStatus !== "completed" || after.sessionStatus !== "completed" ||
      (before.factIds as unknown[]).length !== 0 || (before.memoryIds as unknown[]).length !== 0 ||
      factIds.length !== 1 || factIds[0] !== completion.expectedFactId ||
      memoryIds.length !== 1 || memoryIds[0] !== completion.expectedMemoryId ||
      !sameStrings(after.factIds, factIds) || !sameStrings(after.memoryIds, memoryIds) ||
      completion.expectedFactId !== "fact-runner-laboratory-complete-v1" ||
      completion.expectedMemoryId !== "memory-runner-laboratory-complete-v1" ||
      completion.settlementEventTick !== after.simulationTick
    ) fail(`${label} does not prove the exact singleton settlement fact and memory`);
    return;
  }
  fail(`${label} has an unsupported witness identity`);
}

function validateUtc(value: unknown, label: string): number {
  const text = nonEmptyString(value, label);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    fail(`${label} must be a canonical ISO UTC timestamp`);
  }
  return milliseconds;
}

function validateAnnouncementCell(
  raw: Record<string, unknown>,
  expected: ExpectedCell,
  artifactStart: number,
  artifactCompletion: number,
): void {
  assertExactKeys(raw, ["group", "cellId", "witnessId", "observations", "thresholds"], expected.cellId);
  if (
    raw.group !== "announcements" || raw.cellId !== expected.cellId || raw.witnessId !== expected.witnessId
  ) fail(`${expected.cellId} dimensions differ from the fixture`);
  assertExactKeys(raw.thresholds, [
    "minimumIntervalMilliseconds", "maximumDuplicateWriteCount", "latestMessageWinsRequired",
    "duplicateSuppressionRequired",
  ], `${expected.cellId}.thresholds`);
  const threshold = raw.thresholds;
  if (
    threshold.minimumIntervalMilliseconds !== 1000 || threshold.maximumDuplicateWriteCount !== 0 ||
    threshold.latestMessageWinsRequired !== true || threshold.duplicateSuppressionRequired !== true
  ) fail(`${expected.cellId} thresholds differ from the locked contract`);
  assertExactKeys(raw.observations, [
    "region", "text", "writtenAtUtc", "atMonotonicMilliseconds",
    "previousWriteMonotonicMilliseconds", "intervalFromPreviousMilliseconds", "duplicateWriteCount",
    "latestMessageWinsObserved", "duplicateSuppressionObserved", "transitionEvidence",
  ], `${expected.cellId}.observations`);
  const observation = raw.observations;
  if (observation.region !== "status" && observation.region !== "alert") {
    fail(`${expected.cellId} live-region identity is invalid`);
  }
  const text = nonEmptyString(observation.text, `${expected.cellId}.text`);
  if (!requiredAnnouncementPattern(expected.witnessId!).test(text)) {
    fail(`${expected.cellId} text does not contain the required result information`);
  }
  const written = validateUtc(observation.writtenAtUtc, `${expected.cellId}.writtenAtUtc`);
  if (written < artifactStart || written > artifactCompletion) {
    fail(`${expected.cellId} write timestamp lies outside this fresh browser run`);
  }
  nonNegativeNumber(observation.atMonotonicMilliseconds, `${expected.cellId}.atMonotonicMilliseconds`);
  if (
    observation.previousWriteMonotonicMilliseconds !== null &&
    (typeof observation.previousWriteMonotonicMilliseconds !== "number" ||
      !Number.isFinite(observation.previousWriteMonotonicMilliseconds) ||
      observation.previousWriteMonotonicMilliseconds < 0)
  ) fail(`${expected.cellId} previous live-region timestamp is invalid`);
  if (
    observation.intervalFromPreviousMilliseconds === null ||
    nonNegativeNumber(observation.intervalFromPreviousMilliseconds, `${expected.cellId}.intervalFromPreviousMilliseconds`) < 1000
  ) fail(`${expected.cellId} violated the one-second live-region throttle`);
  if (
    observation.duplicateWriteCount !== 0 || observation.latestMessageWinsObserved !== true ||
    observation.duplicateSuppressionObserved !== true
  ) fail(`${expected.cellId} did not prove latest-wins and duplicate suppression`);
  validateWitnessTransitionEvidence(
    observation.transitionEvidence,
    expected.witnessId!,
    `${expected.cellId}.transitionEvidence`,
  );
  validateAnnouncementBinding(
    text,
    observation.region,
    expected.witnessId!,
    observation.transitionEvidence as Record<string, any>,
    expected.cellId,
  );
}

const GROUP_COUNTS: RunnerBrowserMatrixGroupCounts = Object.freeze({
  completionReflow: 40,
  presentation: 72,
  safeAreaOneHand: 8,
  focus: 10,
  announcements: 9,
  total: 139,
});

export function validateRunnerBrowserMatrixArtifact(
  artifact: unknown,
  fixture: any,
  expectedSourceSha256: string,
): RunnerBrowserMatrixValidationSummary {
  if (!SHA256_PATTERN.test(expectedSourceSha256)) fail("expected source digest is malformed");
  assertExactKeys(artifact, [
    "schemaVersion", "artifactId", "evaluatorId", "fixtureId", "evaluatedSourceSha256",
    "startedAtUtc", "completedAtUtc", "playwrightPackage", "playwrightVersion",
    "browserEngine", "browserChannel", "browserVersion", "baseUrl", "cells",
  ], "artifact");
  if (
    artifact.schemaVersion !== 1 || artifact.artifactId !== RUNNER_BROWSER_MATRIX_ARTIFACT_ID ||
    artifact.evaluatorId !== fixture?.evaluatorId || artifact.evaluatorId !== RUNNER_EVALUATOR_ID ||
    artifact.fixtureId !== fixture?.fixtureId || artifact.evaluatedSourceSha256 !== expectedSourceSha256 ||
    artifact.playwrightPackage !== PLAYWRIGHT_PACKAGE || artifact.playwrightVersion !== PINNED_PLAYWRIGHT_VERSION ||
    artifact.browserEngine !== BROWSER_ENGINE || artifact.browserChannel !== BROWSER_CHANNEL
  ) fail("artifact identity, evaluator, source, Playwright, or browser channel is invalid");
  nonEmptyString(artifact.browserVersion, "artifact.browserVersion");
  const baseUrl = nonEmptyString(artifact.baseUrl, "artifact.baseUrl");
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    fail("artifact.baseUrl is invalid");
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    fail("artifact.baseUrl must use HTTP(S)");
  }
  const startedAt = validateUtc(artifact.startedAtUtc, "artifact.startedAtUtc");
  const completedAt = validateUtc(artifact.completedAtUtc, "artifact.completedAtUtc");
  const now = Date.now();
  if (
    completedAt < startedAt || completedAt - startedAt > MAX_RUN_DURATION_MILLISECONDS ||
    completedAt < now - FRESH_ARTIFACT_WINDOW_MILLISECONDS || completedAt > now + 60_000
  ) fail("artifact timestamps are stale, future-dated, reversed, or implausibly long");
  if (!Array.isArray(artifact.cells)) fail("artifact cells are absent");
  const expected = expectedCells(fixture);
  if (artifact.cells.length !== expected.length) {
    fail(`artifact has ${artifact.cells.length} cells instead of ${expected.length}`);
  }
  const actualById = new Map<string, Record<string, unknown>>();
  for (const [index, cell] of artifact.cells.entries()) {
    if (!isObject(cell)) fail(`artifact cell ${index} must be an object`);
    const cellId = nonEmptyString(cell.cellId, `artifact cell ${index}.cellId`);
    if (actualById.has(cellId)) fail(`artifact contains duplicate cell ${cellId}`);
    actualById.set(cellId, cell);
  }
  for (const expectedCell of expected) {
    const raw = actualById.get(expectedCell.cellId);
    if (raw === undefined) fail(`artifact omitted ${expectedCell.cellId}`);
    if (raw.group !== expectedCell.group) fail(`${expectedCell.cellId} is in the wrong group`);
    switch (expectedCell.group) {
      case "completionReflow":
        validateCompletionCell(raw, expectedCell);
        break;
      case "presentation":
        validatePresentationCell(raw, expectedCell);
        break;
      case "safeAreaOneHand":
        validateSafeAreaCell(raw, expectedCell);
        break;
      case "focus":
        validateFocusCell(raw, expectedCell);
        break;
      case "announcements":
        validateAnnouncementCell(raw, expectedCell, startedAt, completedAt);
        break;
    }
  }
  if (actualById.size !== expected.length) fail("artifact contains unexpected cells");
  const artifactCells = artifact.cells;
  const counts = Object.fromEntries(
    (["completionReflow", "presentation", "safeAreaOneHand", "focus", "announcements"] as const)
      .map((group) => [group, artifactCells.filter((cell: any) => cell.group === group).length]),
  ) as Record<string, number>;
  if (
    counts.completionReflow !== 40 || counts.presentation !== 72 || counts.safeAreaOneHand !== 8 ||
    counts.focus !== 10 || counts.announcements !== 9
  ) fail("artifact group closure differs from the locked 139-cell matrix");
  const typed = artifact as unknown as RunnerBrowserMatrixArtifact;
  return Object.freeze({ artifact: typed, groupCounts: GROUP_COUNTS });
}

interface RunnerPageConfiguration {
  readonly viewport: RunnerBrowserViewport;
  readonly textScalePercent: number;
  readonly contrast: "standard" | "high" | "forced-colors";
  readonly motionSource: "normal" | "saved-reduced" | "os-reduced";
  readonly controlMode: "manual" | "semantic-assist" | "automatic-assist";
  readonly safeAreaInsetsCssPx?: Readonly<{
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  }>;
}

function applicationUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function assertCanonicalBrowserBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    fail("canonical browser evidence requires a valid managed local preview URL");
  }
  if (
    url.protocol !== "http:" || url.username !== "" || url.password !== "" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) fail("canonical browser evidence requires the managed local preview, not an external URL");
}

export async function pauseRunnerBrowserClock(page: Page): Promise<number> {
  const currentClockTime = await page.evaluate(() => Date.now());
  if (!Number.isSafeInteger(currentClockTime) || currentClockTime < 0) {
    fail("runner browser clock did not expose a valid installed time");
  }
  const pauseTarget = currentClockTime + CLOCK_PAUSE_HEADROOM_MILLISECONDS;
  if (!Number.isSafeInteger(pauseTarget)) {
    fail("runner browser clock pause target exceeded the safe integer range");
  }
  await page.clock.pauseAt(pauseTarget);
  const observeClocks = () => ({
    dateMilliseconds: Date.now(),
    performanceMilliseconds: performance.now(),
  });
  const first = await page.evaluate(observeClocks);
  const second = await page.evaluate(observeClocks);
  if (
    first.dateMilliseconds !== pauseTarget || second.dateMilliseconds !== pauseTarget ||
    !Number.isFinite(first.performanceMilliseconds) || first.performanceMilliseconds < 0 ||
    !Number.isFinite(second.performanceMilliseconds) || second.performanceMilliseconds < 0 ||
    second.performanceMilliseconds !== first.performanceMilliseconds
  ) {
    fail(
      "runner browser Date/performance clocks did not pause at the controlled evidence time " +
        `(expectedDate=${pauseTarget}, firstDate=${String(first.dateMilliseconds)}, ` +
        `secondDate=${String(second.dateMilliseconds)}, ` +
        `firstPerformance=${String(first.performanceMilliseconds)}, ` +
        `secondPerformance=${String(second.performanceMilliseconds)})`,
    );
  }
  return pauseTarget;
}

export interface RunnerSwipeGestureCoordinates {
  readonly x: number;
  readonly startY: number;
  readonly endY: number;
}

export function visibleRunnerSwipeGesture(
  box: Readonly<{ x: number; y: number; width: number; height: number }>,
  viewport: RunnerBrowserViewport,
): RunnerSwipeGestureCoordinates {
  const values = [box.x, box.y, box.width, box.height, viewport.width, viewport.height];
  if (values.some((value) => !Number.isFinite(value)) || box.width <= 0 || box.height <= 0 ||
      viewport.width <= 0 || viewport.height <= 0) {
    fail("manual swipe geometry is malformed");
  }
  const insetCssPx = 8;
  const visibleLeft = Math.max(box.x + insetCssPx, insetCssPx);
  const visibleRight = Math.min(
    box.x + box.width - insetCssPx,
    viewport.width - insetCssPx,
  );
  const visibleTop = Math.max(box.y + insetCssPx, insetCssPx);
  const visibleBottom = Math.min(
    box.y + box.height - insetCssPx,
    viewport.height - insetCssPx,
  );
  if (
    visibleRight <= visibleLeft ||
    visibleBottom - visibleTop < RUNNER_SWIPE_THRESHOLD_CSS_PX
  ) fail("manual swipe surface lacks a threshold-sized visible intersection");
  return Object.freeze({
    x: (visibleLeft + visibleRight) / 2,
    startY: visibleBottom,
    endY: visibleTop,
  });
}

async function createRunnerPage(
  browser: Browser,
  baseUrl: string,
  configuration: RunnerPageConfiguration,
): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext({
    viewport: configuration.viewport,
    hasTouch: configuration.safeAreaInsetsCssPx !== undefined,
    forcedColors: configuration.contrast === "forced-colors" ? "active" : "none",
    reducedMotion: configuration.motionSource === "os-reduced" ? "reduce" : "no-preference",
  });
  try {
    await context.addInitScript(() => {
    const deterministic = new Uint8Array(8);
    const replacement = function <T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      bytes.fill(0);
      return array;
    };
    try {
      Object.defineProperty(globalThis.crypto, "getRandomValues", {
        configurable: true,
        value: replacement,
      });
    } catch {
      void deterministic;
    }
    });
    const page = await context.newPage();
    if (configuration.safeAreaInsetsCssPx !== undefined) {
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setSafeAreaInsetsOverride", {
        insets: configuration.safeAreaInsetsCssPx,
      });
    }
    await page.clock.install({ time: new Date() });
    await page.goto(applicationUrl(baseUrl), { waitUntil: "networkidle" });
    if (
      configuration.textScalePercent !== 100 ||
      configuration.contrast === "high" ||
      configuration.motionSource === "saved-reduced"
    ) {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.locator("#setting-text-scale").selectOption(String(configuration.textScalePercent));
      if (configuration.contrast === "high") await page.locator("#setting-contrast").check();
      if (configuration.motionSource === "saved-reduced") await page.locator("#setting-motion").check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await page.clock.runFor(1);
    }
    await page.getByRole("button", { name: "New life" }).click();
    await page.locator(`input[name="control-mode"][value="${configuration.controlMode}"]`).check();
    await page.getByRole("button", { name: "Create this life" }).click();
    await page.getByRole("button", { name: "Open runner laboratory" }).click();
    await page.locator("[data-runner-view]").waitFor({ state: "visible" });
    await page.clock.runFor(1);
    await pauseRunnerBrowserClock(page);
    return { context, page };
  } catch (error) {
    await Promise.allSettled([context.close()]);
    throw error;
  }
}

interface LayoutMeasurements {
  readonly horizontalOverflowCssPx: number;
  readonly clippedTextCssPx: number;
  readonly playerControlOverlapCssPx2: number;
  readonly playerPlayfieldEscapeCssPx: number;
  readonly minimumTargetWidthCssPx: number;
  readonly minimumTargetHeightCssPx: number;
  readonly visiblePlayerCount: number;
  readonly visiblePlayfieldCount: number;
  readonly visibleControlClusterCount: number;
  readonly visibleInteractiveTargetCount: number;
}

interface LayoutSampleObservation extends LayoutMeasurements {
  readonly sequence: number;
  readonly monotonicMilliseconds: number;
  readonly simulationTick: number;
  readonly patternIndex: number;
  readonly resolvedEntityCount: number;
  readonly motionKind: "idle" | "moving" | "none";
  readonly semanticPromptVisible: boolean;
  readonly visibleWarningCount: number;
  readonly visiblePlayerCount: number;
  readonly visiblePlayfieldCount: number;
  readonly visibleControlClusterCount: number;
  readonly visibleInteractiveTargetCount: number;
  readonly runStatus: "active" | "completed";
  readonly stagePhase: "active" | "settling" | "complete";
}

interface StartCheckpointObservation {
  readonly sessionStatus: string;
  readonly simulationTick: number;
  readonly startButtonVisible: boolean;
  readonly resolvedEntityIds: readonly string[];
}

async function measureStartCheckpoint(page: Page): Promise<StartCheckpointObservation> {
  return page.evaluate(() => {
    const encoded = localStorage.getItem("choice-of-life-v1-active-run");
    if (encoded === null) throw new TypeError("production run checkpoint is absent");
    const state = JSON.parse(encoded) as {
      readonly simulationTick?: unknown;
      readonly runner?: {
        readonly spawn?: { readonly resolvedEntityIds?: unknown };
      } | null;
    };
    const sessionStatus = document.querySelector<HTMLElement>("[data-runner-view]")
      ?.dataset.status;
    const startButton = document.querySelector<HTMLButtonElement>("#runner-start-button");
    const startPanel = startButton?.closest<HTMLElement>("[data-runner-entry]");
    const resolvedEntityIds = state.runner?.spawn?.resolvedEntityIds;
    if (
      typeof sessionStatus !== "string" || typeof state.simulationTick !== "number" ||
      startButton === null || !Array.isArray(resolvedEntityIds) ||
      !resolvedEntityIds.every((value) => typeof value === "string")
    ) throw new TypeError("production start checkpoint is malformed");
    return {
      sessionStatus,
      simulationTick: state.simulationTick,
      startButtonVisible: startPanel?.hidden !== true && !startButton.hidden,
      resolvedEntityIds: [...resolvedEntityIds] as string[],
    };
  });
}

async function measureLayout(page: Page): Promise<LayoutMeasurements> {
  return page.evaluate(() => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    };
    const textCandidates = [...document.querySelectorAll(
      "[data-runner-view] button, [data-runner-view] output, [data-runner-view] dt, " +
      "[data-runner-view] dd, [data-runner-view] legend, [data-runner-view] label, " +
      "[data-runner-view] p, [data-runner-view] h2, [data-runner-view] h3, " +
      "[data-runner-view] [role=status], [data-runner-view] [role=alert]",
    )].filter(visible);
    const targets = [...document.querySelectorAll("[data-runner-view] button:not([disabled])")]
      .filter(visible)
      .map((element) => element.getBoundingClientRect());
    const players = [...document.querySelectorAll<HTMLElement>("[data-runner-player]")]
      .filter(visible);
    const playfields = [...document.querySelectorAll<HTMLElement>("[data-runner-play-surface]")]
      .filter(visible);
    const controlClusters = [...document.querySelectorAll<HTMLElement>(
      "[data-runner-control-cluster]",
    )].filter(visible);
    const playerRect = players[0]?.getBoundingClientRect() ?? null;
    const playfieldRect = playfields[0]?.getBoundingClientRect() ?? null;
    const controls = [...document.querySelectorAll("[data-runner-control-cluster] button")]
      .filter(visible)
      .map((element) => element.getBoundingClientRect());
    const overlap = playerRect === null ? 0 : controls.reduce((total, rectangle) => {
      const width = Math.max(0, Math.min(playerRect.right, rectangle.right) - Math.max(playerRect.left, rectangle.left));
      const height = Math.max(0, Math.min(playerRect.bottom, rectangle.bottom) - Math.max(playerRect.top, rectangle.top));
      return total + width * height;
    }, 0);
    return {
      horizontalOverflowCssPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      clippedTextCssPx: textCandidates.reduce((maximum, element) =>
        Math.max(
          maximum,
          element.scrollWidth - element.clientWidth,
          element.scrollHeight - element.clientHeight,
        ), 0),
      playerControlOverlapCssPx2: overlap,
      playerPlayfieldEscapeCssPx: playerRect === null
        ? 0
        : playfieldRect === null ? Number.POSITIVE_INFINITY : Math.max(
        0,
        playfieldRect.top - playerRect.top,
        playerRect.bottom - playfieldRect.bottom,
        playfieldRect.left - playerRect.left,
        playerRect.right - playfieldRect.right,
      ),
      minimumTargetWidthCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ width }) => width)),
      minimumTargetHeightCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ height }) => height)),
      visiblePlayerCount: players.length,
      visiblePlayfieldCount: playfields.length,
      visibleControlClusterCount: controlClusters.length,
      visibleInteractiveTargetCount: targets.length,
    };
  });
}

async function measureLayoutSample(
  page: Page,
  sequence: number,
): Promise<LayoutSampleObservation> {
  const [layout, state] = await Promise.all([
    measureLayout(page),
    page.evaluate(() => {
      const encoded = localStorage.getItem("choice-of-life-v1-active-run");
      if (encoded === null) throw new TypeError("layout sample lacks its production checkpoint");
      const candidate = JSON.parse(encoded) as {
        readonly simulationTick?: unknown;
        readonly runStatus?: unknown;
        readonly stage?: {
          readonly phase?: unknown;
          readonly settlement?: { readonly status?: unknown } | null;
        };
        readonly runner?: {
          readonly motion?: { readonly kind?: unknown };
          readonly spawn?: {
            readonly patternIndex?: unknown;
            readonly resolvedEntityIds?: unknown;
          };
        } | null;
      };
      const runner = candidate.runner;
      const patternIndex = runner?.spawn?.patternIndex ?? 11;
      const resolvedEntityIds = runner?.spawn?.resolvedEntityIds ?? [];
      const motionKind = runner?.motion?.kind ?? "none";
      const runStatus = candidate.runStatus;
      const stagePhase = candidate.stage?.phase;
      const settlement = candidate.stage?.settlement;
      const settlementStatus = settlement?.status ?? null;
      const simulationTick = candidate.simulationTick;
      const runnerPresent = runner !== null && runner !== undefined;
      const validRunnerProjection = runnerPresent
        ? typeof patternIndex === "number" && Number.isSafeInteger(patternIndex) &&
          patternIndex >= 0 && patternIndex <= 11 &&
          Array.isArray(resolvedEntityIds) &&
          resolvedEntityIds.every((value) => typeof value === "string") &&
          ["idle", "moving"].includes(String(motionKind))
        : typeof patternIndex === "number" && patternIndex === 11 &&
          Array.isArray(resolvedEntityIds) &&
          resolvedEntityIds.length === 0 && motionKind === "none";
      const validLifecycle =
        (runStatus === "active" && stagePhase === "active" &&
          settlement === null && runnerPresent && typeof simulationTick === "number" &&
          simulationTick < 3000 && typeof patternIndex === "number" && patternIndex <= 10) ||
        (runStatus === "active" && stagePhase === "settling" &&
          settlementStatus === "pending" && runnerPresent && simulationTick === 3000 &&
          patternIndex === 11 && motionKind === "idle") ||
        (runStatus === "completed" && stagePhase === "complete" &&
          settlementStatus === "applied" && runner === null && simulationTick === 3000);
      if (
        typeof simulationTick !== "number" || !Number.isSafeInteger(simulationTick) ||
        simulationTick < 0 || typeof patternIndex !== "number" ||
        !Array.isArray(resolvedEntityIds) ||
        !validRunnerProjection || !validLifecycle
      ) {
        throw new TypeError(
          "layout sample production checkpoint is malformed " +
          `(tick=${String(simulationTick)}, runStatus=${String(runStatus)}, ` +
          `stagePhase=${String(stagePhase)}, settlementStatus=${String(settlementStatus)}, ` +
          `patternIndex=${String(patternIndex)}, motionKind=${String(motionKind)}, ` +
          `runnerPresent=${String(runnerPresent)})`,
        );
      }
      const visible = (element: HTMLElement): boolean => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
      };
      return {
        monotonicMilliseconds: performance.now(),
        simulationTick,
        patternIndex,
        resolvedEntityCount: resolvedEntityIds.length,
        motionKind: motionKind as "idle" | "moving" | "none",
        semanticPromptVisible: [...document.querySelectorAll<HTMLElement>(
          "[data-runner-semantic-lane]",
        )].some(visible),
        visibleWarningCount: [...document.querySelectorAll<HTMLElement>(
          "[data-runner-warning-lane]",
        )].filter((element) => visible(element) && (element.textContent?.trim() ?? "") !== "").length,
        runStatus: runStatus as "active" | "completed",
        stagePhase: stagePhase as "active" | "settling" | "complete",
      };
    }),
  ]);
  return Object.freeze({ sequence, ...state, ...layout });
}

async function advanceWithLayoutSampling(
  page: Page,
  durationMilliseconds: number,
  samples: LayoutSampleObservation[],
  intervalMilliseconds = RUNNER_LAYOUT_SAMPLE_INTERVAL_MILLISECONDS,
): Promise<void> {
  let elapsed = 0;
  while (elapsed < durationMilliseconds) {
    const step = Math.min(intervalMilliseconds, durationMilliseconds - elapsed);
    await page.clock.runFor(step);
    elapsed += step;
    samples.push(await measureLayoutSample(page, samples.length));
    if (await page.locator("#runner-completion-heading").isVisible()) return;
  }
}

async function advanceToCompletion(
  page: Page,
  pathId: string,
  activeScreenshotPath?: string,
): Promise<{
  readonly startActivations: number;
  readonly pathActivations: number;
  readonly unexpectedActivations: number;
  readonly selectors: readonly string[];
  readonly startTransition: CompletionReflowCell["observations"]["startTransition"];
  readonly activationTransitions: CompletionReflowCell["observations"]["activationTransitions"];
  readonly layoutSamples: readonly LayoutSampleObservation[];
}> {
  const selectors: string[] = [];
  const activationTransitions: Array<CompletionReflowCell["observations"]["activationTransitions"][number]> = [];
  const layoutSamples: LayoutSampleObservation[] = [];
  const beforeStart = await measureStartCheckpoint(page);
  await page.locator("#runner-start-button").click();
  selectors.push("#runner-start-button");
  const afterStart = await measureStartCheckpoint(page);
  await advanceWithLayoutSampling(page, 40, layoutSamples, 20);
  const laneSummary = async (): Promise<string> =>
    await page.locator('[data-runner-summary="lane"]').textContent() ?? "";
  const semanticVisible = async (): Promise<boolean> =>
    await page.locator('[data-runner-semantic-lane="0"]').isVisible();
  const manualBeforeLane = await laneSummary();
  const manualBeforeSemantic = await semanticVisible();
  let manualSelector: string | null = null;
  if (pathId === "manual-keyboard") {
    await page.keyboard.press("ArrowUp");
    manualSelector = "keyboard:ArrowUp";
  } else if (pathId === "manual-buttons") {
    await page.locator('[data-runner-lane-command="lane-up"]').click();
    manualSelector = '[data-runner-lane-command="lane-up"]';
  } else if (pathId === "manual-swipe") {
    const surface = page.locator("[data-runner-play-surface]");
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    if (box === null) fail("manual swipe play surface is unavailable");
    const viewport = page.viewportSize();
    if (viewport === null) fail("manual swipe viewport is unavailable");
    const gesture = visibleRunnerSwipeGesture(box, viewport);
    const pointsBelongToSurface = await page.evaluate(({ x, startY, endY }) => {
      const surfaceElement = document.querySelector("[data-runner-play-surface]");
      if (!(surfaceElement instanceof HTMLElement)) return false;
      return [startY, endY].every((y) => {
        const target = document.elementFromPoint(x, y);
        return target !== null && surfaceElement.contains(target);
      });
    }, gesture);
    if (!pointsBelongToSurface) {
      fail("manual swipe endpoints are not visible production play-surface pixels");
    }
    await page.mouse.move(gesture.x, gesture.startY);
    await page.mouse.down();
    await page.mouse.move(gesture.x, gesture.endY, { steps: 4 });
    await page.mouse.up();
    manualSelector = "[data-runner-play-surface]:swipe-up";
  }
  if (pathId.startsWith("manual-")) {
    await advanceWithLayoutSampling(page, 600, layoutSamples, 20);
    if (manualSelector === null) fail(`manual completion path ${pathId} omitted its action`);
    const afterLane = await laneSummary();
    const afterSemantic = await semanticVisible();
    const productionStateChanged = manualBeforeLane !== afterLane;
    if (!productionStateChanged || manualBeforeLane !== "Middle lane" || afterLane !== "Top lane") {
      fail(
        `manual completion action ${manualSelector} did not change the production lane ` +
          `(before=${JSON.stringify(manualBeforeLane)}, after=${JSON.stringify(afterLane)})`,
      );
    }
    selectors.push(manualSelector);
    activationTransitions.push({
      selector: manualSelector,
      beforeLaneSummary: manualBeforeLane,
      afterLaneSummary: afterLane,
      beforeSemanticPromptVisible: manualBeforeSemantic,
      afterSemanticPromptVisible: afterSemantic,
      productionStateChanged,
    });
    if (activeScreenshotPath !== undefined) {
      await page.screenshot({ path: activeScreenshotPath, fullPage: true });
    }
  }
  if (pathId === "semantic-assist") {
    for (let guard = 0; guard < 14; guard += 1) {
      if (await page.locator("#runner-completion-heading").isVisible()) break;
      await advanceWithLayoutSampling(page, 6_000, layoutSamples);
      const choice = page.locator('[data-runner-semantic-lane="0"]');
      if (await choice.isVisible() && await choice.isEnabled()) {
        const beforeLane = await laneSummary();
        const beforePrompt = await semanticVisible();
        await choice.click();
        selectors.push('[data-runner-semantic-lane="0"]');
        await advanceWithLayoutSampling(page, 40, layoutSamples, 20);
        const afterLane = await laneSummary();
        const afterPrompt = await semanticVisible();
        activationTransitions.push({
          selector: '[data-runner-semantic-lane="0"]',
          beforeLaneSummary: beforeLane,
          afterLaneSummary: afterLane,
          beforeSemanticPromptVisible: beforePrompt,
          afterSemanticPromptVisible: afterPrompt,
          productionStateChanged: beforePrompt && !afterPrompt,
        });
      }
    }
  } else {
    await advanceWithLayoutSampling(page, 62_000, layoutSamples);
  }
  await page.locator("#runner-completion-heading").waitFor({ state: "visible", timeout: 15_000 });
  const expectedSelector = pathId === "manual-keyboard"
    ? "keyboard:ArrowUp"
    : pathId === "manual-buttons"
      ? '[data-runner-lane-command="lane-up"]'
      : pathId === "manual-swipe"
        ? "[data-runner-play-surface]:swipe-up"
        : pathId === "semantic-assist" ? '[data-runner-semantic-lane="0"]' : null;
  const startActivations = selectors.filter((selector) => selector === "#runner-start-button").length;
  const pathActivations = expectedSelector === null
    ? 0
    : selectors.filter((selector) => selector === expectedSelector).length;
  const unexpectedActivations = selectors.length - startActivations - pathActivations;
  const afterResolvedEntityId = afterStart.resolvedEntityIds[0];
  if (
    beforeStart.sessionStatus !== "awaiting-start" || afterStart.sessionStatus !== "running" ||
    beforeStart.simulationTick !== 0 || afterStart.simulationTick !== 0 ||
    beforeStart.startButtonVisible !== true || afterStart.startButtonVisible !== false ||
    beforeStart.resolvedEntityIds.length !== 0 || afterStart.resolvedEntityIds.length !== 1 ||
    afterResolvedEntityId === undefined || !/^entity-[0-9a-f]{16}$/.test(afterResolvedEntityId)
  ) fail("production Start did not perform the exact durable start-marker transition");
  const beforeResolvedEntityIds = Object.freeze([] as const);
  const afterResolvedEntityIds = Object.freeze([afterResolvedEntityId] as const);
  const startTransition: CompletionReflowCell["observations"]["startTransition"] = Object.freeze({
    source: "production-durable-checkpoint",
    selector: "#runner-start-button",
    beforeSessionStatus: "awaiting-start",
    afterSessionStatus: "running",
    beforeSimulationTick: 0,
    afterSimulationTick: 0,
    beforeStartButtonVisible: true,
    afterStartButtonVisible: false,
    beforeResolvedEntityIds,
    afterResolvedEntityIds,
    productionStateChanged: true,
  });
  return Object.freeze({
    startActivations,
    pathActivations,
    unexpectedActivations,
    selectors: Object.freeze(selectors),
    startTransition,
    activationTransitions: Object.freeze(activationTransitions.map((transition) =>
      Object.freeze({ ...transition }))),
    layoutSamples: Object.freeze(layoutSamples.map((sample) =>
      Object.freeze({ ...sample }))),
  });
}

async function collectCompletionCells(
  browser: Browser,
  baseUrl: string,
  fixture: any,
  representativeScreenshotDirectory?: string,
): Promise<CompletionReflowCell[]> {
  const matrix = fixture.accessibility.browserMatrix.completionReflowMatrix;
  const cells: CompletionReflowCell[] = [];
  for (const pathId of matrix.paths as string[]) {
    const controlMode = pathId === "semantic-assist"
      ? "semantic-assist"
      : pathId === "automatic-assist" ? "automatic-assist" : "manual";
    for (const viewport of matrix.viewports as RunnerBrowserViewport[]) {
      for (const textScalePercent of matrix.textScalePercent as number[]) {
        const cellId =
          `completion-reflow:${pathId}:${viewport.width}x${viewport.height}:${textScalePercent}`;
        try {
          const { context, page } = await createRunnerPage(browser, baseUrl, {
            viewport,
            textScalePercent,
            contrast: "standard",
            motionSource: "normal",
            controlMode,
          });
          await executeWithAllSettledCleanup(async () => {
            const representativeName = pathId === "manual-keyboard" &&
                viewport.width === 1280 && viewport.height === 720 && textScalePercent === 100
              ? "runner-manual-active-1280x720-100.png"
              : pathId === "manual-keyboard" && viewport.width === 320 &&
                  viewport.height === 568 && textScalePercent === 200
                ? "runner-manual-active-320x568-200.png"
                : null;
            const progression = await advanceToCompletion(
              page,
              pathId,
              representativeScreenshotDirectory !== undefined && representativeName !== null
                ? path.join(representativeScreenshotDirectory, representativeName)
                : undefined,
            );
            const layoutSamples = [...progression.layoutSamples];
            layoutSamples.push(await measureLayoutSample(page, layoutSamples.length));
            const maximum = (key: keyof LayoutMeasurements): number =>
              Math.max(...layoutSamples.map((sample) => sample[key]));
            const targetSamples = layoutSamples.filter(({ visibleInteractiveTargetCount }) =>
              visibleInteractiveTargetCount > 0);
            if (targetSamples.length === 0) fail(`${cellId} never exposed an interactive target`);
            const minimum = (key: keyof LayoutMeasurements): number =>
              Math.min(...targetSamples.map((sample) => sample[key]));
            const status = await page.locator("[data-runner-view]").getAttribute("data-status") ?? "";
            cells.push({
              group: "completionReflow",
              cellId,
              path: pathId,
              viewport: { ...viewport },
              textScalePercent,
              observations: {
                runStatus: status,
                completionHeadingSelector: "#runner-completion-heading",
                completionHeadingVisible: await page.locator("#runner-completion-heading").isVisible(),
                startActivations: progression.startActivations,
                pathActivations: progression.pathActivations,
                unexpectedActivations: progression.unexpectedActivations,
                activatedSelectors: progression.selectors,
                startTransition: progression.startTransition,
                activationTransitions: progression.activationTransitions,
                layoutSamples,
                horizontalOverflowCssPx: maximum("horizontalOverflowCssPx"),
                clippedTextCssPx: maximum("clippedTextCssPx"),
                playerControlOverlapCssPx2: maximum("playerControlOverlapCssPx2"),
                playerPlayfieldEscapeCssPx: maximum("playerPlayfieldEscapeCssPx"),
                minimumTargetWidthCssPx: minimum("minimumTargetWidthCssPx"),
                minimumTargetHeightCssPx: minimum("minimumTargetHeightCssPx"),
              },
              thresholds: {
                requiredRunStatus: "completed",
                requiredStartActivations: 1,
                requiredPathActivations: expectedPathActivations(pathId),
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
          }, () => [() => context.close()]);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`runner browser matrix: completion cell ${cellId} failed: ${detail}`, {
            cause: error,
          });
        }
      }
    }
  }
  return cells;
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

interface DecodedScreenshot {
  readonly width: number;
  readonly height: number;
  pixel(x: number, y: number): readonly [number, number, number];
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const candidate = left + above - upperLeft;
  const leftDistance = Math.abs(candidate - left);
  const aboveDistance = Math.abs(candidate - above);
  const upperLeftDistance = Math.abs(candidate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeScreenshotPng(encoded: Buffer): DecodedScreenshot {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!encoded.subarray(0, signature.length).equals(signature)) fail("browser screenshot is not PNG");
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = -1;
  const imageData: Buffer[] = [];
  while (offset + 12 <= encoded.length) {
    const length = encoded.readUInt32BE(offset);
    const type = encoded.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > encoded.length) fail("browser screenshot PNG is truncated");
    if (type === "IHDR") {
      width = encoded.readUInt32BE(dataStart);
      height = encoded.readUInt32BE(dataStart + 4);
      bitDepth = encoded[dataStart + 8] ?? -1;
      colorType = encoded[dataStart + 9] ?? -1;
      if (
        (encoded[dataStart + 10] ?? -1) !== 0 || (encoded[dataStart + 11] ?? -1) !== 0 ||
        (encoded[dataStart + 12] ?? -1) !== 0
      ) fail("browser screenshot PNG uses unsupported compression, filtering, or interlace");
    } else if (type === "IDAT") {
      imageData.push(encoded.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || bitDepth !== 8 || bytesPerPixel === 0 || imageData.length === 0) {
    fail("browser screenshot PNG has an unsupported pixel format");
  }
  const inflated = inflateSync(Buffer.concat(imageData));
  const rowBytes = width * bytesPerPixel;
  if (inflated.length !== height * (rowBytes + 1)) fail("browser screenshot PNG has invalid scanlines");
  const pixels = Buffer.allocUnsafe(height * rowBytes);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? -1;
    sourceOffset += 1;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[sourceOffset + x] ?? 0;
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] ?? 0 : 0;
      const above = y > 0 ? pixels[rowOffset - rowBytes + x] ?? 0 : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset - rowBytes + x - bytesPerPixel] ?? 0
        : 0;
      const reconstructed = filter === 0
        ? raw
        : filter === 1
          ? raw + left
          : filter === 2
            ? raw + above
            : filter === 3
              ? raw + Math.floor((left + above) / 2)
              : filter === 4
                ? raw + paethPredictor(left, above, upperLeft)
                : fail(`browser screenshot PNG uses unsupported filter ${filter}`);
      pixels[rowOffset + x] = reconstructed & 0xff;
    }
    sourceOffset += rowBytes;
  }
  return Object.freeze({
    width,
    height,
    pixel(x: number, y: number): readonly [number, number, number] {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
        fail(`rendered-pixel coordinate ${x},${y} is outside ${width}x${height}`);
      }
      const index = (y * width + x) * bytesPerPixel;
      return Object.freeze([pixels[index]!, pixels[index + 1]!, pixels[index + 2]!]);
    },
  });
}

function pixelCss(color: readonly [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

type GraphicPixelPoint = Readonly<{ x: number; y: number }>;

interface GraphicPixelProbeBase {
  readonly category: "player" | "entity" | "lane" | "progress";
  readonly selector: string;
  readonly variant: string;
}

interface GraphicPixelPointProbe extends GraphicPixelProbeBase {
  readonly mode: "points";
  readonly foreground: GraphicPixelPoint;
  readonly background: GraphicPixelPoint;
}

interface GraphicPixelSearchProbe extends GraphicPixelProbeBase {
  readonly mode: "search";
  readonly bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  readonly expectedForegroundColor: string;
  readonly expectedBackgroundColor: string | null;
  readonly maximumPairDistanceCssPx: number;
}

type GraphicPixelProbe = GraphicPixelPointProbe | GraphicPixelSearchProbe;

async function measureContrastStateProof(page: Page): Promise<ContrastMeasurement["stateProof"]> {
  return page.evaluate(() => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" &&
        style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector<HTMLElement>("[data-runner-view]");
    if (root === null) throw new Error("runner contrast state-proof root is absent");
    const textCandidates = [...root.querySelectorAll(
      "button, output, dt, dd, legend, label, p, h2, h3, span, kbd",
    )].filter(visible);
    const targets = [...root.querySelectorAll("button:not([disabled])")]
      .filter(visible)
      .map((element) => element.getBoundingClientRect());
    const effectiveTextScaleRatio = Number(root.dataset.textScale);
    if (!Number.isFinite(effectiveTextScaleRatio) || effectiveTextScaleRatio <= 0) {
      throw new Error("runner contrast state omitted its effective text scale");
    }
    return {
      effectiveContrastMode: root.dataset.contrast === "high" ? "high" : "standard",
      forcedColorsActive: matchMedia("(forced-colors: active)").matches,
      effectiveTextScaleRatio,
      effectiveReducedMotion: root.dataset.motionReduced === "true",
      horizontalOverflowCssPx: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth,
      ),
      clippedTextCssPx: Math.max(0, ...textCandidates.map((element) => Math.max(
        element.scrollWidth - element.clientWidth,
        element.scrollHeight - element.clientHeight,
      ))),
      minimumTargetWidthCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ width }) => width)),
      minimumTargetHeightCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ height }) => height)),
    };
  });
}

function expectedScreenshotPixel(input: string): readonly [number, number, number] {
  const rendered = compositeColor(parsedCssColor(input), [255, 255, 255, 1]);
  return Object.freeze([
    Math.round(rendered[0]),
    Math.round(rendered[1]),
    Math.round(rendered[2]),
  ]);
}

function closePixel(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
): boolean {
  return actual.every((component, index) => Math.abs(component - expected[index]!) <= 4);
}

function findRenderedPixelPair(
  screenshot: DecodedScreenshot,
  probe: GraphicPixelSearchProbe,
): Readonly<{ foreground: GraphicPixelPoint; background: GraphicPixelPoint }> {
  const left = Math.max(0, Math.floor(probe.bounds.left));
  const top = Math.max(0, Math.floor(probe.bounds.top));
  const right = Math.min(screenshot.width, Math.ceil(probe.bounds.right));
  const bottom = Math.min(screenshot.height, Math.ceil(probe.bounds.bottom));
  if (right <= left || bottom <= top) fail(`${probe.selector} has an empty rendered-pixel search area`);
  const expectedForeground = expectedScreenshotPixel(probe.expectedForegroundColor);
  const expectedBackground = probe.expectedBackgroundColor === null
    ? null
    : expectedScreenshotPixel(probe.expectedBackgroundColor);
  let fallback: {
    foreground: GraphicPixelPoint;
    background: GraphicPixelPoint;
    contrastRatio: number;
  } | null = null;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const foregroundPixel = screenshot.pixel(x, y);
      if (!closePixel(foregroundPixel, expectedForeground)) continue;
      for (let distance = 1; distance <= probe.maximumPairDistanceCssPx; distance += 1) {
        for (let dy = -distance; dy <= distance; dy += 1) {
          for (let dx = -distance; dx <= distance; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) continue;
            const backgroundX = x + dx;
            const backgroundY = y + dy;
            if (
              backgroundX < left || backgroundX >= right ||
              backgroundY < top || backgroundY >= bottom
            ) continue;
            const backgroundPixel = screenshot.pixel(backgroundX, backgroundY);
            if (expectedBackground !== null) {
              if (!closePixel(backgroundPixel, expectedBackground)) continue;
              return Object.freeze({
                foreground: Object.freeze({ x, y }),
                background: Object.freeze({ x: backgroundX, y: backgroundY }),
              });
            }
            const ratio = measuredContrastRatio(pixelCss(foregroundPixel), pixelCss(backgroundPixel));
            if (fallback === null || ratio > fallback.contrastRatio) {
              fallback = {
                foreground: Object.freeze({ x, y }),
                background: Object.freeze({ x: backgroundX, y: backgroundY }),
                contrastRatio: ratio,
              };
            }
          }
        }
      }
    }
  }
  if (fallback !== null && fallback.contrastRatio >= 3) {
    return Object.freeze({ foreground: fallback.foreground, background: fallback.background });
  }
  fail(
    `${probe.selector} did not render its expected ${probe.expectedForegroundColor}` +
      `${probe.expectedBackgroundColor === null ? " contrasting neighbor" : ` / ${probe.expectedBackgroundColor} pair`}`,
  );
}

async function measureRenderedGraphicContrast(
  page: Page,
  state: ContrastMeasurement["state"],
  sampleMotionSource: ContrastMeasurement["sampleMotionSource"],
  stateProof: ContrastMeasurement["stateProof"],
): Promise<readonly ContrastMeasurement[]> {
  if (state !== "running") return Object.freeze([]);
  const probes = await page.evaluate((): GraphicPixelProbe[] => {
    const documentPoint = (x: number, y: number) => Object.freeze({
      x: Math.max(0, Math.round(x + scrollX)),
      y: Math.max(0, Math.round(y + scrollY)),
    });
    const documentBounds = (
      rect: DOMRect,
      expansion: number,
      clip?: DOMRect,
    ): GraphicPixelSearchProbe["bounds"] => Object.freeze({
      left: Math.max(0, Math.floor(Math.max(rect.left - expansion, clip?.left ?? -Infinity) + scrollX)),
      top: Math.max(0, Math.floor(Math.max(rect.top - expansion, clip?.top ?? -Infinity) + scrollY)),
      right: Math.ceil(Math.min(rect.right + expansion, clip?.right ?? Infinity) + scrollX),
      bottom: Math.ceil(Math.min(rect.bottom + expansion, clip?.bottom ?? Infinity) + scrollY),
    });
    const computedColors = (input: string): readonly string[] =>
      Object.freeze([...new Set(input.match(/rgba?\([^)]+\)/gi) ?? [])]);
    const visible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" &&
        style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    };
    const output: GraphicPixelProbe[] = [];
    const haloProbe = (
      element: HTMLElement,
      category: "player" | "entity",
      selector: string,
      variant: string,
      clip: DOMRect,
    ): void => {
      const rect = element.getBoundingClientRect();
      const colors = computedColors(getComputedStyle(element).boxShadow);
      const forcedBorder = computedColors(getComputedStyle(element).borderTopColor)[0];
      if (colors.length < 2 && forcedBorder === undefined) {
        throw new Error(`${selector} omitted its rendered halo or forced-color border`);
      }
      output.push({
        mode: "search",
        category,
        selector,
        variant: category === "player" && colors.length < 2 ? "forced-border-surface" : variant,
        bounds: documentBounds(rect, 7, clip),
        expectedForegroundColor: colors[0] ?? forcedBorder!,
        expectedBackgroundColor: colors[1] ?? null,
        maximumPairDistanceCssPx: colors.length < 2 ? 5 : 3,
      });
    };
    const playfield = document.querySelector<HTMLElement>("[data-runner-play-surface]");
    if (playfield === null) throw new Error("rendered graphic playfield is absent");
    const surfaceRect = playfield.getBoundingClientRect();
    const player = document.querySelector<HTMLElement>("[data-runner-player]");
    if (player !== null && visible(player)) {
      const rect = player.getBoundingClientRect();
      if (
        rect.right > surfaceRect.left && rect.left < surfaceRect.right &&
        rect.bottom > surfaceRect.top && rect.top < surfaceRect.bottom
      ) haloProbe(player, "player", "[data-runner-player]", "inner-outer-halo", surfaceRect);
    }
    document.querySelectorAll<HTMLElement>("[data-runner-entity-id]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (
        !visible(element) ||
        rect.right <= surfaceRect.left || rect.left >= surfaceRect.right ||
        rect.bottom <= surfaceRect.top || rect.top >= surfaceRect.bottom
      ) return;
      const variant = element.classList.contains("col-runner-entity--benefit")
        ? "benefit"
        : element.classList.contains("col-runner-entity--hazard") ? "hazard" : "opportunity";
      haloProbe(
        element,
        "entity",
        `[data-runner-entity-id="${element.dataset.runnerEntityId ?? ""}"]`,
        variant,
        surfaceRect,
      );
    });
    document.querySelectorAll<HTMLElement>("[data-runner-lane]").forEach((element) => {
      if (element.matches(":last-child")) return;
      const rect = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, "::after");
      const colors = computedColors(pseudo.backgroundImage);
      const forcedColor = computedColors(pseudo.backgroundColor)[0] ??
        computedColors(getComputedStyle(element).borderBottomColor)[0];
      const expectedForegroundColor = colors[0] ?? forcedColor;
      if (expectedForegroundColor === undefined) {
        throw new Error(`lane ${element.dataset.runnerLane ?? "unknown"} has no rendered divider color`);
      }
      output.push({
        mode: "search",
        category: "lane",
        selector: `[data-runner-lane="${element.dataset.runnerLane ?? ""}"]`,
        variant: `lane-${element.dataset.runnerLane ?? "unknown"}`,
        bounds: documentBounds(new DOMRect(
          rect.left + 2,
          rect.bottom - 9,
          Math.max(1, Math.min(rect.width - 4, 150)),
          15,
        ), 0, surfaceRect),
        expectedForegroundColor,
        expectedBackgroundColor: colors[1] ?? null,
        maximumPairDistanceCssPx: colors[1] === undefined ? 8 : 3,
      });
    });
    const progress = document.querySelector<HTMLProgressElement>("[data-runner-progress]");
    if (progress !== null) {
      const rect = progress.getBoundingClientRect();
      const inset = Math.max(3, Number.parseFloat(getComputedStyle(progress).borderLeftWidth) + 1);
      const innerWidth = Math.max(1, rect.width - inset * 2);
      const filledWidth = innerWidth * (progress.max <= 0 ? 0 : progress.value / progress.max);
      if (filledWidth >= 2 && innerWidth - filledWidth >= 2) {
        output.push({
          mode: "points",
          category: "progress",
          selector: "[data-runner-progress]",
          variant: "value-track",
          foreground: documentPoint(rect.left + inset + Math.max(1, filledWidth / 2), rect.top + rect.height / 2),
          background: documentPoint(rect.left + inset + filledWidth + (innerWidth - filledWidth) / 2, rect.top + rect.height / 2),
        });
      }
    }
    return output;
  });
  const screenshot = decodeScreenshotPng(await page.screenshot({ fullPage: true }));
  return Object.freeze(probes.map((probe) => {
    const points = probe.mode === "points"
      ? Object.freeze({ foreground: probe.foreground, background: probe.background })
      : findRenderedPixelPair(screenshot, probe);
    const foreground = screenshot.pixel(points.foreground.x, points.foreground.y);
    const background = screenshot.pixel(points.background.x, points.background.y);
    const foregroundColor = pixelCss(foreground);
    const backgroundColor = pixelCss(background);
    return Object.freeze({
      category: probe.category,
      state,
      kind: "non-text" as const,
      variant: probe.variant,
      sampleMotionSource,
      sampleMethod: "rendered-pixel-pair" as const,
      samplePoints: Object.freeze({
        foreground: Object.freeze({ ...points.foreground }),
        background: Object.freeze({ ...points.background }),
      }),
      stateProof,
      selector: probe.selector,
      foregroundColor,
      backgroundColor,
      contrastRatio: rounded(measuredContrastRatio(foregroundColor, backgroundColor)),
    });
  }));
}

async function measureContrastState(
  page: Page,
  state: ContrastMeasurement["state"],
  sampleMotionSource: ContrastMeasurement["sampleMotionSource"],
): Promise<readonly ContrastMeasurement[]> {
  const stateProof = await measureContrastStateProof(page);
  const measurements = await page.evaluate(({ activeState, activeMotionSource }) => {
    type BrowserMeasurement = {
      category: ContrastMeasurement["category"];
      state: ContrastMeasurement["state"];
      kind: ContrastMeasurement["kind"];
      variant: string | null;
      sampleMotionSource: ContrastMeasurement["sampleMotionSource"];
      sampleMethod: "computed-style";
      samplePoints: null;
      selector: string;
      foregroundColor: string;
      backgroundColor: string;
      contrastRatio: number;
    };
    const parse = (input: string): [number, number, number, number] => {
      const match = input.match(/rgba?\(([^)]+)\)/i);
      if (match !== null) {
        const values = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
        return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
      }
      const srgb = input.match(/color\(srgb\s+([^)]*)\)/i);
      if (srgb !== null) {
        const values = srgb[1]!.split(/[ /]+/).filter(Boolean).map(Number);
        return [
          (values[0] ?? 0) * 255,
          (values[1] ?? 0) * 255,
          (values[2] ?? 0) * 255,
          values[3] ?? 1,
        ];
      }
      throw new Error(`unsupported computed color ${input}`);
    };
    const composite = (
      foreground: [number, number, number, number],
      background: [number, number, number, number],
    ): [number, number, number, number] => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
        alpha,
      ];
    };
    const opaque = (color: [number, number, number, number]): [number, number, number] => {
      const flattened = composite(color, [255, 255, 255, 1]);
      return [flattened[0], flattened[1], flattened[2]];
    };
    const luminance = (color: [number, number, number]): number => {
      const components = color.map((component) => {
        const value = component / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
    };
    const ratio = (foreground: string, background: string): number => {
      const opaqueBackground = opaque(parse(background));
      const renderedForeground = composite(
        parse(foreground),
        [opaqueBackground[0], opaqueBackground[1], opaqueBackground[2], 1],
      );
      const foregroundLuminance = luminance(opaque(renderedForeground));
      const backgroundLuminance = luminance(opaqueBackground);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
        rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector<HTMLElement>("[data-runner-view]");
    if (root === null) throw new Error("runner contrast root is absent");
    const effectiveBackground = (element: HTMLElement): string => {
      let compositeBackground: [number, number, number, number] = [255, 255, 255, 1];
      const layers: [number, number, number, number][] = [];
      for (let current: HTMLElement | null = element; current !== null; current = current.parentElement) {
        const color = parse(getComputedStyle(current).backgroundColor);
        if (color[3] > 0) layers.push(color);
      }
      for (const color of layers.reverse()) compositeBackground = composite(color, compositeBackground);
      const [red, green, blue] = opaque(compositeBackground);
      return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
    };
    const output: BrowserMeasurement[] = [];
    let serial = 0;
    const selectorName = (category: string, element: HTMLElement): string => {
      serial += 1;
      if (element.id !== "") return `#${element.id}`;
      for (const attribute of [
        "data-runner-live-status", "data-runner-live-alert", "data-runner-player",
        "data-runner-entity-id", "data-runner-lane", "data-runner-progress",
        "data-runner-semantic-lane", "data-runner-remap", "data-runner-fault-return-title",
      ]) {
        if (element.hasAttribute(attribute)) {
          const value = element.getAttribute(attribute);
          return value === "" ? `[${attribute}]` : `[${attribute}="${value}"]`;
        }
      }
      return `${category}:${element.tagName.toLowerCase()}:${serial}`;
    };
    const addText = (category: ContrastMeasurement["category"], element: Element): void => {
      if (!visible(element) || (element.textContent?.trim() ?? "") === "") return;
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize) || 0;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const authoredFontSize = fontSize / (Number(root.dataset.textScale) || 1);
      const kind: ContrastMeasurement["kind"] =
        authoredFontSize >= 24 || (authoredFontSize >= 18.66 && fontWeight >= 700)
          ? "large-text"
          : "normal-text";
      const background = effectiveBackground(element);
      output.push({
        category, state: activeState, kind, variant: null, sampleMotionSource: activeMotionSource,
        sampleMethod: "computed-style", samplePoints: null,
        selector: selectorName(category, element),
        foregroundColor: style.color, backgroundColor: background,
        contrastRatio: ratio(style.color, background),
      });
    };
    const addNonText = (
      category: ContrastMeasurement["category"],
      element: Element | null,
      colorProperty:
        | "borderTopColor" | "borderBottomColor" | "borderLeftColor" | "outlineColor" | "color"
        | "backgroundColor" | "accentColor",
      backgroundElement?: HTMLElement | null,
      variant: string | null = null,
    ): void => {
      if (element === null || !visible(element)) return;
      const style = getComputedStyle(element);
      const borderGeometry = colorProperty === "borderTopColor"
        ? [style.borderTopStyle, style.borderTopWidth]
        : colorProperty === "borderBottomColor"
          ? [style.borderBottomStyle, style.borderBottomWidth]
          : colorProperty === "borderLeftColor"
            ? [style.borderLeftStyle, style.borderLeftWidth]
            : null;
      if (
        borderGeometry !== null &&
        (borderGeometry[0] === "none" || (Number.parseFloat(borderGeometry[1] ?? "0") || 0) <= 0)
      ) return;
      const foreground = style[colorProperty];
      const background = effectiveBackground(backgroundElement ?? element);
      output.push({
        category, state: activeState, kind: "non-text", variant,
        sampleMotionSource: activeMotionSource,
        sampleMethod: "computed-style", samplePoints: null,
        selector: selectorName(category, element),
        foregroundColor: foreground, backgroundColor: background,
        contrastRatio: ratio(foreground, background),
      });
    };
    const specialized = [
      ["warning", ".col-runner-warning-lane"],
      ["status", "[data-runner-live-status]"],
      ["alert", "[data-runner-live-alert]"],
      ["dialog", ".col-runner-binding-dialog h3, .col-runner-binding-dialog p, .col-runner-binding-dialog label, .col-runner-binding-dialog kbd"],
      ["completion", ".col-runner-completion h3, .col-runner-completion p"],
      ["fault", ".col-runner-fault h3, .col-runner-fault p"],
      ["progress", ".col-runner-progress label"],
    ] as const;
    for (const [category, selector] of specialized) {
      root.querySelectorAll(selector).forEach((element) => addText(category, element));
    }
    root.querySelectorAll("h2, h3, p, dt, dd, label, output, legend, kbd, span")
      .forEach((element) => addText("text", element));
    root.querySelectorAll("button:not([disabled])").forEach((element) => {
      addText("control", element);
      addNonText("control", element, "borderTopColor");
    });
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (focused !== null && visible(focused)) {
      const focusStyle = getComputedStyle(focused);
      if (focusStyle.outlineStyle !== "none" && Number.parseFloat(focusStyle.outlineWidth) >= 2) {
        addNonText("focus", focused, "outlineColor", focused.parentElement);
      }
    }
    for (const [category, selector, colorProperty] of [
      ["warning", ".col-runner-warning-lane", "borderTopColor"],
      ["status", "[data-runner-live-status]", "borderLeftColor"],
      ["alert", "[data-runner-live-alert]", "borderLeftColor"],
      ["dialog", ".col-runner-binding-dialog", "borderTopColor"],
      ["completion", ".col-runner-completion", "borderTopColor"],
      ["fault", ".col-runner-fault", "borderTopColor"],
    ] as const) {
      root.querySelectorAll(selector).forEach((element) =>
        addNonText(category, element, colorProperty));
    }
    return output;
  }, { activeState: state, activeMotionSource: sampleMotionSource });
  const computed = measurements.map((measurement) => ({
    ...measurement,
    stateProof,
    contrastRatio: rounded(measurement.contrastRatio),
  }));
  return Object.freeze([
    ...computed,
    ...await measureRenderedGraphicContrast(page, state, sampleMotionSource, stateProof),
  ]);
}

async function measureAccessibilityTree(
  page: Page,
): Promise<AccessibilityTreeObservation> {
  const session = await page.context().newCDPSession(page);
  const documentResult = await session.send("DOM.getDocument", { depth: 0 }) as {
    readonly root: { readonly nodeId: number };
  };
  const observeSelector = async (
    selector: string,
  ): Promise<readonly AccessibilityNodeObservation[]> => {
    const result = await session.send("DOM.querySelectorAll", {
      nodeId: documentResult.root.nodeId,
      selector,
    }) as { readonly nodeIds: readonly number[] };
    const observations: AccessibilityNodeObservation[] = [];
    for (const [index, nodeId] of result.nodeIds.entries()) {
      const described = await session.send("DOM.describeNode", { nodeId }) as {
        readonly node: { readonly backendNodeId: number };
      };
      const partial = await session.send("Accessibility.getPartialAXTree", {
        backendNodeId: described.node.backendNodeId,
        fetchRelatives: false,
      }) as {
        readonly nodes: readonly {
          readonly backendDOMNodeId?: number;
          readonly ignored: boolean;
          readonly role?: { readonly value?: unknown };
          readonly name?: { readonly value?: unknown };
        }[];
      };
      const node = partial.nodes.find(({ backendDOMNodeId }) =>
        backendDOMNodeId === described.node.backendNodeId) ?? partial.nodes[0];
      observations.push(Object.freeze({
        selector: result.nodeIds.length === 1 ? selector : `${selector}:nth(${index})`,
        role: typeof node?.role?.value === "string" ? node.role.value : "",
        name: typeof node?.name?.value === "string" ? node.name.value : "",
        ignored: node?.ignored ?? true,
      }));
    }
    return Object.freeze(observations);
  };
  const [runnerRegion, scoreOutputs, semanticChoices, playfields, movingEntities] =
    await Promise.all([
      observeSelector("[data-runner-view]"),
      observeSelector("[data-runner-score-output]"),
      observeSelector("[data-runner-semantic-lane]"),
      observeSelector("[data-runner-play-surface]"),
      observeSelector("[data-runner-entity-id]"),
    ]);
  if (runnerRegion.length !== 1 || playfields.length !== 1) {
    fail("presentation accessibility tree omitted its runner or playfield root");
  }
  const playfieldDom = await session.send("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector: "[data-runner-play-surface]",
  }) as { readonly nodeId: number };
  if (playfieldDom.nodeId === 0) fail("presentation AX traversal omitted the playfield DOM root");
  const playfieldDescription = await session.send("DOM.describeNode", {
    nodeId: playfieldDom.nodeId,
  }) as { readonly node: { readonly backendNodeId: number } };
  const fullTree = await session.send("Accessibility.getFullAXTree", {}) as {
    readonly nodes: readonly {
      readonly nodeId: string;
      readonly childIds?: readonly string[];
      readonly backendDOMNodeId?: number;
      readonly ignored: boolean;
    }[];
  };
  const fullById = new Map(fullTree.nodes.map((node) => [node.nodeId, node]));
  const playfieldFullNode = fullTree.nodes.find(({ backendDOMNodeId }) =>
    backendDOMNodeId === playfieldDescription.node.backendNodeId);
  const playfieldDescendants: (typeof fullTree.nodes)[number][] = [];
  const pending = [...(playfieldFullNode?.childIds ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = fullById.get(nodeId);
    if (node === undefined) continue;
    playfieldDescendants.push(node);
    pending.push(...(node.childIds ?? []));
  }
  return Object.freeze({
    provenance: "chromium-cdp-accessibility-tree-v1",
    playfieldTraversal: "chromium-cdp-full-ax-subtree-v1",
    runnerRegion: runnerRegion[0]!,
    scoreOutputs,
    semanticChoices,
    playfield: playfields[0]!,
    movingEntityDomCount: movingEntities.length,
    movingEntities,
    playfieldAxDescendantCount: playfieldDescendants.length,
    unexpectedExposedPlayfieldNodeCount: playfieldDescendants.filter(({ ignored }) =>
      !ignored).length,
  });
}

async function measurePresentation(
  page: Page,
  contrastMeasurements: readonly ContrastMeasurement[],
): Promise<PresentationCell["observations"]> {
  const accessibilityTree = await measureAccessibilityTree(page);
  return page.evaluate(() => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const region = document.querySelector<HTMLElement>("[data-runner-view]")!;
    const player = document.querySelector<HTMLElement>("[data-runner-player]")!;
    const regionStyle = getComputedStyle(region);
    const documentStyle = getComputedStyle(document.documentElement);
    const playerStyle = getComputedStyle(player);
    const playfield = document.querySelector<HTMLElement>("[data-runner-play-surface]")!;
    const playfieldStyle = getComputedStyle(playfield);
    const targets = [...region.querySelectorAll("button:not([disabled])")].filter(visible)
      .map((element) => element.getBoundingClientRect());
    const textCandidates = [...region.querySelectorAll("button, output, dt, dd, legend, label, p, h2, h3, span")]
      .filter(visible);
    const scoreOutputs = [...region.querySelectorAll<HTMLOutputElement>("[data-runner-score-output]")];
    const fieldset = region.querySelector("[data-runner-semantic]");
    const semanticChoices = [...region.querySelectorAll<HTMLElement>("[data-runner-semantic-lane]")];
    const statusRegions = [...region.querySelectorAll<HTMLElement>("[data-runner-live-status]")];
    const alertRegions = [...region.querySelectorAll<HTMLElement>("[data-runner-live-alert]")];
    const statusRegion = statusRegions[0] ?? null;
    const alertRegion = alertRegions[0] ?? null;
    const laneSummary = region.querySelector<HTMLElement>('[data-runner-summary="lane"]');
    const entityField = region.querySelector<HTMLElement>(".col-runner-entity-field");
    const worldStyle = getComputedStyle(region.querySelector("[data-runner-scroll-layer=far]")!);
    const semanticTree = {
      runnerRegionElement: region.tagName,
      runnerRegionAccessibleName: document.getElementById(region.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() ?? "",
      summaryElement: region.querySelector(".col-runner-summary")?.tagName ?? "",
      summaryTermCount: region.querySelectorAll(".col-runner-summary dt").length,
      summaryDescriptionCount: region.querySelectorAll(".col-runner-summary dd").length,
      scoreOutputCount: scoreOutputs.length,
      scoreOutputNames: scoreOutputs.map((output) => output.getAttribute("aria-label") ?? ""),
      progressElement: region.querySelector("[data-runner-progress]")?.tagName ?? "",
      progressAccessibleName: region.querySelector("label[for=runner-laboratory-progress]")?.textContent?.trim() ?? "",
      playfieldAriaHidden: playfield.getAttribute("aria-hidden") ?? "",
      playfieldFocusableDescendantCount: playfield.querySelectorAll("a[href],button,input,select,textarea,[tabindex]").length,
      decisionElement: fieldset?.tagName ?? "",
      decisionLegendPresent: fieldset?.querySelector("legend") !== null,
      semanticChoiceCount: semanticChoices.length,
      semanticChoiceLabelsContainUrgency: semanticChoices.length === 3 && semanticChoices.every((choice) =>
        /Urgency:.*(?:ticks|ms)/i.test(choice.getAttribute("aria-label") ?? "")),
      laneSummaryAriaLive: laneSummary?.getAttribute("aria-live") ?? "",
      statusRegionCount: statusRegions.length,
      statusRegionRole: statusRegion?.getAttribute("role") ?? "",
      statusRegionPoliteness: statusRegion?.getAttribute("aria-live") ?? "",
      statusRegionAtomic: statusRegion?.getAttribute("aria-atomic") ?? "",
      alertRegionCount: alertRegions.length,
      alertRegionRole: alertRegion?.getAttribute("role") ?? "",
      alertRegionPoliteness: alertRegion?.getAttribute("aria-live") ?? "",
      alertRegionAtomic: alertRegion?.getAttribute("aria-atomic") ?? "",
    };
    return {
      horizontalOverflowCssPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      clippedTextCssPx: textCandidates.reduce((maximum, element) => Math.max(
        maximum,
        element.scrollWidth - element.clientWidth,
        element.scrollHeight - element.clientHeight,
      ), 0),
      minimumTargetWidthCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ width }) => width)),
      minimumTargetHeightCssPx: targets.length === 0 ? 0 : Math.min(...targets.map(({ height }) => height)),
      forcedColorsActive: matchMedia("(forced-colors: active)").matches,
      forcedColorAdjust: playfieldStyle.forcedColorAdjust,
      effectiveContrastMode: region.dataset.contrast === "high" ? "high" as const : "standard" as const,
      effectiveTextScale: region.dataset.textScale ?? "",
      effectiveTextScaleRatio: Math.round(
        ((Number.parseFloat(regionStyle.fontSize) || 0) /
          (Number.parseFloat(documentStyle.fontSize) || 1)) * 1_000,
      ) / 1_000,
      effectiveReducedMotion: region.dataset.motionReduced === "true",
      entityFieldDisplayed: entityField !== null && visible(entityField),
      worldTransform: worldStyle.transform,
      worldAnimationName: worldStyle.animationName,
      playerAnimationName: playerStyle.animationName,
      semanticTree,
    };
  }).then((observation) => {
    const worst = (kind: ContrastMeasurement["kind"]): ContrastMeasurement => {
      const candidates = contrastMeasurements.filter((measurement) => measurement.kind === kind);
      if (candidates.length === 0) fail(`presentation omitted ${kind} contrast samples`);
      return candidates.reduce((minimum, candidate) =>
        candidate.contrastRatio < minimum.contrastRatio ? candidate : minimum);
    };
    const normalWorst = worst("normal-text");
    const largeWorst = worst("large-text");
    const nonTextWorst = worst("non-text");
    const categoryOrder: ContrastMeasurement["category"][] = [
      "text", "control", "focus", "warning", "status", "alert", "dialog", "completion",
      "fault", "player", "entity", "lane", "progress",
    ];
    const categories = categoryOrder.filter((category) =>
      contrastMeasurements.some((measurement) => measurement.category === category));
    return {
      ...observation,
      accessibilityTree,
      normalTextContrastRatio: normalWorst.contrastRatio,
      largeTextContrastRatio: largeWorst.contrastRatio,
      nonTextContrastRatio: nonTextWorst.contrastRatio,
      contrastMeasurements: contrastMeasurements.map((measurement) => ({ ...measurement })),
      contrastCategories: categories,
      worstNormalTextSample: normalWorst.selector,
      worstLargeTextSample: largeWorst.selector,
      worstNonTextSample: nonTextWorst.selector,
    };
  });
}

async function collectAllContrastStates(
  browser: Browser,
  baseUrl: string,
  faultHarnessUrl: string,
  configuration: Omit<RunnerPageConfiguration, "controlMode">,
  runningPage: Page,
): Promise<readonly ContrastMeasurement[]> {
  await runningPage.keyboard.press("ArrowLeft");
  const measurements: ContrastMeasurement[] = [
    ...await measureContrastState(runningPage, "running", configuration.motionSource),
  ];
  const entityGraphics = await createRunnerPage(browser, baseUrl, {
    ...configuration,
    motionSource: "normal",
    controlMode: "automatic-assist",
  });
  await executeWithAllSettledCleanup(async () => {
    await entityGraphics.page.locator("#runner-start-button").click();
    const observedVariants = new Set(measurements
      .filter(({ category }) => category === "entity")
      .map(({ variant }) => variant));
    const requiredVariants = ["benefit", "hazard", "opportunity"] as const;
    for (
      let guard = 0;
      guard < 80 && !requiredVariants.every((variant) => observedVariants.has(variant));
      guard += 1
    ) {
      const visibleVariants = await entityGraphics.page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>("[data-runner-play-surface]");
        if (surface === null) return [];
        const bounds = surface.getBoundingClientRect();
        return ["benefit", "hazard", "opportunity"].filter((variant) =>
          [...document.querySelectorAll<HTMLElement>(`.col-runner-entity--${variant}`)]
            .some((entity) => {
              const rect = entity.getBoundingClientRect();
              return rect.right > bounds.left && rect.left < bounds.right &&
                rect.bottom > bounds.top && rect.top < bounds.bottom;
            }));
      });
      if (visibleVariants.some((variant) => !observedVariants.has(variant))) {
        const samples = await measureContrastState(entityGraphics.page, "running", "normal");
        const entitySamples = samples.filter(({ category }) => category === "entity");
        measurements.push(...entitySamples);
        entitySamples.forEach(({ variant }) => observedVariants.add(variant));
      }
      if (!requiredVariants.every((variant) => observedVariants.has(variant))) {
        await entityGraphics.page.clock.runFor(500);
      }
    }
  }, () => [() => entityGraphics.context.close()]);
  if (!measurements.some(({ category, variant }) =>
    category === "entity" && variant === "opportunity")) {
    const opportunityGraphics = await createRunnerPage(browser, baseUrl, {
      ...configuration,
      motionSource: "normal",
      controlMode: "semantic-assist",
    });
    await executeWithAllSettledCleanup(async () => {
      await opportunityGraphics.page.locator("#runner-start-button").click();
      for (let guard = 0; guard < 80; guard += 1) {
        const opportunityVisible = await opportunityGraphics.page.evaluate(() => {
          const surface = document.querySelector<HTMLElement>("[data-runner-play-surface]");
          if (surface === null) return false;
          const bounds = surface.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>(".col-runner-entity--opportunity")]
            .some((entity) => {
              const rect = entity.getBoundingClientRect();
              return rect.right > bounds.left && rect.left < bounds.right &&
                rect.bottom > bounds.top && rect.top < bounds.bottom;
            });
        });
        if (opportunityVisible) {
          measurements.push(...(await measureContrastState(
            opportunityGraphics.page,
            "running",
            "normal",
          )).filter(({ category, variant }) => category === "entity" && variant === "opportunity"));
          break;
        }
        await opportunityGraphics.page.clock.runFor(250);
      }
    }, () => [() => opportunityGraphics.context.close()]);
  }
  const observedEntityVariants = new Set(measurements
    .filter(({ category }) => category === "entity")
    .map(({ variant }) => variant));
  if (!["benefit", "hazard", "opportunity"].every((variant) => observedEntityVariants.has(variant))) {
    fail(
      "authentic running states omitted visible benefit, hazard, or opportunity graphics; " +
        `observed ${[...observedEntityVariants].sort().join(", ") || "none"}`,
    );
  }
  const dialog = await createRunnerPage(browser, baseUrl, {
    ...configuration,
    controlMode: "manual",
  });
  await executeWithAllSettledCleanup(async () => {
    await dialog.page.locator("#runner-start-button").click();
    await dialog.page.clock.runFor(40);
    await dialog.page.locator("[data-runner-configure-bindings]").click();
    await dialog.page.locator(".col-runner-binding-dialog").waitFor({ state: "visible" });
    await dialog.page.keyboard.press("ArrowLeft");
    measurements.push(...await measureContrastState(dialog.page, "dialog", configuration.motionSource));
  }, () => [() => dialog.context.close()]);

  const completion = await createRunnerPage(browser, baseUrl, {
    ...configuration,
    controlMode: "automatic-assist",
  });
  await executeWithAllSettledCleanup(async () => {
    await advanceToCompletion(completion.page, "automatic-assist");
    await completion.page.keyboard.press("ArrowLeft");
    measurements.push(...await measureContrastState(
      completion.page,
      "completion",
      configuration.motionSource,
    ));
  }, () => [() => completion.context.close()]);

  const faultContext = await browser.newContext({
    viewport: configuration.viewport,
    forcedColors: configuration.contrast === "forced-colors" ? "active" : "none",
    reducedMotion: configuration.motionSource === "os-reduced" ? "reduce" : "no-preference",
  });
  await executeWithAllSettledCleanup(async () => {
    const faultPage = await faultContext.newPage();
    await faultPage.clock.install({ time: new Date() });
    const url = new URL(faultHarnessUrl);
    url.searchParams.set("contrast", configuration.contrast === "high" ? "high" : "standard");
    url.searchParams.set("textScalePercent", String(configuration.textScalePercent));
    url.searchParams.set("motionReduced", String(configuration.motionSource !== "normal"));
    await faultPage.goto(url.toString(), { waitUntil: "networkidle" });
    await faultPage.locator("[data-runner-harness-ready]").waitFor({ state: "attached" });
    await pauseRunnerBrowserClock(faultPage);
    await faultPage.clock.runFor(1_001);
    await faultPage.evaluate(() =>
      (window as any).__runnerBrowserHarness.emitWitness("actionable-error-with-recovery-action"));
    await faultPage.clock.runFor(1_001);
    await faultPage.locator(".col-runner-fault").waitFor({ state: "visible" });
    await faultPage.keyboard.press("ArrowLeft");
    measurements.push(...await measureContrastState(faultPage, "fault", configuration.motionSource));
  }, () => [() => faultContext.close()]);
  return measurements;
}

export async function collectPresentationCells(
  browser: Browser,
  baseUrl: string,
  fixture: any,
  root: string,
): Promise<PresentationCell[]> {
  const matrix = fixture.accessibility.browserMatrix.presentationMatrix;
  const cells: PresentationCell[] = [];
  const contrastHarness = await startHarnessServer(root);
  return executeWithAllSettledCleanup(async () => {
  for (const viewport of matrix.viewports as RunnerBrowserViewport[]) {
    for (const textScalePercent of matrix.textScalePercent as number[]) {
      for (const contrast of matrix.contrast as RunnerPageConfiguration["contrast"][]) {
        for (const motionSource of matrix.motionSource as RunnerPageConfiguration["motionSource"][]) {
          const { context, page } = await createRunnerPage(browser, baseUrl, {
            viewport,
            textScalePercent,
            contrast,
            motionSource,
            controlMode: "semantic-assist",
          });
          await executeWithAllSettledCleanup(async () => {
            await page.locator("#runner-start-button").click();
            for (
              let guard = 0;
              guard < 4 && !(await page.locator('[data-runner-semantic-lane="0"]').isVisible());
              guard += 1
            ) {
              await page.clock.runFor(4_000);
            }
            const contrastMeasurements = await collectAllContrastStates(
              browser,
              baseUrl,
              contrastHarness.url,
              { viewport, textScalePercent, contrast, motionSource },
              page,
            );
            const observations = await measurePresentation(page, contrastMeasurements);
            cells.push({
              group: "presentation",
              cellId: `presentation:${viewport.width}x${viewport.height}:${textScalePercent}:${contrast}:${motionSource}`,
              viewport: { ...viewport },
              textScalePercent,
              contrast,
              motionSource,
              observations,
              thresholds: {
                maximumHorizontalOverflowCssPx: 0,
                maximumClippedTextCssPx: 0,
                minimumTargetCssPx: 44,
                minimumNormalTextContrastRatio: 4.5,
                minimumLargeTextContrastRatio: 4.5,
                minimumNonTextContrastRatio: 3,
                forcedColorsTreatmentRequired: contrast === "forced-colors",
                effectiveReducedMotionRequired: motionSource !== "normal",
                playfieldExcludedFromAccessibilityTree: true,
                scoreOutputCount: 3,
                summaryFieldCount: 4,
                semanticChoiceCount: 3,
              },
            });
          }, () => [() => context.close()]);
        }
      }
    }
  }
  return cells;
  }, () => [() => contrastHarness.close()]);
}

function rectFromDomRect(rectangle: DOMRect): RectangleObservation {
  return {
    top: rounded(rectangle.top),
    right: rounded(rectangle.right),
    bottom: rounded(rectangle.bottom),
    left: rounded(rectangle.left),
    width: rounded(rectangle.width),
    height: rounded(rectangle.height),
  };
}

async function measureSafeAreaOrientation(
  page: Page,
  orientation: "portrait" | "landscape",
): Promise<SafeAreaOrientationObservation> {
  await page.locator("[data-runner-control-cluster]").evaluate((element) => {
    (element as HTMLElement).scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.clock.runFor(1);
  const raw = await page.evaluate((activeOrientation) => {
    const view = document.querySelector<HTMLElement>("[data-runner-view]");
    const safeAreaContainer = document.querySelector<HTMLElement>(".col-shell");
    const cluster = document.querySelector<HTMLElement>("[data-runner-control-cluster]");
    const player = document.querySelector<HTMLElement>("[data-runner-player]");
    const playfield = document.querySelector<HTMLElement>("[data-runner-play-surface]");
    const placementControl = document.querySelector<HTMLElement>(
      "[data-runner-control-placement]",
    );
    if (
      view === null || safeAreaContainer === null || cluster === null || player === null ||
      playfield === null || placementControl === null
    ) {
      throw new Error("runner safe-area controls are absent");
    }
    const buttons = [...cluster.querySelectorAll<HTMLElement>(
      "button[data-runner-lane-command]",
    )];
    const visible = (element: HTMLElement): boolean => {
      const computed = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return computed.display !== "none" && computed.visibility !== "hidden" &&
        Number.parseFloat(computed.opacity || "1") > 0 && bounds.width > 0 && bounds.height > 0;
    };
    const interactiveControls = [...view.querySelectorAll<HTMLElement>(
      "button:not([disabled])",
    )].filter(visible);
    const viewBounds = view.getBoundingClientRect();
    const playerBounds = player.getBoundingClientRect();
    const playfieldBounds = playfield.getBoundingClientRect();
    const clusterBounds = cluster.getBoundingClientRect();
    const buttonBounds = buttons.map((button) => button.getBoundingClientRect());
    const interactiveControlBounds = interactiveControls.map((control) =>
      control.getBoundingClientRect());
    const overlapArea = (left: DOMRect, right: DOMRect): number =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const style = getComputedStyle(safeAreaContainer);
    const rectangle = (value: DOMRect) => ({
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      left: value.left,
      width: value.width,
      height: value.height,
    });
    return {
      orientation: activeOrientation,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      clusterCount: document.querySelectorAll("[data-runner-control-cluster]").length,
      clusterPlacement: cluster.dataset.runnerControlCluster ?? "",
      placementControlValue: placementControl.dataset.runnerControlPlacement ?? "",
      placementControlLabel: placementControl.textContent?.trim() ?? "",
      safeAreaContainerSelector: ".col-shell" as const,
      viewRect: rectangle(viewBounds),
      playerRect: rectangle(playerBounds),
      playfieldRect: rectangle(playfieldBounds),
      clusterRect: rectangle(clusterBounds),
      buttonRects: buttonBounds.map(rectangle),
      visibleInteractiveControlCount: interactiveControlBounds.length,
      interactiveControlRects: interactiveControlBounds.map(rectangle),
      playerControlOverlapCssPx2: interactiveControlBounds.reduce(
        (total, bounds) => total + overlapArea(playerBounds, bounds),
        0,
      ),
      computedPaddingCssPx: {
        top: Number.parseFloat(style.paddingTop),
        right: Number.parseFloat(style.paddingRight),
        bottom: Number.parseFloat(style.paddingBottom),
        left: Number.parseFloat(style.paddingLeft),
      },
      horizontalOverflowCssPx: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      viewportEscapeCssPx: Math.max(
        0,
        ...[clusterBounds, ...buttonBounds].flatMap((rect) => [
          -rect.left,
          -rect.top,
          rect.right - window.innerWidth,
          rect.bottom - window.innerHeight,
        ]),
      ),
    };
  }, orientation);
  return Object.freeze({
    ...raw,
    orientation,
    viewport: { ...raw.viewport },
    viewRect: rectFromDomRect(raw.viewRect as DOMRect),
    playerRect: rectFromDomRect(raw.playerRect as DOMRect),
    playfieldRect: rectFromDomRect(raw.playfieldRect as DOMRect),
    clusterRect: rectFromDomRect(raw.clusterRect as DOMRect),
    buttonRects: raw.buttonRects.map((rectangle) =>
      rectFromDomRect(rectangle as DOMRect)),
    interactiveControlRects: raw.interactiveControlRects.map((rectangle) =>
      rectFromDomRect(rectangle as DOMRect)),
    computedPaddingCssPx: { ...raw.computedPaddingCssPx },
  });
}

async function durableLaneCheckpoint(
  page: Page,
): Promise<DurableLaneCheckpointObservation> {
  return page.evaluate(() => {
    const encoded = localStorage.getItem("choice-of-life-v1-active-run");
    if (encoded === null) throw new TypeError("durable lane checkpoint is absent");
    const state = JSON.parse(encoded) as {
      readonly simulationTick?: unknown;
      readonly runner?: {
        readonly motion?: {
          readonly kind?: unknown;
          readonly currentLane?: unknown;
          readonly targetLane?: unknown;
        };
        readonly inputBuffer?: unknown;
      } | null;
    };
    const motion = state.runner?.motion;
    const inputBuffer = state.runner?.inputBuffer;
    if (
      typeof state.simulationTick !== "number" ||
      (motion?.kind !== "idle" && motion?.kind !== "moving") ||
      !Number.isInteger(motion.currentLane) || !Number.isInteger(motion.targetLane) ||
      ![null, "up", "down"].includes(inputBuffer as null | string)
    ) throw new TypeError("durable lane checkpoint is malformed");
    return {
      simulationTick: state.simulationTick,
      motionKind: motion.kind,
      currentLane: motion.currentLane as number,
      targetLane: motion.targetLane as number,
      inputBuffer: inputBuffer as "up" | "down" | null,
    };
  });
}

async function exerciseMultiPointerCancellation(
  page: Page,
): Promise<Readonly<{
  readonly recovered: boolean;
  readonly witness: MultiPointerCancellationObservation;
}>> {
  const laneBefore = await page.locator('[data-runner-summary="lane"]').textContent() ?? "";
  const durableBefore = await durableLaneCheckpoint(page);
  await page.locator("[data-runner-play-surface]").evaluate((element) => {
    (element as HTMLElement).scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.clock.runFor(1);
  const surface = await page.locator("[data-runner-play-surface]").boundingBox();
  if (surface === null) fail("runner play surface is absent for multi-pointer evidence");
  const x = surface.x + surface.width / 2;
  const lower = surface.y + surface.height * 0.75;
  const upper = surface.y + surface.height * 0.35;
  const session = await page.context().newCDPSession(page);
  const point = (id: number, y: number) => ({
    x,
    y,
    id,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(41, lower), point(42, lower - 8)],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.clock.runFor(600);
  const laneAfterCancellation =
    await page.locator('[data-runner-summary="lane"]').textContent() ?? "";
  const durableAfterCancellation = await durableLaneCheckpoint(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(43, lower)],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [point(43, upper)],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.clock.runFor(600);
  const laneAfterRecovery =
    await page.locator('[data-runner-summary="lane"]').textContent() ?? "";
  const durableAfterRecovery = await durableLaneCheckpoint(page);
  const cancellationPreserved =
    laneAfterCancellation === laneBefore &&
    durableAfterCancellation.simulationTick > durableBefore.simulationTick &&
    durableAfterCancellation.motionKind === "idle" &&
    durableAfterCancellation.currentLane === durableBefore.currentLane &&
    durableAfterCancellation.targetLane === durableBefore.targetLane &&
    durableAfterCancellation.inputBuffer === durableBefore.inputBuffer;
  const recoverySucceeded =
    laneAfterRecovery !== laneAfterCancellation && /Top lane/i.test(laneAfterRecovery) &&
    durableAfterRecovery.simulationTick > durableAfterCancellation.simulationTick &&
    durableAfterRecovery.motionKind === "idle" &&
    durableAfterRecovery.currentLane === 0 && durableAfterRecovery.targetLane === 0 &&
    durableAfterRecovery.inputBuffer === null;
  return Object.freeze({
    recovered: cancellationPreserved && recoverySucceeded,
    witness: Object.freeze({
      laneBefore,
      laneAfterCancellation,
      laneAfterRecovery,
      durableBefore: Object.freeze({ ...durableBefore }),
      durableAfterCancellation: Object.freeze({ ...durableAfterCancellation }),
      durableAfterRecovery: Object.freeze({ ...durableAfterRecovery }),
    }),
  });
}

export async function collectSafeAreaCells(
  browser: Browser,
  baseUrl: string,
  fixture: any,
): Promise<SafeAreaCell[]> {
  const matrix = fixture.accessibility.browserMatrix.safeAreaOneHandMatrix;
  const cells: SafeAreaCell[] = [];
  for (const viewport of matrix.mobileViewports as RunnerBrowserViewport[]) {
    for (const textScalePercent of matrix.textScalePercent as number[]) {
      for (const reach of matrix.reach as ("left" | "right")[]) {
        const { context, page } = await createRunnerPage(browser, baseUrl, {
          viewport,
          textScalePercent,
          contrast: "standard",
          motionSource: "normal",
          controlMode: "manual",
          safeAreaInsetsCssPx: SAFE_AREA_INSETS_CSS_PX,
        });
        await executeWithAllSettledCleanup(async () => {
          await page.locator("#runner-start-button").click();
          await page.clock.runFor(40);
          const multiPointerCancellation = await exerciseMultiPointerCancellation(page);
          if (reach === "left") {
            await page.locator("[data-runner-control-placement]").click();
          }
          const portrait = await measureSafeAreaOrientation(page, "portrait");
          await page.setViewportSize({ width: viewport.height, height: viewport.width });
          await page.clock.runFor(1);
          const landscape = await measureSafeAreaOrientation(page, "landscape");
          const cssEnvironmentSafeAreaSupported = await page.evaluate(() =>
            CSS.supports("padding-top: env(safe-area-inset-top, 0px)"));
          cells.push({
            group: "safeAreaOneHand",
            cellId: `safe-area:${viewport.width}x${viewport.height}:${textScalePercent}:${reach}`,
            viewport: { ...viewport },
            textScalePercent,
            reach,
            observations: {
              cssEnvironmentSafeAreaSupported,
              emulatedSafeAreaInsetsCssPx: { ...SAFE_AREA_INSETS_CSS_PX },
              orientations: { portrait, landscape },
              multiPointerCancellationRecovered: multiPointerCancellation.recovered,
              multiPointerCancellationWitness: multiPointerCancellation.witness,
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
        }, () => [() => context.close()]);
      }
    }
  }
  return cells;
}

async function focusedSelector(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null) return "";
    if (element.id) return `#${element.id}`;
    for (const attribute of [
      "data-runner-remap", "data-runner-close-bindings", "data-runner-configure-bindings",
      "data-runner-semantic-lane",
    ]) {
      if (element.hasAttribute(attribute)) {
        const value = element.getAttribute(attribute);
        return value === "" ? `[${attribute}]` : `[${attribute}=\"${value}\"]`;
      }
    }
    return element.tagName.toLowerCase();
  });
}

async function focusObservation(
  page: Page,
  action: string,
  modal: Partial<FocusCell["observations"]> = {},
): Promise<FocusCell["observations"]> {
  const selector = await focusedSelector(page);
  const indicator = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return {
        style: "none", width: 0, contrast: 0, visible: false, now: performance.now(),
        effectiveTextScale: "", effectiveTextScaleRatio: 0,
        rect: { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 },
        indicatorRect: { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 },
        escape: Number.POSITIVE_INFINITY, samples: 5, unobscured: 0,
        ringSamples: 4, unobscuredRing: 0, clippingAncestors: Number.POSITIVE_INFINITY,
      };
    }
    const parse = (input: string): [number, number, number, number] => {
      if (input === "transparent") return [0, 0, 0, 0];
      const match = input.match(/rgba?\(([^)]+)\)/i);
      if (match !== null) {
        const values = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
        return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
      }
      const srgb = input.match(/color\(srgb\s+([^)]*)\)/i);
      if (srgb !== null) {
        const values = srgb[1]!.split(/[ /]+/).filter(Boolean).map(Number);
        return [
          (values[0] ?? 0) * 255,
          (values[1] ?? 0) * 255,
          (values[2] ?? 0) * 255,
          values[3] ?? 1,
        ];
      }
      throw new Error(`unsupported focus color ${input}`);
    };
    const composite = (
      foreground: [number, number, number, number],
      background: [number, number, number, number],
    ): [number, number, number, number] => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
        alpha,
      ];
    };
    const opaque = (color: [number, number, number, number]): [number, number, number] => {
      const flattened = composite(color, [255, 255, 255, 1]);
      return [flattened[0], flattened[1], flattened[2]];
    };
    const luminance = (color: [number, number, number]): number => {
      const components = color.map((component) => {
        const value = component / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
    };
    const contrast = (left: string, right: string): number => {
      const background = opaque(parse(right));
      const foreground = opaque(composite(
        parse(left),
        [background[0], background[1], background[2], 1],
      ));
      const one = luminance(foreground);
      const two = luminance(background);
      return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    };
    const background = (target: HTMLElement): string => {
      let result: [number, number, number, number] = [255, 255, 255, 1];
      const layers: [number, number, number, number][] = [];
      for (let current: HTMLElement | null = target; current !== null; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        const parsed = parse(color);
        if (parsed[3] > 0) layers.push(parsed);
      }
      for (const layer of layers.reverse()) result = composite(layer, result);
      const [red, green, blue] = opaque(result);
      return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
    };
    const style = getComputedStyle(element);
    const runnerView = document.querySelector<HTMLElement>("[data-runner-view]");
    const runnerStyle = runnerView === null ? null : getComputedStyle(runnerView);
    const documentStyle = getComputedStyle(document.documentElement);
    const rect = element.getBoundingClientRect();
    const insetX = Math.min(8, rect.width / 4);
    const insetY = Math.min(8, rect.height / 4);
    const points: readonly [number, number][] = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + insetX, rect.top + rect.height / 2],
      [rect.right - insetX, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.top + insetY],
      [rect.left + rect.width / 2, rect.bottom - insetY],
    ];
    const unobscured = points.filter(([x, y]) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return hit === element || (hit instanceof Node && element.contains(hit));
    }).length;
    const width = Number.parseFloat(style.outlineWidth) || 0;
    const offset = Number.parseFloat(style.outlineOffset) || 0;
    const outerExtent = Math.max(0, width + offset);
    const ringDistance = Math.max(0, offset + width / 2);
    const indicatorRect = {
      top: rect.top - outerExtent,
      right: rect.right + outerExtent,
      bottom: rect.bottom + outerExtent,
      left: rect.left - outerExtent,
      width: rect.width + outerExtent * 2,
      height: rect.height + outerExtent * 2,
    };
    const ringPoints: readonly [number, number][] = [
      [rect.left + rect.width / 2, rect.top - ringDistance],
      [rect.right + ringDistance, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.bottom + ringDistance],
      [rect.left - ringDistance, rect.top + rect.height / 2],
    ];
    const unobscuredRing = ringPoints.filter(([x, y]) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return hit === element || (hit instanceof Node && element.contains(hit)) ||
        (hit instanceof HTMLElement && hit.contains(element));
    }).length;
    let clippingAncestors = 0;
    for (let current = element.parentElement; current !== null; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      const currentRect = current.getBoundingClientRect();
      const clipsX = currentStyle.overflowX !== "visible";
      const clipsY = currentStyle.overflowY !== "visible";
      if (
        (clipsX && (indicatorRect.left < currentRect.left || indicatorRect.right > currentRect.right)) ||
        (clipsY && (indicatorRect.top < currentRect.top || indicatorRect.bottom > currentRect.bottom))
      ) clippingAncestors += 1;
    }
    const indicatorContrast = contrast(style.outlineColor, background(element.parentElement ?? element));
    const escape = Math.max(
      0,
      -indicatorRect.left,
      -indicatorRect.top,
      indicatorRect.right - innerWidth,
      indicatorRect.bottom - innerHeight,
    );
    return {
      style: style.outlineStyle,
      width,
      contrast: indicatorContrast,
      visible: style.outlineStyle !== "none" && width >= 2 && indicatorContrast >= 3,
      effectiveTextScale: runnerView?.dataset.textScale ?? "",
      effectiveTextScaleRatio: Math.round(
        (((runnerStyle === null ? 0 : Number.parseFloat(runnerStyle.fontSize)) || 0) /
          (Number.parseFloat(documentStyle.fontSize) || 1)) * 1_000,
      ) / 1_000,
      now: performance.now(),
      rect: {
        top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
        width: rect.width, height: rect.height,
      },
      indicatorRect,
      escape,
      samples: points.length,
      unobscured,
      ringSamples: ringPoints.length,
      unobscuredRing,
      clippingAncestors,
    };
  });
  return {
    actualFocusedSelector: selector,
    trace: [{ action, selector, atMonotonicMilliseconds: rounded(indicator.now) }],
    effectiveTextScale: indicator.effectiveTextScale,
    effectiveTextScaleRatio: indicator.effectiveTextScaleRatio,
    focusIndicatorStyle: indicator.style,
    focusIndicatorWidthCssPx: rounded(indicator.width),
    focusIndicatorContrastRatio: rounded(indicator.contrast),
    focusIndicatorVisible: indicator.visible,
    focusedRect: {
      top: rounded(indicator.rect.top), right: rounded(indicator.rect.right),
      bottom: rounded(indicator.rect.bottom), left: rounded(indicator.rect.left),
      width: rounded(indicator.rect.width), height: rounded(indicator.rect.height),
    },
    focusIndicatorRect: {
      top: rounded(indicator.indicatorRect.top), right: rounded(indicator.indicatorRect.right),
      bottom: rounded(indicator.indicatorRect.bottom), left: rounded(indicator.indicatorRect.left),
      width: rounded(indicator.indicatorRect.width), height: rounded(indicator.indicatorRect.height),
    },
    focusedViewportEscapeCssPx: rounded(indicator.escape),
    obstructionSamplePoints: indicator.samples,
    unobscuredSamplePoints: indicator.unobscured,
    indicatorRingSamplePoints: indicator.ringSamples,
    unobscuredIndicatorRingSamplePoints: indicator.unobscuredRing,
    indicatorClippingAncestorCount: indicator.clippingAncestors,
    modalBackgroundInert: modal.modalBackgroundInert ?? null,
    forwardTrapSelector: modal.forwardTrapSelector ?? null,
    backwardTrapSelector: modal.backwardTrapSelector ?? null,
    invokerSelector: modal.invokerSelector ?? null,
    restoredInvokerSelector: modal.restoredInvokerSelector ?? null,
    runnerPauseSummary: await page.locator('[data-runner-summary="pause"]').textContent() ?? "",
  };
}

async function focusByKeyboard(page: Page, selector: string, maximumTabs = 24): Promise<void> {
  for (let index = 0; index < maximumTabs; index += 1) {
    if (await focusedSelector(page) === selector) return;
    await page.keyboard.press("Tab");
  }
  fail(`keyboard traversal did not reach ${selector}`);
}

export async function awaitRunnerPauseUi(
  page: Page,
  expectedSummary: string,
  resumeSelector: string,
  requireFocusedResume: boolean,
  label: string,
  maximumAnimationFrames = 8,
): Promise<void> {
  let lastSummary = "";
  let lastFocusedSelector = "";
  let lastResumeVisible = false;
  for (let frame = 0; frame < maximumAnimationFrames; frame += 1) {
    await page.clock.runFor(16);
    [lastSummary, lastFocusedSelector, lastResumeVisible] = await Promise.all([
      page.locator('[data-runner-summary="pause"]').textContent().then((value) => value ?? ""),
      focusedSelector(page),
      page.locator(resumeSelector).isVisible(),
    ]);
    if (
      lastSummary === expectedSummary &&
      lastResumeVisible &&
      (!requireFocusedResume || lastFocusedSelector === resumeSelector)
    ) return;
  }
  fail(
    `${label} did not publish its exact pause UI after ${maximumAnimationFrames} animation frames ` +
    `(summary=${JSON.stringify(lastSummary)}, focus=${JSON.stringify(lastFocusedSelector)}, ` +
    `resumeVisible=${String(lastResumeVisible)})`,
  );
}

async function awaitVisibilityOnlyPauseUi(
  page: Page,
  requireFocusedResume: boolean,
  label: string,
): Promise<void> {
  await awaitRunnerPauseUi(
    page,
    "page hidden",
    "#runner-visibility-resume-button",
    requireFocusedResume,
    label,
  );
  const [visibilityResumeVisible, focusResumeVisible] = await Promise.all([
    page.locator("#runner-visibility-resume-button").isVisible(),
    page.locator("#runner-focus-resume-button").isVisible(),
  ]);
  if (!visibilityResumeVisible || focusResumeVisible) {
    fail(
      `${label} did not coalesce to exactly one visibility Resume ` +
      `(visibilityResumeVisible=${String(visibilityResumeVisible)}, ` +
      `focusResumeVisible=${String(focusResumeVisible)})`,
    );
  }
}

export async function awaitRunnerUnpausedUi(
  page: Page,
  restorationSelector: string,
  label: string,
  maximumAnimationFrames = 8,
): Promise<void> {
  let lastSummary = "";
  let lastFocusedSelector = "";
  let visibilityResumeVisible = false;
  let focusResumeVisible = false;
  for (let frame = 0; frame < maximumAnimationFrames; frame += 1) {
    await page.clock.runFor(16);
    [
      lastSummary,
      lastFocusedSelector,
      visibilityResumeVisible,
      focusResumeVisible,
    ] = await Promise.all([
      page.locator('[data-runner-summary="pause"]').textContent().then((value) => value ?? ""),
      focusedSelector(page),
      page.locator("#runner-visibility-resume-button").isVisible(),
      page.locator("#runner-focus-resume-button").isVisible(),
    ]);
    if (
      lastSummary === "Not paused" &&
      !visibilityResumeVisible &&
      !focusResumeVisible &&
      lastFocusedSelector === restorationSelector
    ) return;
  }
  fail(
    `${label} did not restore exact unpaused UI after ${maximumAnimationFrames} animation frames ` +
    `(summary=${JSON.stringify(lastSummary)}, focus=${JSON.stringify(lastFocusedSelector)}, ` +
    `visibilityResumeVisible=${String(visibilityResumeVisible)}, ` +
    `focusResumeVisible=${String(focusResumeVisible)})`,
  );
}

function focusCell(
  transition: { transitionId: string; expectedFocus: string },
  observations: FocusCell["observations"],
): FocusCell {
  const modalOpen = transition.transitionId === "modal-open";
  const modalClose = transition.transitionId === "modal-close";
  return {
    group: "focus",
    cellId: `focus:${transition.transitionId}`,
    transitionId: transition.transitionId,
    expectedFocus: transition.expectedFocus,
    viewport: { width: 320, height: 568 },
    textScalePercent: 200,
    observations,
    thresholds: {
      requiredFocusedSelector: expectedFocusSelector(transition.transitionId),
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
      requiredPauseSummary: expectedPauseSummary(transition.transitionId),
    },
  };
}

export async function collectFocusCells(
  browser: Browser,
  baseUrl: string,
  fixture: any,
): Promise<FocusCell[]> {
  const transitions = new Map<string, any>(fixture.accessibility.browserMatrix.focusTransitions
    .map((transition: any) => [transition.transitionId, transition]));
  const cells = new Map<string, FocusCell>();
  const manual = await createRunnerPage(browser, baseUrl, {
    viewport: { width: 320, height: 568 }, textScalePercent: 200,
    contrast: "standard", motionSource: "normal", controlMode: "manual",
  });
  await executeWithAllSettledCleanup(async () => {
    if (await focusedSelector(manual.page) !== "#runner-start-button") {
      fail("production entry focus did not land on Start runner");
    }
    await manual.page.keyboard.press("Tab");
    if (await focusedSelector(manual.page) === "body") {
      fail("entry keyboard traversal left the application after Start runner");
    }
    await manual.page.keyboard.press("Shift+Tab");
    if (await focusedSelector(manual.page) !== "#runner-start-button") {
      fail("entry keyboard traversal did not return to Start runner");
    }
    cells.set("entry-to-start", focusCell(transitions.get("entry-to-start"), await focusObservation(manual.page, "runner-mounted")));
    await manual.page.keyboard.press("Enter");
    await manual.page.clock.runFor(40);
    cells.set("start-to-persistent-runner", focusCell(
      transitions.get("start-to-persistent-runner"),
      await focusObservation(manual.page, "native-start-activation"),
    ));
    await manual.page.keyboard.press("Escape");
    cells.set("user-pause-resume", focusCell(
      transitions.get("user-pause-resume"),
      await focusObservation(manual.page, "escape-outside-dialog-pauses"),
    ));
    await manual.page.keyboard.press("Enter");
    await awaitRunnerUnpausedUi(
      manual.page,
      "#runner-user-pause-button",
      "user Resume",
    );
    for (const eventOrder of ["hidden-then-blur", "blur-then-hidden"] as const) {
      await manual.page.evaluate((order) => {
        const hide = (): void => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        };
        const blur = (): void => {
          window.dispatchEvent(new Event("blur"));
        };
        if (order === "hidden-then-blur") {
          hide();
          blur();
        } else {
          blur();
          hide();
        }
      }, eventOrder);
      await awaitVisibilityOnlyPauseUi(
        manual.page,
        false,
        `${eventOrder} visibility interruption`,
      );
      await manual.page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      await awaitVisibilityOnlyPauseUi(
        manual.page,
        true,
        `${eventOrder} visibility return`,
      );
      if (eventOrder === "blur-then-hidden") {
        cells.set("visibility-pause-resume", focusCell(
          transitions.get("visibility-pause-resume"),
          await focusObservation(manual.page, "both-hidden-blur-event-orders"),
        ));
      }
      await manual.page.keyboard.press("Enter");
      await awaitRunnerUnpausedUi(
        manual.page,
        "#runner-user-pause-button",
        `${eventOrder} visibility Resume`,
      );
    }
    await manual.page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await awaitRunnerPauseUi(
      manual.page,
      "window focus interrupted",
      "#runner-focus-resume-button",
      false,
      "window blur interruption",
    );
    await manual.page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await awaitRunnerPauseUi(
      manual.page,
      "window focus interrupted",
      "#runner-focus-resume-button",
      true,
      "window focus return",
    );
    cells.set("focus-interruption-resume", focusCell(
      transitions.get("focus-interruption-resume"),
      await focusObservation(manual.page, "window-blur-focus-interruption"),
    ));
    await manual.page.keyboard.press("Enter");
    await awaitRunnerUnpausedUi(
      manual.page,
      "#runner-user-pause-button",
      "focus Resume",
    );
    const invoker = '[data-runner-configure-bindings]';
    await focusByKeyboard(manual.page, invoker);
    await manual.page.keyboard.press("Enter");
    const backgroundInert = await manual.page.locator("[data-runner-modal-background]").getAttribute("inert") !== null;
    const naturalModalFocus = await focusObservation(manual.page, "modal-open-natural-focus");
    await manual.page.keyboard.press("Shift+Tab");
    const backward = await focusedSelector(manual.page);
    await manual.page.keyboard.press("Tab");
    const forward = await focusedSelector(manual.page);
    cells.set("modal-open", focusCell(
      transitions.get("modal-open"),
      {
        ...naturalModalFocus,
        modalBackgroundInert: backgroundInert,
        forwardTrapSelector: forward,
        backwardTrapSelector: backward,
      },
    ));
    await manual.page.keyboard.press("Shift+Tab");
    await manual.page.keyboard.press("Enter");
    cells.set("modal-close", focusCell(
      transitions.get("modal-close"),
      await focusObservation(manual.page, "modal-close", {
        invokerSelector: invoker,
        restoredInvokerSelector: await focusedSelector(manual.page),
      }),
    ));
  }, () => [() => manual.context.close()]);

  const semantic = await createRunnerPage(browser, baseUrl, {
    viewport: { width: 320, height: 568 }, textScalePercent: 200,
    contrast: "standard", motionSource: "normal", controlMode: "semantic-assist",
  });
  await executeWithAllSettledCleanup(async () => {
    await semantic.page.keyboard.press("Enter");
    for (let guard = 0; guard < 4 && !(await semantic.page.locator('[data-runner-semantic-lane="0"]').isVisible()); guard += 1) {
      await semantic.page.clock.runFor(4_000);
    }
    cells.set("semantic-prompt-open", focusCell(
      transitions.get("semantic-prompt-open"),
      await focusObservation(semantic.page, "semantic-marker-open"),
    ));
    await semantic.page.keyboard.press("Enter");
    cells.set("semantic-choice-submit", focusCell(
      transitions.get("semantic-choice-submit"),
      await focusObservation(semantic.page, "semantic-choice-submit"),
    ));
  }, () => [() => semantic.context.close()]);

  const automatic = await createRunnerPage(browser, baseUrl, {
    viewport: { width: 320, height: 568 }, textScalePercent: 200,
    contrast: "standard", motionSource: "normal", controlMode: "automatic-assist",
  });
  await executeWithAllSettledCleanup(async () => {
    await automatic.page.keyboard.press("Enter");
    await automatic.page.clock.runFor(62_000);
    await automatic.page.locator("#runner-completion-heading").waitFor({ state: "visible", timeout: 15_000 });
    cells.set("completion", focusCell(
      transitions.get("completion"),
      await focusObservation(automatic.page, "automatic-completion"),
    ));
  }, () => [() => automatic.context.close()]);
  return [...cells.values()];
}

interface HarnessWrite {
  readonly region: "status" | "alert";
  readonly text: string;
  readonly writtenAtUtc: string;
  readonly atMonotonicMilliseconds: number;
}

export interface HarnessServer {
  readonly url: string;
  close(): Promise<void>;
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") fail("harness server did not bind a TCP port");
  return address.port;
}

export async function startHarnessServer(root: string): Promise<HarnessServer> {
  const buildDirectory = await mkdtemp(path.join(tmpdir(), "runner-browser-harness-"));
  const vite = await import("vite");
  const productionMinification = createProductionMinificationPipeline(
    AUDITED_PRODUCTION_MINIFICATION_APPROVED,
  );
  try {
    await vite.build({
      root,
      configFile: false,
      base: "./",
      mode: "production",
      logLevel: "silent",
      plugins: [...productionMinification.preTerserPlugins],
      build: {
        outDir: buildDirectory,
        emptyOutDir: true,
        minify: "terser",
        terserOptions: createProductionTerserOptions(
          productionMinification.propertyOptions,
        ),
        rollupOptions: {
          input: path.join(root, "scripts", "browser-fixtures", "runner-browser-harness.html"),
        },
      },
    });
  } catch (error) {
    await Promise.allSettled([rm(buildDirectory, { recursive: true, force: true })]);
    throw error;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = url.pathname === "/"
        ? "runner-browser-harness.html"
        : decodeURIComponent(url.pathname.slice(1));
      const candidate = path.resolve(buildDirectory, relative);
      const inside = candidate === buildDirectory || candidate.startsWith(`${buildDirectory}${path.sep}`);
      if (!inside || !(await stat(candidate)).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.setHeader("Content-Type", contentType(candidate));
      response.end(await readFile(candidate));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  let port: number;
  try {
    port = await listen(server);
  } catch (error) {
    await Promise.allSettled([
      server.listening
        ? new Promise<void>((resolve, reject) =>
          server.close((closeError) => closeError ? reject(closeError) : resolve()))
        : Promise.resolve(),
      rm(buildDirectory, { recursive: true, force: true }),
    ]);
    throw error;
  }
  return {
    url: `http://127.0.0.1:${port}/scripts/browser-fixtures/runner-browser-harness.html`,
    async close(): Promise<void> {
      await awaitAllSettledOrThrow([
        new Promise<void>((resolve, reject) =>
          server.close((error) => error ? reject(error) : resolve())),
        rm(buildDirectory, { recursive: true, force: true }),
      ] as const);
    },
  };
}

export async function collectAnnouncementCells(
  browser: Browser,
  root: string,
  fixture: any,
  artifactStartedAt: number,
): Promise<AnnouncementCell[]> {
  const harness = await startHarnessServer(root);
  let context: BrowserContext | undefined;
  return executeWithAllSettledCleanup(async () => {
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(Math.max(Date.now(), artifactStartedAt + 1)) });
    await page.goto(harness.url, { waitUntil: "networkidle" });
    await page.locator("[data-runner-harness-ready]").waitFor({ state: "attached" });
    await pauseRunnerBrowserClock(page);
    await page.clock.runFor(1_001);
    const witnessIds = fixture.accessibility.browserMatrix.liveRegions.announcementWitnesses as string[];
    const collected: {
      witnessId: string;
      write: HarnessWrite;
      previousWrite: HarnessWrite;
      transitionEvidence: HarnessWitnessProof;
    }[] = [];
    let previous: HarnessWrite | null = null;
    for (const witnessId of witnessIds) {
      const before = await page.evaluate(() => (window as any).__runnerBrowserHarness.writes().length) as number;
      await page.evaluate((id) => (window as any).__runnerBrowserHarness.emitWitness(id), witnessId);
      await page.clock.runFor(1_001);
      const transitionEvidence = await page.evaluate((id) =>
        (window as any).__runnerBrowserHarness.witnessProof(id), witnessId) as HarnessWitnessProof;
      const writes = await page.evaluate(() => (window as any).__runnerBrowserHarness.writes()) as HarnessWrite[];
      const candidates = writes.slice(before).filter(({ text }) => requiredAnnouncementPattern(witnessId).test(text));
      const write = candidates.at(-1);
      if (write === undefined) fail(`production announcement harness omitted ${witnessId}`);
      let writeIndex = -1;
      for (let index = writes.length - 1; index >= 0; index -= 1) {
        const candidate = writes[index]!;
        if (
          candidate.region === write.region && candidate.text === write.text &&
          candidate.atMonotonicMilliseconds === write.atMonotonicMilliseconds
        ) {
          writeIndex = index;
          break;
        }
      }
      let previousWrite: HarnessWrite | undefined;
      for (let index = writeIndex - 1; index >= 0; index -= 1) {
        if (writes[index]!.region === write.region) {
          previousWrite = writes[index]!;
          break;
        }
      }
      if (previousWrite === undefined) {
        fail(`production announcement harness omitted the prior timestamp for ${witnessId}`);
      }
      if (previous !== null && write.atMonotonicMilliseconds - previous.atMonotonicMilliseconds < 1_000) {
        fail(`production announcement harness violated throttle before ${witnessId}`);
      }
      collected.push({ witnessId, write, previousWrite, transitionEvidence });
      previous = write;
    }
    const behavior = await page.evaluate(async () =>
      (window as any).__runnerBrowserHarness.proveThrottleBehavior());
    await page.clock.runFor(2_002);
    const proof = await page.evaluate(() => (window as any).__runnerBrowserHarness.throttleProof()) as {
      latestMessageWinsObserved: boolean;
      duplicateSuppressionObserved: boolean;
      duplicateWriteCount: number;
    };
    void behavior;
    return collected.map(({ witnessId, write, previousWrite, transitionEvidence }) => {
      return {
        group: "announcements",
        cellId: `announcement:${witnessId}`,
        witnessId,
        observations: {
          region: write.region,
          text: write.text,
          writtenAtUtc: write.writtenAtUtc,
          atMonotonicMilliseconds: rounded(write.atMonotonicMilliseconds),
          previousWriteMonotonicMilliseconds: rounded(previousWrite.atMonotonicMilliseconds),
          intervalFromPreviousMilliseconds: rounded(
            write.atMonotonicMilliseconds - previousWrite.atMonotonicMilliseconds,
          ),
          duplicateWriteCount: proof.duplicateWriteCount,
          latestMessageWinsObserved: proof.latestMessageWinsObserved,
          duplicateSuppressionObserved: proof.duplicateSuppressionObserved,
          transitionEvidence,
        },
        thresholds: {
          minimumIntervalMilliseconds: 1000,
          maximumDuplicateWriteCount: 0,
          latestMessageWinsRequired: true,
          duplicateSuppressionRequired: true,
        },
      } satisfies AnnouncementCell;
    });
  }, () => [
    ...(context === undefined ? [] : [() => context!.close()]),
    () => harness.close(),
  ]);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

async function atomicWrite(destination: string, value: unknown): Promise<void> {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, `${canonical(value)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function pathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export interface ExecuteRunnerBrowserMatrixOptions {
  readonly root: string;
  readonly baseUrl: string;
  readonly evaluatedSourceSha256: string;
  readonly managedLocalPreview: true;
  readonly outputPath?: string;
  readonly representativeScreenshotDirectory?: string;
}

async function collectWithProvenance<T>(
  group: RunnerBrowserMatrixCell["group"],
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`runner browser matrix: ${group} collector failed: ${detail}`, {
      cause: error,
    });
  }
}

export async function executeRunnerBrowserMatrix(
  options: ExecuteRunnerBrowserMatrixOptions,
): Promise<RunnerBrowserMatrixArtifact> {
  const root = path.resolve(options.root);
  if (options.managedLocalPreview !== true) fail("canonical matrix omitted managed-preview trust");
  assertCanonicalBrowserBaseUrl(options.baseUrl);
  if (!SHA256_PATTERN.test(options.evaluatedSourceSha256)) fail("evaluated source digest is malformed");
  if (options.outputPath !== undefined && pathInside(root, options.outputPath)) {
    fail("browser matrix output must be a temporary artifact outside the evaluated source tree");
  }
  if (
    options.representativeScreenshotDirectory !== undefined &&
    pathInside(root, options.representativeScreenshotDirectory)
  ) {
    fail("representative screenshots must stay in a temporary directory outside the evaluated source tree");
  }
  if (options.representativeScreenshotDirectory !== undefined) {
    await mkdir(options.representativeScreenshotDirectory, { recursive: true });
  }
  const fixturePath = path.join(root, "docs", "balance", "runner-fixtures", "runner-laboratory-fixture-v1.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const sourceAtStart = await evaluationSourceSha256(root);
  if (sourceAtStart !== options.evaluatedSourceSha256) {
    fail("evaluated source digest differs before browser execution");
  }
  const packageJson = JSON.parse(await readFile(path.join(root, "node_modules", "@playwright", "test", "package.json"), "utf8"));
  if (packageJson.version !== PINNED_PLAYWRIGHT_VERSION) {
    fail(`installed Playwright ${String(packageJson.version)} differs from pinned ${PINNED_PLAYWRIGHT_VERSION}`);
  }
  const startedAt = Date.now();
  const startedAtUtc = new Date(startedAt).toISOString();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true });
  return executeWithAllSettledCleanup(async () => {
    if (browser.browserType().name() !== BROWSER_ENGINE) fail("Playwright launched the wrong browser engine");
    const [completion, presentation, safeArea, focus, announcements] = await awaitAllSettledOrThrow([
      collectWithProvenance("completionReflow", () => collectCompletionCells(
        browser,
        options.baseUrl,
        fixture,
        options.representativeScreenshotDirectory,
      )),
      collectWithProvenance("presentation", () =>
        collectPresentationCells(browser, options.baseUrl, fixture, root)),
      collectWithProvenance("safeAreaOneHand", () =>
        collectSafeAreaCells(browser, options.baseUrl, fixture)),
      collectWithProvenance("focus", () =>
        collectFocusCells(browser, options.baseUrl, fixture)),
      collectWithProvenance("announcements", () =>
        collectAnnouncementCells(browser, root, fixture, startedAt)),
    ] as const);
    const sourceAtCompletion = await evaluationSourceSha256(root);
    if (sourceAtCompletion !== options.evaluatedSourceSha256) {
      fail("evaluated source changed during browser execution");
    }
    const latestAnnouncementUtc = Math.max(...announcements.map(({ observations }) =>
      Date.parse(observations.writtenAtUtc)));
    const completedAtUtc = new Date(Math.max(Date.now(), latestAnnouncementUtc)).toISOString();
    const artifact: RunnerBrowserMatrixArtifact = {
      schemaVersion: 1,
      artifactId: RUNNER_BROWSER_MATRIX_ARTIFACT_ID,
      evaluatorId: RUNNER_EVALUATOR_ID,
      fixtureId: fixture.fixtureId,
      evaluatedSourceSha256: options.evaluatedSourceSha256,
      startedAtUtc,
      completedAtUtc,
      playwrightPackage: PLAYWRIGHT_PACKAGE,
      playwrightVersion: PINNED_PLAYWRIGHT_VERSION,
      browserEngine: BROWSER_ENGINE,
      browserChannel: BROWSER_CHANNEL,
      browserVersion: browser.version(),
      baseUrl: applicationUrl(options.baseUrl),
      cells: [...completion, ...presentation, ...safeArea, ...focus, ...announcements]
        .sort((left, right) => left.cellId.localeCompare(right.cellId)),
    };
    const validated = validateRunnerBrowserMatrixArtifact(
      artifact,
      fixture,
      options.evaluatedSourceSha256,
    ).artifact;
    if (options.outputPath !== undefined) await atomicWrite(options.outputPath, validated);
    return validated;
  }, () => [() => browser.close()]);
}

export function runnerBrowserMatrixSourceDigest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
