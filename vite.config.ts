import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin, type ResolvedConfig } from "vite";

import {
  assertPropertyMangleProductionGraph,
  createAuditedPropertyMangleOptions,
} from "./scripts/property-mangle-policy.mjs";
import { createRepeatedStringValuePoolingPlugin } from "./scripts/string-value-pooling.mjs";

const REPOSITORY_ROOT = path.dirname(fileURLToPath(import.meta.url));

// The user explicitly approved the audited production-minification pipeline on
// 2026-08-04 after its independent semantic, persistence, and bundle review.
// This single gate keeps the reviewed activation visible and testable.
export const AUDITED_PRODUCTION_MINIFICATION_APPROVED = true;

export function assertProductionBuildEnvironment(
  config: Pick<ResolvedConfig, "command" | "mode" | "isProduction" | "env">,
): void {
  if (
    config.command !== "build" || config.mode !== "production" ||
    config.isProduction !== true || config.env.MODE !== "production" ||
    config.env.DEV !== false || config.env.PROD !== true
  ) {
    throw new TypeError(
      "Choice of Life production output requires build mode production with DEV=false and PROD=true",
    );
  }
}

function productionBuildEnvironmentGuard(): Plugin {
  return {
    name: "choice-of-life-production-build-environment-guard",
    apply: "build",
    configResolved(config) {
      assertProductionBuildEnvironment(config);
    },
  };
}

function propertyMangleGraphGuard(): Plugin {
  return {
    name: "choice-of-life-property-mangle-graph-guard",
    apply: "build",
    generateBundle(_options, bundle) {
      const emittedModuleIds = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of Object.keys(output.modules)) {
          emittedModuleIds.add(moduleId);
        }
      }
      assertPropertyMangleProductionGraph(
        REPOSITORY_ROOT,
        this.getModuleIds(),
        emittedModuleIds,
      );
    },
  };
}

// These properties belong only to in-memory runner contracts. None is a save,
// catalog, DOM, Web API, CSS, storage, or evidence key. Keeping this allowlist
// explicit lets Terser shorten the very defensive runner implementation without
// changing any durable/public field name.
const RUNNER_INTERNAL_PROPERTY = /^(?:worldSpeedMilliPerTick|initialCursor|terminalCursor|completedCursor|canonicalEntityIds|spawnTick|anchorTick|includedOptionalGroupIds|spawnEntities|decisionMarker|incomingCursor|outgoingCursor|contactTick|contactOffsetTicks|optionalGroupId|previousTick|currentTick|tickDelta|advanced|stateChanged|shouldPersist|acceptedLaneIntent|noOpReason|checkpoint|reachabilityCertificate|traceVersion|policyId|manualPolicyId|retainedIdentityToken|manualRunId|stageEntryStateHash|patternTargets|terminalScores|terminalMotion|terminalInputBuffer|terminalResolvedEntityIds|completionFactIds|completionMemoryIds|manualPendingStateHash|manualCompletedStateHash|productionEventCount|selectedBeforeProductionEventOrdinal|safeBoundaryTick|utilityNumerator|rawLaneInputCount|semanticChoiceCount|automaticDecisionCount|settlementBeginCount|settlementApplyCount|settlementEffectIds|decisionProvenance|activePauseReasons|setPauseReason|bufferAfterStep|bufferedIntent|safeClosedOverlapTravelMilli|maxLiveInteractiveEntities|maxResolvedEntityIds|requiredMoveFloors|automaticEffectIds|automaticEffectOrder|automaticEffectCategoryId|patternKey|getSnapshot|setModalOpen|resumeInterruption|refreshPresentationState|reportPresentationFault|requestLaneIntent|chooseLane|setUserPaused|ariaKeyshortcuts|ariaKeyshortcutsToken|displayLabel|eventCode|accessibleLabel|laneWarnings|benefitLabels|hazardLabels|suppressedHazardLabels|newlyResolvedEntityIds|passedEntityIds|playerLanePositionMilli|incomingStateCount|firstStepInputCaseCount|minimumViableStateCount|checkedThroughTick|tracesByStateKey|viableStateCount|unavoidableHazardCount|certifiedPatternIndexes|certifiedStartTick|coverageBasis|requestedAppendPatternIndex|permutationToken|copyOrdinal|templateIndex|copyIndex|includedOptionalGroupKeys|maximumLiveEntities|firstWitnessTick|entityInstanceIds|warning|decision|progress|characterToken|visualOptions|updateVisualOptions|updateBindings|attachBindingController|getInputGateSnapshot|playSurface|laneUpButton|laneDownButton|dialogOpen|queuedLaneIntent|droppedLogicalSteps)$/;

export function createProductionMinificationPipeline(approved: boolean): {
  readonly preTerserPlugins: readonly Plugin[];
  readonly propertyOptions:
    | { readonly regex: RegExp }
    | ReturnType<typeof createAuditedPropertyMangleOptions>;
} {
  if (typeof approved !== "boolean") {
    throw new TypeError("production minification approval must be boolean");
  }
  if (approved) {
    return {
      preTerserPlugins: [createRepeatedStringValuePoolingPlugin()],
      propertyOptions: createAuditedPropertyMangleOptions(REPOSITORY_ROOT),
    };
  }
  return {
    preTerserPlugins: [],
    propertyOptions: { regex: RUNNER_INTERNAL_PROPERTY },
  };
}

export function createProductionTerserOptions(
  propertyOptions: ReturnType<typeof createProductionMinificationPipeline>["propertyOptions"],
) {
  return {
    compress: { passes: 3 },
    mangle: {
      module: true,
      toplevel: true,
      properties: propertyOptions,
    },
    format: { comments: false },
  } as const;
}

const productionMinification = createProductionMinificationPipeline(
  AUDITED_PRODUCTION_MINIFICATION_APPROVED,
);

// Relative base keeps every generated asset valid under the Choice of Life
// GitHub Pages project path as well as local previews.
export default defineConfig({
  base: "./",
  plugins: [
    productionBuildEnvironmentGuard(),
    ...productionMinification.preTerserPlugins,
    propertyMangleGraphGuard(),
  ],
  build: {
    emptyOutDir: true,
    manifest: true,
    minify: "terser",
    terserOptions: createProductionTerserOptions(productionMinification.propertyOptions),
  },
});
