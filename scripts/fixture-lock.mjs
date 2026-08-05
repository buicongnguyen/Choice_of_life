import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const SCORE_IDS = ["health", "happiness", "money"];
const execFileAsync = promisify(execFile);
const BASE_MANIFEST_PATH = "docs/phase-specs/phase-1-lock-manifest.json";
const BASE_MANIFEST_SHA256 = "a15e6d2b68d6deea29e0f839b3b6becdfa9205958945aab30bc1d119e887a5ed";
const CORRECTION_MANIFEST_PATH = "docs/phase-specs/phase-1-fixture-correction-v2-lock-manifest.json";
const CORRECTION_MANIFEST_SHA256 = "c95a33ffc593c14f3f00c59470b6a7273424ce8c79903ccae0762dc2393a74cb";
const BASE_LOCK_FILES = [
  ["docs/.gitattributes", "cfec6110c894294e2070e5cb16c6f259cfac729680f945bf314a813fa17c95b1"],
  ["docs/phase-specs/phase-1.md", "5d16d07647e14198ea61532ce042aa9e84e0b1876b0a7c565e88b151e5d4e2a7"],
  ["docs/balance/fixture-registry-v1.json", "103bab03ba62e1619f9e745164135e067d41563f87090222cd5cc65e89454af5"],
  ["docs/balance/fixture-registry-v1.schema.json", "77596ffc1367560dd0a01b6071c319021bccac84a52d3d7c8e86b9f39bc30d0e"],
  ["docs/balance/content-lock-v1.schema.json", "2ed710682d949237c4ec8599cf4d9bf69a7cc0ee887a8c3559b1d32cdd0de5dc"],
  ["docs/save/run-state-v1.schema.json", "f1d951942df912d219749970858e7b71f1a96837b7adbe801c8df3829cfdb346"],
  ["docs/save/run-state-v1-maximal.fixture.json", "0b3d40e3af2aa2d2dae600d4907524a5346fa7509f973780d927330bccfbe4ec"],
  ["docs/save/run-state-v1-fixture-corpus.json", "8cf425f7c99f8aba5e381d2ac6d38a2c5908a356f02d96c3d2231670a16c602a"],
].map(([filePath, sha256]) => ({ path: filePath, sha256 }));
const CORRECTION_LOCK_FILES = [
  { path: "docs/phase-specs/phase-1-fixture-correction-v2.md", sha256: "2b8c3ba6370ccafdfd39fadc91684e848cb50f113c52341ddb19e9d8de0f39a1" },
  { path: "docs/save/run-state-v1-maximal.fixture-correction-v2.json", sha256: "9566fd1dd85ee3b9305425809f94d30c9cc28e430cd747a24b33d41be83120cf" },
];
const EVALUATION_SOURCE_FILES = [
  "CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md",
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.choice-of-life-core.json",
  "tsconfig.runner-evaluator.json",
  "vite.config.ts",
  "src/main.ts",
];
const EVALUATION_SOURCE_DIRECTORIES = [
  "src/choice-of-life",
  "scripts",
  "docs/balance",
  "docs/phase-specs",
  "docs/save",
];
const EVALUATION_EVIDENCE_DIRECTORY = "docs/balance/evaluation-results";
const RUNNER_EVALUATION_EVIDENCE_DIRECTORY = "docs/balance/runner-evaluation-results";
const ADDITIVE_MANIFEST_PATTERN = /^phase-(2|3|4|5|6|7|8|9|10|11)-lock-manifest\.json$/;
const MANIFEST_BYTE_POLICY = "Repository-relative file bytes with LF enforced by docs/.gitattributes";
const PHASE_2_MANIFEST_PATH = "docs/phase-specs/phase-2-lock-manifest.json";
const PHASE_2_REQUIRED_PATHS = [
  "docs/phase-specs/phase-2.md",
  "docs/balance/locks/runner-laboratory-content-lock-v1.json",
  "docs/balance/runner-fixture-v1.schema.json",
  "docs/balance/runner-fixtures/runner-laboratory-fixture-v1.json",
];
const IMPLEMENTED_ADDITIVE_PHASES = new Set(["phase-2"]);
const PREREGISTRATION_ONLY_ADDITIVE_PHASES = new Set(["phase-3"]);
const REGISTERED_ADDITIVE_PHASES = new Set([
  ...IMPLEMENTED_ADDITIVE_PHASES,
  ...PREREGISTRATION_ONLY_ADDITIVE_PHASES,
]);
const PHASE_3_MANIFEST_PATH = "docs/phase-specs/phase-3-lock-manifest.json";
const PHASE_3_REQUIRED_PATHS = [
  "docs/phase-specs/phase-3.md",
  "docs/balance/locks/newborn-stage-content-lock-v1.json",
  "docs/balance/newborn-fixture-v1.schema.json",
  "docs/balance/newborn-fixtures/newborn-stage-fixture-v1.json",
];
const PHASE_3_CONTENT_LOCK_ID = "newborn-stage-content-lock-v1";
const PHASE_3_FIXTURE_ID = "newborn-stage-fixture-v1";
const PHASE_3_SCHEMA_PATH = "docs/balance/newborn-fixture-v1.schema.json";
const PHASE_3_FIXTURE_PATH = "docs/balance/newborn-fixtures/newborn-stage-fixture-v1.json";
const PHASE_3_SCHEMA_ID = "https://choice-of-life.example/schemas/newborn-fixture-v1.schema.json";
const PHASE_3_PREDECESSOR_MANIFEST_ID = "phase-2-preregistration-lock-v1";
const PHASE_2_RUNNER_FIXTURE_PATH = "docs/balance/runner-fixtures/runner-laboratory-fixture-v1.json";
const PHASE_2_RUNNER_SCHEMA_PATH = "docs/balance/runner-fixture-v1.schema.json";
const PHASE_2_RUNNER_FIXTURE_ID = "runner-laboratory-fixture-v1";
const PHASE_2_CONTENT_LOCK_ID = "runner-laboratory-content-lock-v1";
const PHASE_2_RUNTIME_CONTENT_VERSION = "phase-1-v1";
const PHASE_2_EVALUATOR_ID = "runner-laboratory-evaluator-v1";
const PHASE_2_PATTERN_IDS = [
  "runner-lab-benefit-fork-v1",
  "runner-lab-risk-reward-v1",
  "runner-lab-avoid-only-v1",
  "runner-lab-quiet-window-v1",
];
const PHASE_2_EVIDENCE_IDS = [
  "evidence-runner-reachability-v1",
  "evidence-runner-replay-v1",
  "evidence-runner-assist-v1",
  "evidence-runner-accessibility-v1",
  "evidence-runner-completion-fact-v1",
  "evidence-runner-completion-memory-v1",
  "evidence-runner-appearance-invariance-v1",
];
const PHASE_2_ASSIST_ASSERTION_IDS = [
  "semantic-assist-effect-identity-v1",
  "automatic-assist-score-parity-v1",
  "assist-narrative-parity-v1",
];
const EMPTY_GROUP_COUNTS = Object.freeze({});
const PHASE_2_ASSERTION_GROUP_COUNTS = Object.freeze({
  "runner-appearance-invariance-v1": Object.freeze({
    witnessSeedCount: 3,
    profileCount: 4,
    difficultyCount: 3,
    appearanceSelectionCount: 512,
  }),
  "runner-completion-memory-parity-v1": Object.freeze({
    seedCount: 10_000,
    profileCount: 4,
    difficultyCount: 3,
    pairedEntryCount: 120_000,
  }),
  "runner-simultaneous-contact-order-v1": Object.freeze({ permutationCount: 6 }),
  "runner-semantic-choice-and-reload-identity-v1": Object.freeze({
    decisionEntries: 1_080,
    pauseGuardEntries: 4,
    totalEntries: 1_084,
  }),
  "runner-automatic-no-input-completion-v1": Object.freeze({
    seedCount: 10_000,
    profileCount: 4,
    difficultyCount: 3,
    totalEntries: 120_000,
  }),
  "runner-reduced-motion-domain-identity-v1": Object.freeze({
    savedPreferenceEntries: 120_000,
    osPreferenceEntries: 120_000,
    totalEntries: 240_000,
  }),
  "runner-accessibility-browser-matrix-v1": Object.freeze({
    completionReflow: 40,
    presentation: 72,
    safeAreaOneHand: 8,
    focus: 10,
    announcements: 9,
    total: 139,
  }),
});
function runnerAssertion(assertionId, population) {
  return {
    assertionId,
    population,
    groupCounts: PHASE_2_ASSERTION_GROUP_COUNTS[assertionId] ?? EMPTY_GROUP_COUNTS,
  };
}
const PHASE_2_ASSERTIONS = [
  runnerAssertion("runner-generation-determinism-v1", 90_000),
  runnerAssertion("runner-pattern-composition-v1", 90_000),
  runnerAssertion("runner-laboratory-reachability-v1", 90_000),
  runnerAssertion("runner-input-adjacency-v1", 321),
  runnerAssertion("runner-buffer-handoff-v1", 100),
  runnerAssertion("runner-contact-idempotency-v1", 90_000),
  runnerAssertion("runner-invulnerability-ownership-v1", 90_000),
  runnerAssertion("runner-entity-cap-v1", 90_000),
  runnerAssertion("runner-nondepletion-v1", 120_000),
  runnerAssertion("runner-laboratory-replay-v1", 120_000),
  runnerAssertion("runner-automatic-settlement-idempotency-v1", 120_000),
  runnerAssertion("runner-modality-identity-v1", 120_000),
  runnerAssertion("runner-pause-drift-v1", 32),
  runnerAssertion("runner-appearance-invariance-v1", 18_432),
  ...PHASE_2_ASSIST_ASSERTION_IDS.map((assertionId) => runnerAssertion(assertionId, 120_000)),
  runnerAssertion("runner-completion-memory-parity-v1", 120_000),
  runnerAssertion("runner-simultaneous-contact-order-v1", 6),
  runnerAssertion("runner-semantic-choice-and-reload-identity-v1", 1_084),
  runnerAssertion("runner-automatic-no-input-completion-v1", 120_000),
  runnerAssertion("runner-reduced-motion-domain-identity-v1", 240_000),
  runnerAssertion("runner-accessibility-browser-matrix-v1", 139),
];
const PHASE_2_ENTITY_EFFECTS = [
  { entityContentId: "runner-lab-health-token-v1", kind: "benefit", scoreId: "health", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
  { entityContentId: "runner-lab-happiness-token-v1", kind: "benefit", scoreId: "happiness", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
  { entityContentId: "runner-lab-money-token-v1", kind: "benefit", scoreId: "money", requestedDelta: 1, effectCategoryId: "runner-benefit-v1" },
  { entityContentId: "runner-lab-clutter-hazard-v1", kind: "hazard", scoreId: "health", requestedDelta: -1, effectCategoryId: "runner-hazard-v1" },
  { entityContentId: "runner-lab-pressure-hazard-v1", kind: "hazard", scoreId: "happiness", requestedDelta: -1, effectCategoryId: "runner-hazard-v1" },
];
const PHASE_2_DIFFICULTY_PROFILES = [
  { difficulty: "story", worldSpeedMilliPerTick: 2600, optionalDensity: 50, variantId: "runner-lab-story-variant-v1", durationTicks: 3000 },
  { difficulty: "normal", worldSpeedMilliPerTick: 3000, optionalDensity: 75, variantId: "runner-lab-normal-variant-v1", durationTicks: 3000 },
  { difficulty: "challenge", worldSpeedMilliPerTick: 3400, optionalDensity: 100, variantId: "runner-lab-challenge-variant-v1", durationTicks: 3000 },
];
const PHASE_2_PATTERN_TEMPLATES = [
  {
    patternId: "runner-lab-benefit-fork-v1",
    category: "benefit-fork",
    occurrenceCount: 4,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-health-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 2, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
    ],
  },
  {
    patternId: "runner-lab-risk-reward-v1",
    category: "risk-reward",
    occurrenceCount: 3,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-money-token-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 18, optional: false, optionalGroupId: null },
      { slotIndex: 2, entityContentId: "runner-lab-happiness-token-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
      { slotIndex: 3, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-previous", contactOffsetTicks: 0, optional: true, optionalGroupId: "risk-reward-secondary-v1" },
    ],
  },
  {
    patternId: "runner-lab-avoid-only-v1",
    category: "avoid-only",
    occurrenceCount: 2,
    legalRotations: [0, 1, 2],
    slots: [
      { slotIndex: 0, entityContentId: "runner-lab-clutter-hazard-v1", laneRole: "rotation-origin", contactOffsetTicks: 0, optional: false, optionalGroupId: null },
      { slotIndex: 1, entityContentId: "runner-lab-pressure-hazard-v1", laneRole: "rotation-next", contactOffsetTicks: 0, optional: true, optionalGroupId: "avoid-secondary-hazard-v1" },
    ],
  },
  {
    patternId: "runner-lab-quiet-window-v1",
    category: "quiet-window",
    occurrenceCount: 1,
    legalRotations: [0],
    slots: [],
  },
];
const PHASE_2_COPY_ORDINAL_MAPPING = [
  [0, 0, 0, "runner-lab-benefit-fork-v1"],
  [1, 0, 1, "runner-lab-benefit-fork-v1"],
  [2, 0, 2, "runner-lab-benefit-fork-v1"],
  [3, 0, 3, "runner-lab-benefit-fork-v1"],
  [4, 1, 0, "runner-lab-risk-reward-v1"],
  [5, 1, 1, "runner-lab-risk-reward-v1"],
  [6, 1, 2, "runner-lab-risk-reward-v1"],
  [7, 2, 0, "runner-lab-avoid-only-v1"],
  [8, 2, 1, "runner-lab-avoid-only-v1"],
  [9, 3, 0, "runner-lab-quiet-window-v1"],
].map(([copyOrdinal, templateIndex, copyIndex, patternId]) => ({ copyOrdinal, templateIndex, copyIndex, patternId }));
const PHASE_2_GENERATOR_KNOWN_ANSWERS = [
  {
    runSeed: "0000000000000000",
    course: [
      ["runner-lab-quiet-window-v1", 0], ["runner-lab-risk-reward-v1", 1],
      ["runner-lab-risk-reward-v1", 1], ["runner-lab-benefit-fork-v1", 0],
      ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 0],
      ["runner-lab-avoid-only-v1", 1], ["runner-lab-risk-reward-v1", 2],
      ["runner-lab-benefit-fork-v1", 2], ["runner-lab-benefit-fork-v1", 2],
    ].map(([patternId, rotation]) => ({ patternId, rotation })),
  },
  {
    runSeed: "0000000000000001",
    course: [
      ["runner-lab-benefit-fork-v1", 1], ["runner-lab-benefit-fork-v1", 0],
      ["runner-lab-risk-reward-v1", 0], ["runner-lab-quiet-window-v1", 0],
      ["runner-lab-risk-reward-v1", 2], ["runner-lab-risk-reward-v1", 1],
      ["runner-lab-avoid-only-v1", 2], ["runner-lab-benefit-fork-v1", 2],
      ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 2],
    ].map(([patternId, rotation]) => ({ patternId, rotation })),
  },
  {
    runSeed: "000000000000270f",
    course: [
      ["runner-lab-avoid-only-v1", 0], ["runner-lab-risk-reward-v1", 0],
      ["runner-lab-benefit-fork-v1", 1], ["runner-lab-risk-reward-v1", 2],
      ["runner-lab-avoid-only-v1", 1], ["runner-lab-benefit-fork-v1", 0],
      ["runner-lab-risk-reward-v1", 2], ["runner-lab-quiet-window-v1", 0],
      ["runner-lab-benefit-fork-v1", 2], ["runner-lab-benefit-fork-v1", 2],
    ].map(([patternId, rotation]) => ({ patternId, rotation })),
  },
];
const PHASE_2_OPTIONAL_KNOWN_ANSWERS = [
  ["0000000000000000", "story", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1"]],
  ["0000000000000000", "normal", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1"]],
  ["0000000000000000", "challenge", ["2:risk-reward-secondary-v1", "3:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1", "7:avoid-secondary-hazard-v1", "8:risk-reward-secondary-v1"]],
  ["0000000000000001", "story", ["6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1"]],
  ["0000000000000001", "normal", ["5:risk-reward-secondary-v1", "6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1"]],
  ["0000000000000001", "challenge", ["3:risk-reward-secondary-v1", "5:risk-reward-secondary-v1", "6:risk-reward-secondary-v1", "7:avoid-secondary-hazard-v1", "9:avoid-secondary-hazard-v1"]],
  ["000000000000270f", "story", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "7:risk-reward-secondary-v1"]],
  ["000000000000270f", "normal", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "4:risk-reward-secondary-v1", "7:risk-reward-secondary-v1"]],
  ["000000000000270f", "challenge", ["1:avoid-secondary-hazard-v1", "2:risk-reward-secondary-v1", "4:risk-reward-secondary-v1", "5:avoid-secondary-hazard-v1", "7:risk-reward-secondary-v1"]],
].map(([runSeed, difficulty, includedPatternGroups]) => ({ runSeed, difficulty, includedPatternGroups }));
const PHASE_2_SPAWN_CURSORS = [
  {
    difficulty: "story",
    spawnTicks: [208, 458, 708, 958, 1208, 1458, 1708, 1958, 2208, 2458],
    nextSpawnDistancesMilli: [540800, 1190800, 1840800, 2490800, 3140800, 3790800, 4440800, 5090800, 5740800, 6390800],
  },
  {
    difficulty: "normal",
    spawnTicks: [218, 468, 718, 968, 1218, 1468, 1718, 1968, 2218, 2468],
    nextSpawnDistancesMilli: [654000, 1404000, 2154000, 2904000, 3654000, 4404000, 5154000, 5904000, 6654000, 7404000],
  },
  {
    difficulty: "challenge",
    spawnTicks: [218, 468, 718, 968, 1218, 1468, 1718, 1968, 2218, 2468],
    nextSpawnDistancesMilli: [741200, 1591200, 2441200, 3291200, 4141200, 4991200, 5841200, 6691200, 7541200, 8391200],
  },
];

const DEFAULT_REGISTRY_SCHEMA = JSON.parse(
  await readFile(new URL("../docs/balance/fixture-registry-v1.schema.json", import.meta.url), "utf8")
);
const DEFAULT_CONTENT_LOCK_SCHEMA = JSON.parse(
  await readFile(new URL("../docs/balance/content-lock-v1.schema.json", import.meta.url), "utf8")
);

function fail(message) {
  throw new Error(`Fixture lock validation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function runnerManualReviewArtifactSha256(session) {
  const preimage = JSON.stringify({
    announcementWitnessCount: session.announcementWitnessCount,
    browser: session.browser,
    browserVersion: session.browserVersion,
    completedAtUtc: session.completedAtUtc,
    completionPathPassed: session.completionPathPassed,
    evaluatedSourceSha256: session.evaluatedSourceSha256,
    focusTransitionCount: session.focusTransitionCount,
    forcedColorsInspectionPassed: session.forcedColorsInspectionPassed,
    keyboardInspectionPassed: session.keyboardInspectionPassed,
    keyboardOnlyPassed: session.keyboardOnlyPassed,
    nonvisualSemanticCompletionPassed: session.nonvisualSemanticCompletionPassed,
    platform: session.platform,
    reviewerAttestation: session.reviewerAttestation,
    reviewerId: session.reviewerId,
    screenReader: session.screenReader,
    screenReaderVersion: session.screenReaderVersion,
    semanticDecisionPromptPassed: session.semanticDecisionPromptPassed,
    semanticStructurePassed: session.semanticStructurePassed,
    sessionId: session.sessionId,
  });
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

function sorted(values) {
  return [...values].sort();
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schemaError(location, message) {
  throw new Error(`${location}: ${message}`);
}

function resolveSchemaReference(root, reference, location) {
  if (!reference.startsWith("#/")) schemaError(location, `unsupported schema reference ${reference}`);
  let value = root;
  for (const encoded of reference.slice(2).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      schemaError(location, `unresolved schema reference ${reference}`);
    }
    value = value[segment];
  }
  return value;
}

function trySchema(value, schema, root, location) {
  try {
    validateSchemaValue(value, schema, root, location);
    return true;
  } catch {
    return false;
  }
}

function validateSchemaValue(value, schema, root, location) {
  if (schema === true) return;
  if (schema === false) schemaError(location, "value is forbidden by schema");
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    schemaError(location, "invalid schema node");
  }

  if (schema.$ref) {
    validateSchemaValue(value, resolveSchemaReference(root, schema.$ref, location), root, location);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((branch) => trySchema(value, branch, root, location)).length;
    if (matches !== 1) schemaError(location, `must match exactly one schema branch (matched ${matches})`);
  }
  if (schema.allOf) {
    for (const branch of schema.allOf) validateSchemaValue(value, branch, root, location);
  }
  if (schema.if) {
    const branch = trySchema(value, schema.if, root, location) ? schema.then : schema.else;
    if (branch) validateSchemaValue(value, branch, root, location);
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    schemaError(location, `must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    schemaError(location, `is outside enum ${JSON.stringify(schema.enum)}`);
  }

  const actualType = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : Number.isSafeInteger(value)
        ? "integer"
        : typeof value;
  if (schema.type) {
    const accepted = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typeMatches = accepted.some((type) =>
      type === "number" ? typeof value === "number" && Number.isFinite(value) : type === actualType
    );
    if (!typeMatches) schemaError(location, `expected ${accepted.join("|")}, received ${actualType}`);
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) schemaError(location, "string is too short");
    if (schema.maxLength !== undefined && length > schema.maxLength) schemaError(location, "string is too long");
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      schemaError(location, `string does not match ${schema.pattern}`);
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) schemaError(location, "number must be finite");
    if (schema.minimum !== undefined && value < schema.minimum) schemaError(location, "number is below minimum");
    if (schema.maximum !== undefined && value > schema.maximum) schemaError(location, "number is above maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) schemaError(location, "array is too short");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) schemaError(location, "array is too long");
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      schemaError(location, "array items must be unique");
    }
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) validateSchemaValue(value[index], itemSchema, root, `${location}/${index}`);
      });
    }
    if (schema.items === false && value.length > (schema.prefixItems?.length ?? 0)) {
      schemaError(location, "array contains unexpected items");
    } else if (schema.items && schema.items !== true) {
      const start = schema.prefixItems?.length ?? 0;
      for (let index = start; index < value.length; index += 1) {
        validateSchemaValue(value[index], schema.items, root, `${location}/${index}`);
      }
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) schemaError(location, `missing required property ${required}`);
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (unknown) schemaError(location, `unknown property ${unknown}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchemaValue(child, properties[key], root, `${location}/${key}`);
      }
    }
  }
}

export function validateAgainstSchema(value, schema, label = "document") {
  try {
    validateSchemaValue(value, schema, schema, label);
  } catch (error) {
    fail(`schema ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = sorted(Object.keys(value));
  const wanted = sorted(expected);
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} keys ${actual.join(",")} !== ${wanted.join(",")}`
  );
}

function assertUniqueIds(records, label) {
  const ids = records.map((record) => record.id);
  assert(ids.every((id) => typeof id === "string" && ID_PATTERN.test(id)), `${label} has invalid ID`);
  assert(new Set(ids).size === ids.length, `${label} has duplicate IDs`);
  return new Set(ids);
}

function fractionValue(value, label) {
  assertExactKeys(value, ["numerator", "denominator"], label);
  assert(Number.isSafeInteger(value.numerator) && value.numerator >= 0, `${label} numerator`);
  assert(Number.isSafeInteger(value.denominator) && value.denominator > 0, `${label} denominator`);
  return value.numerator / value.denominator;
}

function resolvePointer(root, pointer) {
  assert(typeof pointer === "string" && pointer.startsWith("/"), `bad JSON pointer ${pointer}`);
  let value = root;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    assert(value && Object.hasOwn(value, segment), `unresolved JSON pointer ${pointer}`);
    value = value[segment];
  }
  return value;
}

export async function sha256File(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function verifyLockManifest(root = process.cwd()) {
  const manifestPath = path.join(root, BASE_MANIFEST_PATH);
  const bytes = await readFile(manifestPath);
  const manifestSha256 = createHash("sha256").update(bytes).digest("hex");
  assert(manifestSha256 === BASE_MANIFEST_SHA256, `base manifest hash ${manifestSha256} !== ${BASE_MANIFEST_SHA256}`);
  const manifest = JSON.parse(bytes.toString("utf8"));
  assertExactKeys(
    manifest,
    ["schemaVersion", "manifestId", "status", "hashAlgorithm", "bytePolicy", "files"],
    "lock manifest"
  );
  assert(manifest.schemaVersion === 1 && manifest.status === "locked", "lock manifest status/version");
  assert(manifest.manifestId === "phase-1-preregistration-lock-v1", "base manifest ID");
  assert(manifest.hashAlgorithm === "sha256", "lock manifest hash algorithm");
  assert(
    manifest.bytePolicy === "Repository-relative file bytes with LF enforced by docs/.gitattributes",
    "base manifest byte policy"
  );
  assert(deepEqual(manifest.files, BASE_LOCK_FILES), "base manifest exact path/hash map");
  const seen = new Set();
  for (const entry of manifest.files) {
    assertExactKeys(entry, ["path", "sha256"], "lock manifest entry");
    assert(!seen.has(entry.path), `duplicate manifest path ${entry.path}`);
    seen.add(entry.path);
    assert(SHA_PATTERN.test(entry.sha256), `invalid manifest SHA for ${entry.path}`);
    const absolute = path.resolve(root, entry.path);
    assert(absolute.startsWith(path.resolve(root) + path.sep), `manifest path escapes root: ${entry.path}`);
    const actual = await sha256File(absolute);
    assert(actual === entry.sha256, `hash mismatch ${entry.path}: ${actual} !== ${entry.sha256}`);
  }
  return manifest;
}

export async function verifyCorrectionLockManifest(root = process.cwd()) {
  const manifestPath = path.join(root, CORRECTION_MANIFEST_PATH);
  const bytes = await readFile(manifestPath);
  const manifestSha256 = createHash("sha256").update(bytes).digest("hex");
  assert(
    manifestSha256 === CORRECTION_MANIFEST_SHA256,
    `correction manifest hash ${manifestSha256} !== ${CORRECTION_MANIFEST_SHA256}`
  );
  const manifest = JSON.parse(bytes.toString("utf8"));
  assertExactKeys(
    manifest,
    [
      "schemaVersion", "manifestId", "status", "hashAlgorithm", "bytePolicy",
      "supplementsManifestId", "retainsManifestSha256", "scope", "files",
    ],
    "correction lock manifest"
  );
  assert(manifest.schemaVersion === 1 && manifest.status === "locked", "correction manifest status/version");
  assert(manifest.manifestId === "phase-1-fixture-correction-lock-v2", "correction manifest ID");
  assert(manifest.hashAlgorithm === "sha256", "correction manifest hash algorithm");
  assert(
    manifest.bytePolicy === "Repository-relative file bytes with LF enforced by docs/.gitattributes",
    "correction manifest byte policy"
  );
  assert(manifest.supplementsManifestId === "phase-1-preregistration-lock-v1", "correction supplements base manifest");
  assert(manifest.retainsManifestSha256 === BASE_MANIFEST_SHA256, "correction retains pinned base manifest SHA");
  assert(typeof manifest.scope === "string" && manifest.scope.length >= 100, "correction scope");
  assert(deepEqual(manifest.files, CORRECTION_LOCK_FILES), "correction manifest exact path/hash map");
  for (const entry of manifest.files) {
    const actual = await sha256File(path.join(root, entry.path));
    assert(actual === entry.sha256, `hash mismatch ${entry.path}: ${actual} !== ${entry.sha256}`);
  }
  return manifest;
}

function assertRepositoryDocsPath(filePath, root, label) {
  assert(typeof filePath === "string" && filePath.startsWith("docs/"), `${label} must be under docs/`);
  assert(!filePath.includes("\\"), `${label} must use repository-relative forward slashes`);
  assert(path.posix.normalize(filePath) === filePath, `${label} is not normalized: ${filePath}`);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(root, ...filePath.split("/"));
  assert(absolute.startsWith(`${absoluteRoot}${path.sep}`), `${label} escapes root: ${filePath}`);
  return absolute;
}

export async function verifyAdditiveLockManifests(root = process.cwd()) {
  const phaseSpecsDirectory = path.join(root, "docs", "phase-specs");
  const directoryEntries = await readdir(phaseSpecsDirectory, { withFileTypes: true });
  const phase1ManifestNames = new Set([
    path.posix.basename(BASE_MANIFEST_PATH),
    path.posix.basename(CORRECTION_MANIFEST_PATH),
  ]);
  const invalidManifestNames = directoryEntries.filter((entry) =>
    !phase1ManifestNames.has(entry.name)
    &&
    entry.name.startsWith("phase-")
    && entry.name.endsWith("-lock-manifest.json")
    && (!entry.isFile() || !ADDITIVE_MANIFEST_PATTERN.test(entry.name))
  );
  assert(
    invalidManifestNames.length === 0,
    `invalid additive manifest filename: ${invalidManifestNames.map(({ name }) => name).join(", ")}`
  );
  const manifestEntries = directoryEntries
    .filter((entry) => entry.isFile() && ADDITIVE_MANIFEST_PATTERN.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }));
  const records = [];
  const manifestIds = new Set();
  const protectedPaths = new Set();
  for (const entry of manifestEntries) {
    const match = ADDITIVE_MANIFEST_PATTERN.exec(entry.name);
    assert(match !== null, `unrecognized additive manifest filename ${entry.name}`);
    const phaseId = `phase-${match[1]}`;
    const manifestPath = `docs/phase-specs/${entry.name}`;
    const manifestBytes = await readFile(path.join(phaseSpecsDirectory, entry.name));
    let manifest;
    try {
      manifest = JSON.parse(manifestBytes.toString("utf8"));
    } catch (error) {
      fail(`invalid additive manifest JSON ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifestKeys = [
      "schemaVersion", "manifestId", "phaseId", "status", "hashAlgorithm", "bytePolicy", "files",
    ];
    if (phaseId === "phase-3") {
      manifestKeys.push("predecessorManifestId", "predecessorManifestSha256");
    }
    assertExactKeys(manifest, manifestKeys, `additive manifest ${manifestPath}`);
    assert(manifest.schemaVersion === 1, `additive manifest schema version ${manifestPath}`);
    assert(typeof manifest.manifestId === "string" && ID_PATTERN.test(manifest.manifestId), `additive manifest ID ${manifestPath}`);
    assert(manifest.manifestId === `${phaseId}-preregistration-lock-v1`, `additive manifest canonical ID ${manifestPath}`);
    assert(!manifestIds.has(manifest.manifestId), `duplicate additive manifest ID ${manifest.manifestId}`);
    manifestIds.add(manifest.manifestId);
    assert(manifest.phaseId === phaseId, `additive manifest phase ID ${manifestPath}`);
    assert(REGISTERED_ADDITIVE_PHASES.has(phaseId), `additive manifest has no registered phase validator ${phaseId}`);
    assert(manifest.status === "locked", `additive manifest status ${manifestPath}`);
    assert(manifest.hashAlgorithm === "sha256", `additive manifest hash algorithm ${manifestPath}`);
    assert(manifest.bytePolicy === MANIFEST_BYTE_POLICY, `additive manifest byte policy ${manifestPath}`);
    assert(Array.isArray(manifest.files) && manifest.files.length > 0, `additive manifest files ${manifestPath}`);
    const manifestFilePaths = [];
    for (const fileEntry of manifest.files) {
      assertExactKeys(fileEntry, ["path", "sha256"], `additive manifest entry ${manifestPath}`);
      const absolute = assertRepositoryDocsPath(fileEntry.path, root, `additive manifest path ${manifestPath}`);
      assert(fileEntry.path !== manifestPath, `additive manifest may not list itself ${manifestPath}`);
      assert(!protectedPaths.has(fileEntry.path), `duplicate additive protected path ${fileEntry.path}`);
      protectedPaths.add(fileEntry.path);
      manifestFilePaths.push(fileEntry.path);
      assert(typeof fileEntry.sha256 === "string" && SHA_PATTERN.test(fileEntry.sha256), `invalid additive manifest SHA ${fileEntry.path}`);
      const actual = await sha256File(absolute).catch((error) => {
        if (error.code === "ENOENT") fail(`missing additive manifest file ${fileEntry.path}`);
        throw error;
      });
      assert(actual === fileEntry.sha256, `hash mismatch ${fileEntry.path}: ${actual} !== ${fileEntry.sha256}`);
    }
    assert(new Set(manifestFilePaths).size === manifestFilePaths.length, `duplicate path within additive manifest ${manifestPath}`);
    assert(
      manifestFilePaths.includes(`docs/phase-specs/${phaseId}.md`),
      `additive manifest must protect its phase contract ${phaseId}`
    );
    if (manifestPath === PHASE_2_MANIFEST_PATH) {
      assert(
        deepEqual(sorted(manifestFilePaths), sorted(PHASE_2_REQUIRED_PATHS)),
        `Phase 2 manifest exact protected path set: ${manifestFilePaths.join(",")}`
      );
    }
    if (manifestPath === PHASE_3_MANIFEST_PATH) {
      const predecessor = records.find(({ manifest: candidate }) =>
        candidate.manifestId === PHASE_3_PREDECESSOR_MANIFEST_ID
      );
      assert(predecessor !== undefined, "Phase 3 manifest requires the registered Phase 2 predecessor");
      assert(
        manifest.predecessorManifestId === PHASE_3_PREDECESSOR_MANIFEST_ID,
        "Phase 3 manifest predecessor ID"
      );
      assert(
        typeof manifest.predecessorManifestSha256 === "string"
          && SHA_PATTERN.test(manifest.predecessorManifestSha256),
        "Phase 3 manifest predecessor SHA"
      );
      assert(
        manifest.predecessorManifestSha256 === predecessor.manifestSha256,
        "Phase 3 manifest predecessor hash does not match the immutable Phase 2 manifest"
      );
      assert(
        deepEqual(sorted(manifestFilePaths), sorted(PHASE_3_REQUIRED_PATHS)),
        `Phase 3 manifest exact protected path set: ${manifestFilePaths.join(",")}`
      );
    }
    records.push({
      manifestPath,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      manifest,
    });
  }
  return {
    records,
    manifestCount: records.length,
    fileCount: records.reduce((count, record) => count + record.manifest.files.length, 0),
    protectedPaths: [...protectedPaths],
  };
}

export async function verifyLockManifestChain(root = process.cwd()) {
  const base = await verifyLockManifest(root);
  const correction = await verifyCorrectionLockManifest(root);
  const additive = await verifyAdditiveLockManifests(root);
  const manifestIds = [base.manifestId, correction.manifestId, ...additive.records.map(({ manifest }) => manifest.manifestId)];
  assert(new Set(manifestIds).size === manifestIds.length, "duplicate manifest ID");
  const protectedPaths = [
    ...base.files,
    ...correction.files,
    ...additive.records.flatMap(({ manifest }) => manifest.files),
  ].map((entry) => entry.path);
  assert(new Set(protectedPaths).size === protectedPaths.length, "duplicate protected path across manifests");
  return {
    manifests: [base, correction, ...additive.records.map(({ manifest }) => manifest)],
    protectedPaths,
    additiveRecords: additive.records,
    additiveManifests: additive.manifestCount,
    additiveManifestFiles: additive.fileCount,
  };
}

async function gitLines(root, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim() === "" ? [] : stdout.trim().split(/\r?\n/);
}

export async function verifyHistoricalContentLockPaths(root, currentPaths) {
  const normalizedCurrentPaths = sorted(new Set(currentPaths));
  const historicalPaths = sorted(new Set((await gitLines(root, [
    "log", "--diff-filter=A", "--name-only", "--format=", "--", "docs/balance/locks",
  ])).filter((entry) => entry.startsWith("docs/balance/locks/"))));
  assert(
    deepEqual(normalizedCurrentPaths, historicalPaths),
    `historical content locks differ from current locks: current=${normalizedCurrentPaths.join(",")} historical=${historicalPaths.join(",")}`
  );
  return historicalPaths;
}

export async function verifyHistoricalAdditiveManifestPaths(root, currentPaths) {
  const normalizedCurrentPaths = sorted(new Set(currentPaths));
  const historicalPaths = sorted(new Set((await gitLines(root, [
    "log", "--diff-filter=A", "--name-only", "--format=", "--", "docs/phase-specs",
  ])).filter((entry) => {
    const normalized = entry.replaceAll("\\", "/");
    return normalized.startsWith("docs/phase-specs/")
      && ADDITIVE_MANIFEST_PATTERN.test(path.posix.basename(normalized));
  }).map((entry) => entry.replaceAll("\\", "/"))));
  assert(
    deepEqual(normalizedCurrentPaths, historicalPaths),
    `historical additive manifests differ from current manifests: current=${normalizedCurrentPaths.join(",")} historical=${historicalPaths.join(",")}`
  );
  return historicalPaths;
}

export async function verifyGitLockedPaths(root, entries) {
  const shallow = await gitLines(root, ["rev-parse", "--is-shallow-repository"]);
  assert(shallow[0] === "false", "full Git history is required for lock immutability verification");
  for (const entry of entries) {
    const commits = await gitLines(root, ["log", "--format=%H", "--", entry.path]);
    assert(commits.length === 1, `${entry.path} must have exactly one byte-creation commit, found ${commits.length}`);
    const creationCommit = commits[0];
    const additions = await gitLines(root, ["log", "--diff-filter=A", "--format=%H", "--", entry.path]);
    assert(additions.length === 1 && additions[0] === creationCommit, `${entry.path} creation history is ambiguous`);
    const changedPaths = await gitLines(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", creationCommit]);
    assert(changedPaths.length > 0 && changedPaths.every((file) => file.startsWith("docs/")), `${entry.path} was not created in a docs-only commit`);
    const { stdout: blob } = await execFileAsync("git", ["show", `${creationCommit}:${entry.path}`], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 8 * 1024 * 1024,
    });
    const creationSha = createHash("sha256").update(blob).digest("hex");
    assert(creationSha === entry.sha256, `${entry.path} creation blob differs from its locked SHA`);
    const currentSha = await sha256File(path.join(root, entry.path));
    assert(currentSha === creationSha, `${entry.path} current bytes differ from immutable creation blob`);
  }
}

export async function verifyGitAdditiveManifestBundles(root, records) {
  for (const record of records) {
    const immutableEntries = [
      { path: record.manifestPath, sha256: record.manifestSha256 },
      ...record.manifest.files,
    ];
    await verifyGitLockedPaths(root, immutableEntries);
    const creationCommits = [];
    for (const entry of immutableEntries) {
      const commits = await gitLines(root, ["log", "--format=%H", "--", entry.path]);
      assert(commits.length === 1, `${entry.path} must have exactly one byte-creation commit, found ${commits.length}`);
      const additions = await gitLines(root, ["log", "--diff-filter=A", "--format=%H", "--", entry.path]);
      assert(additions.length === 1 && additions[0] === commits[0], `${entry.path} creation history is ambiguous`);
      creationCommits.push(commits[0]);
    }
    assert(
      new Set(creationCommits).size === 1,
      `${record.manifestPath} and every protected file must share one byte-creation commit`
    );
  }
}

function validateClosedSchema(schema, label) {
  function visit(value, location) {
    if (!value || typeof value !== "object") return;
    if (value.type === "object") {
      assert(value.additionalProperties === false, `${label}${location} permits additional properties`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "additionalProperties") visit(child, `${location}/${key}`);
    }
  }
  visit(schema, "");
}

// Structural preregistration only: the future Phase 3 lock owns all gameplay,
// choice, tuning, evaluator, and evidence semantics.
export function validatePhase3PreregistrationFixture(fixture, schema, contentLock) {
  validateClosedSchema(schema, PHASE_3_SCHEMA_PATH);
  assert(
    schema?.$schema === "https://json-schema.org/draft/2020-12/schema",
    "Phase 3 newborn schema draft"
  );
  assert(schema?.$id === PHASE_3_SCHEMA_ID, "Phase 3 newborn schema stable ID");
  validateAgainstSchema(fixture, schema, "Phase 3 newborn fixture");
  assert(
    fixture && typeof fixture === "object" && !Array.isArray(fixture),
    "Phase 3 newborn fixture must be an object"
  );
  assert(fixture.schemaVersion === 1, "Phase 3 newborn fixture schema version");
  assert(fixture.fixtureId === PHASE_3_FIXTURE_ID, "Phase 3 newborn fixture ID");
  assert(fixture.phaseId === "phase-3", "Phase 3 newborn fixture phase ID");
  assert(
    fixture.contentLockId === PHASE_3_CONTENT_LOCK_ID,
    "Phase 3 newborn fixture content lock ID"
  );
  assert(contentLock?.lockId === PHASE_3_CONTENT_LOCK_ID, "Phase 3 newborn content lock ID");
  assert(contentLock?.content?.phaseId === "phase-3", "Phase 3 newborn content lock phase ID");
  return fixture;
}

function assertExactObject(value, expected, label) {
  if (Array.isArray(expected)) {
    assert(Array.isArray(value), `${label} must be an array`);
  } else {
    assertExactKeys(value, Object.keys(expected), label);
  }
  assert(deepEqual(value, expected), `${label} does not match the locked Phase 2 contract`);
}

export function validateRunnerFixture(fixture, schema, contentLock, registry) {
  validateClosedSchema(schema, PHASE_2_RUNNER_SCHEMA_PATH);
  assert(schema?.$schema === "https://json-schema.org/draft/2020-12/schema", "runner schema draft");
  assert(schema?.$id === "https://choice-of-life.example/schemas/runner-fixture-v1.schema.json", "runner schema stable ID");
  assert(schema?.title === "Choice of Life Runner Laboratory Fixture v1", "runner schema title");
  validateAgainstSchema(fixture, schema, "runner fixture");
  assertExactKeys(
    fixture,
    [
      "$schema", "schemaVersion", "fixtureId", "status", "phaseId", "contentLockId",
      "runtimeContentVersion", "evaluatorId", "population", "stage", "generator",
      "movement", "warning", "difficultyProfiles", "collision", "entityEffects",
      "patternTemplates", "markers", "completion", "assist",
      "initialState", "startAction", "logicalTickPipeline", "replay", "invariance", "accessibility",
      "assertions", "recomputationRequired",
    ],
    "runner fixture"
  );
  assert(fixture.$schema === "../runner-fixture-v1.schema.json", "runner fixture schema path");
  assert(fixture.schemaVersion === 1 && fixture.status === "locked", "runner fixture status/version");
  assert(fixture.fixtureId === PHASE_2_RUNNER_FIXTURE_ID, "runner fixture ID");
  assert(fixture.phaseId === "phase-2", "runner fixture phase ID");
  assert(fixture.contentLockId === PHASE_2_CONTENT_LOCK_ID, "runner fixture content lock ID");
  assert(fixture.runtimeContentVersion === PHASE_2_RUNTIME_CONTENT_VERSION, "runner fixture runtime content version");
  assert(fixture.evaluatorId === PHASE_2_EVALUATOR_ID, "runner fixture evaluator ID");
  assert(fixture.recomputationRequired === true, "runner fixture recomputation requirement");

  assert(contentLock?.lockId === fixture.contentLockId, "runner fixture content lock linkage");
  assert(contentLock?.content?.phaseId === fixture.phaseId, "runner fixture phase/content-lock linkage");
  assert(contentLock?.content?.contentVersion === PHASE_2_RUNTIME_CONTENT_VERSION, "runner fixture locked content version");
  assert(
    deepEqual(contentLock?.content?.evidenceIds, PHASE_2_EVIDENCE_IDS),
    "runner fixture content-lock evidence ID closure"
  );

  const population = fixture.population;
  assertExactKeys(
    population,
    [
      "seedSetId", "start", "endInclusive", "step", "count", "firstEncodedSeed",
      "lastEncodedSeed", "profileIds", "difficulties",
    ],
    "runner fixture population"
  );
  assert(population.seedSetId === registry.seedSet.id, "runner fixture seed set ID");
  assert(population.start === registry.seedSet.start, "runner fixture seed start");
  assert(population.endInclusive === registry.seedSet.endInclusive, "runner fixture seed end");
  assert(population.step === registry.seedSet.step, "runner fixture seed step");
  assert(population.count === registry.seedSet.count, "runner fixture seed count");
  assert(population.firstEncodedSeed === registry.seedSet.firstEncodedSeed, "runner fixture first encoded seed");
  assert(population.lastEncodedSeed === registry.seedSet.lastEncodedSeed, "runner fixture last encoded seed");
  assert(
    deepEqual(population.profileIds, registry.startingProfiles.map(({ id }) => id)),
    "runner fixture starting profile closure"
  );
  assert(deepEqual(population.difficulties, registry.difficulties), "runner fixture difficulty closure");

  const stage = fixture.stage;
  assertExactKeys(
    stage,
    [
      "stageIds", "patternIds", "durationTicks", "decisionWindowCount", "categoryCounts",
      "rollingHorizonPatterns", "firstWindowAnchorTick", "windowAnchorSpacingTicks",
      "lastWindowAnchorTick", "latestContactOffsetTicks", "latestPossibleContactTick", "tickDurationMs", "standalonePractice",
    ],
    "runner fixture stage"
  );
  assert(deepEqual(stage.stageIds, contentLock.content.stageIds), "runner fixture stage ID closure");
  assert(deepEqual(stage.patternIds, contentLock.content.patternIds), "runner fixture pattern ID closure");
  assert(deepEqual(stage.stageIds, ["runner-lab-v1"]), "runner fixture laboratory stage");
  assert(deepEqual(stage.patternIds, PHASE_2_PATTERN_IDS), "runner fixture laboratory pattern order");
  assert(stage.durationTicks === 3000, "runner fixture duration ticks");
  assert(stage.decisionWindowCount === 10, "runner fixture decision window count");
  assertExactObject(stage.categoryCounts, PHASE_2_PATTERN_IDS.map((patternId, index) => ({
    patternId,
    count: [4, 3, 2, 1][index],
  })), "runner fixture category counts");
  assert(stage.rollingHorizonPatterns === 3, "runner fixture rolling horizon");
  assert(stage.firstWindowAnchorTick === 300, "runner fixture first window anchor tick");
  assert(stage.windowAnchorSpacingTicks === 250, "runner fixture window anchor spacing ticks");
  assert(stage.lastWindowAnchorTick === 2550, "runner fixture last window anchor tick");
  assert(stage.latestContactOffsetTicks === 18, "runner fixture latest contact offset ticks");
  assert(stage.latestPossibleContactTick === 2568, "runner fixture latest possible contact tick");
  assert(stage.tickDurationMs === 20, "runner fixture tick duration");
  assert(stage.standalonePractice === true, "runner fixture standalone practice stage");

  assertExactObject(fixture.generator, {
    algorithmId: "runner-laboratory-generator-v1",
    permutationAlgorithm: "pattern-entropy-decorate-sort-v1",
    permutationTokenDerivation: "pattern-entropy-fnv1a32-v1(runSeed,stageId,initialPatternIndex+copyOrdinal,sequence-order)",
    copyOrdinalDomain: "global-multiset-index-0-through-9",
    permutationRank: "uint32-ascending",
    permutationTieBreak: ["template-index-ascending", "copy-index-ascending"],
    permutationKnownAnswerTestsRequired: true,
    copyOrdinalMapping: PHASE_2_COPY_ORDINAL_MAPPING,
    knownAnswers: PHASE_2_GENERATOR_KNOWN_ANSWERS,
    laneRotationSelection: "legal-rotations[floor(uint32-lane-rotation-times-length-div-2^32)]",
    deterministic: true,
    rerollAllowed: false,
    entropyInputs: ["runSeed", "stageId", "patternIndex", "entropyChannel"],
    entropyChannels: [
      "sequence-order",
      "lane-rotation",
      "optional-variant-risk-reward-secondary-v1",
      "optional-variant-avoid-secondary-hazard-v1",
    ],
    canonicalEntityOrder: ["patternIndex", "slotIndex", "instanceId"],
    coursePatternIndexStart: 1,
    initialPatternIndex: 0,
    initialResolvedThroughPatternIndex: 0,
    terminalPatternIndex: 11,
    spawnTickDerivation: "window-anchor-minus-difficulty-lead-ticks",
    newlySpawnedEntitiesAdvanceOnSpawnTick: false,
    spawnCursorSemantics: {
      nonterminalDistanceDerivation: "world-speed-milli-per-tick-times-next-spawn-tick",
      triggerPredicate: "simulation-tick-gte-next-spawn-tick-and-world-distance-gte-next-spawn-distance",
      triggerEvaluationBoundary: "post-transition-new-state-boundary-after-input-motion-tick-world-old-entity-advance-collision-and-terminalization-before-next-tick-input",
      cursorValuesByDifficulty: PHASE_2_SPAWN_CURSORS,
      immediateAppendOrder: [
        "append-canonical-pattern-entities",
        "set-pattern-index-to-greatest-appended-course-index",
        "set-next-spawn-tick-and-distance-to-following-cursor",
        "canonicalize-active-entities",
        "open-semantic-assist-prompt-and-add-pause-when-applicable",
        "save-durable-post-append-checkpoint",
      ],
      durableCheckpointSemantics: {
        countPerSpawnBoundary: 1,
        boundary: "after-applicable-semantic-prompt-is-derived-from-pending-marker-and-before-next-tick-input",
        reloadRule: "rederive-identical-semantic-prompt-from-persisted-pending-marker",
      },
      patternIndexSemantics: "greatest-appended-course-index-then-11-for-terminal-sentinel",
      resolvedThroughPatternIndexSemantics: "sentinel-0-at-entry-then-greatest-consecutive-course-pattern-with-marker-and-every-included-slot-terminal",
      resolvedThroughAdvanceBoundary: "after-canonical-terminal-resolution-of-that-pattern",
    },
    nextSpawnSentinel: {
      tick: 3001,
      distanceMilliByDifficulty: { story: 7802600, normal: 9003000, challenge: 10203400 },
      postLastPolicy: "retain-terminal-sentinel",
    },
    optionalInclusion: {
      appliesTo: "optional-group-id",
      tokenDerivation: "pattern-entropy-fnv1a32-v1(runSeed,stageId,patternIndex,optional-variant-then-group-id)",
      channelDerivation: "optional-variant-<optionalGroupId>",
      scale: 100,
      rule: "floor-uint32-times-100-div-2^32-strictly-less-than-optional-density",
      groupAtomic: true,
      knownAnswers: PHASE_2_OPTIONAL_KNOWN_ANSWERS,
    },
    maxLiveInteractiveEntities: 24,
  }, "runner fixture generator");
  assertExactObject(fixture.movement, {
    lanes: [0, 1, 2],
    laneCentersMilli: [0, 1000, 2000],
    tweenTicks: 11,
    bufferCapacity: 1,
    interpolationFormulaId: "source-plus-rounded-delta-times-elapsed-over-11-v1",
    movingCurrentLaneRule: "source-until-completion-then-target",
    laneRoleModuloMapping: {
      "rotation-origin": "rotation-mod-3",
      "rotation-next": "rotation-plus-1-mod-3",
      "rotation-previous": "rotation-plus-2-mod-3",
    },
    incomingStateClosure: {
      total: 107,
      idle: 7,
      bufferedIdle: 4,
      moving: 100,
      elapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      bufferedHandoffCompletionState: "idle-at-first-target",
      bufferedHandoffNextTickState: "moving-to-buffered-target-elapsed-1",
    },
  }, "runner fixture movement");
  assertExactObject(fixture.warning, {
    baseReactionTicks: 38,
    requiredMoveFloors: [
      { requiredMoves: 0, minWarningTicks: 38 },
      { requiredMoves: 1, minWarningTicks: 50 },
      { requiredMoves: 2, minWarningTicks: 60 },
    ],
    leadTicks: { story: 92, normal: 82, challenge: 82 },
    remainingMotionComputation: "exact-from-visible-interpolation-and-buffer",
  }, "runner fixture warning");
  assertExactObject(fixture.difficultyProfiles, PHASE_2_DIFFICULTY_PROFILES, "runner fixture difficulty profiles");
  assertExactObject(fixture.collision, {
    coordinateSystem: "integer-fixed-point",
    playerXMilli: 180000,
    playerHalfWidthMilli: 18000,
    laneHalfWidthMilli: 300,
    entityWidthMilli: 34000,
    contactXRule: "closed-interval-overlap-v1",
    laneContactRule: "absolute-player-lane-position-minus-entity-lane-center-lte-lane-half-width",
    laneContactBoundary: "closed",
    contactTickMeaning: "first-closed-horizontal-overlap-and-earliest-full-contact-for-lane-aligned-player",
    firstHorizontalOverlapEntityCenterXMilli: 215000,
    spawnXDerivation: "215000-plus-world-speed-times-difficulty-lead-plus-contact-offset-ticks",
    playerGeometryInvariant: true,
    hitboxNarrowerThanVisual: true,
    contactResolution: "at-most-once",
    negativeContactProofRequired: true,
    invulnerabilityTicks: 25,
    invulnerabilityInterval: "[contactTick,contactTick+25)",
    contactEffectIdentity: {
      entityInstanceIdGrammar: "entity-<16-lowercase-hex>",
      effectIdDerivation: "effect-<same-16-lowercase-hex>",
      source: "runner",
      transactionId: null,
      causedByChoiceId: null,
      simulationTick: "authoritative-contact-tick",
    },
    invulnerabilityByMode: {
      manual: "negative-authoritative-contact-sets-half-open-interval-overlap-hazards-pass-without-effect-benefits-apply",
      "semantic-assist": "negative-authoritative-contact-sets-half-open-interval-overlap-hazards-pass-without-effect-benefits-apply",
      "automatic-assist": "all-contacts-pass-nonauthoritative-no-contact-effects-no-future-invulnerability",
    },
    recoveryNullFutureInvulnerabilityRule: {
      scope: {
        runStatus: "active",
        stageId: "runner-lab-v1",
        stagePhase: "active",
        recovery: null,
      },
      allowedOnlyWhen: "the-most-recent-negative-runner-effect-and-its-contacted-resolved-hazard-entity-prove-the-current-half-open-invulnerability-window",
      proof: {
        entityContentIds: ["runner-lab-clutter-hazard-v1", "runner-lab-pressure-hazard-v1"],
        entityKind: "hazard",
        effectCategoryId: "runner-hazard-v1",
        effectSource: "runner",
        effectSelectionRule: "greatest-simulation-tick-then-greatest-recent-ledger-index-among-negative-runner-effects",
        effectMustBeMostRecentNegativeRunnerEffect: true,
        entityContactStateAtResolution: "contacted",
        entityInstanceIdMustAppearInResolvedEntityIds: true,
        entityToEffectLink: "effectId-is-exactly-effect-prefix-plus-the-contacted-entity-instance-id-hex-suffix",
        actualDeltaRule: "strictly-negative",
        tickRule: "effect-simulation-tick-lte-current-tick-lt-effect-simulation-tick-plus-25",
        invulnerableUntilTickRule: "equals-effect-simulation-tick-plus-25",
      },
      phase1SemanticsOutsideScope: "unchanged-recovery-required-for-future-invulnerability",
    },
    simultaneousContactOrderWitness: {
      witnessType: "nonpersisted-production-collision-primitive-unit-witness",
      runSeed: "0000000000000000",
      difficulty: "challenge",
      stageId: "runner-lab-v1",
      tick: 500,
      startingScores: { health: 50, happiness: 50, money: 50 },
      generatedCoordinatePremise: {
        patternIndex: 8,
        patternId: "runner-lab-risk-reward-v1",
        rotation: 2,
        optionalGroupId: "risk-reward-secondary-v1",
        optionalGroupIncluded: true,
        slotZero: {
          slotIndex: 0,
          instanceId: "entity-1cd2eb9e83a7722e",
          lifecycle: "already-terminal-before-synthetic-candidate-batch",
        },
      },
      syntheticContactQualification: {
        productionSeam: "canonical-contact-candidate-resolution-v1",
        contactQualificationOverride: "fixture-only-bypass-x-lane-and-contact-timing-after-valid-coordinate-identity-check",
        persistedRunStateAllowed: false,
      },
      entities: [
        { patternIndex: 8, slotIndex: 1, instanceId: "entity-22ff92fcaa2e78c3", contentId: "runner-lab-clutter-hazard-v1" },
        { patternIndex: 8, slotIndex: 2, instanceId: "entity-e312494944488c11", contentId: "runner-lab-happiness-token-v1" },
        { patternIndex: 8, slotIndex: 3, instanceId: "entity-6e72eeaf4d10d1ad", contentId: "runner-lab-pressure-hazard-v1" },
      ],
      preexistingResolvedEntityIds: ["entity-1cd2eb9e83a7722e"],
      inputPermutationCount: 6,
      canonicalCoordinateOrder: ["patternIndex", "slotIndex", "instanceId"],
      expectedEffectOrder: [
        "effect-22ff92fcaa2e78c3",
        "effect-e312494944488c11",
      ],
      expectedSuppressedEntityIds: ["entity-6e72eeaf4d10d1ad"],
      expectedNewlyResolvedEntityIds: ["entity-22ff92fcaa2e78c3", "entity-6e72eeaf4d10d1ad", "entity-e312494944488c11"],
      expectedFinalResolvedEntityIds: [
        "entity-1cd2eb9e83a7722e", "entity-22ff92fcaa2e78c3", "entity-6e72eeaf4d10d1ad", "entity-e312494944488c11",
      ],
      expectedFinalScores: { health: 49, happiness: 51, money: 50 },
      expectedInvulnerableUntilTick: 525,
      allSixInputPermutationsMustMatchExpectedProjection: true,
      canonicalBatchResultHashRule: "sha256-of-closed-batch-result-projection-must-be-identical-across-all-six-input-permutations",
      equivalentFinalProjection: [
        "batchResultSha256", "scores", "effectIds", "newlyResolvedEntityIds", "finalResolvedEntityIds", "invulnerableUntilTick",
      ],
    },
    safeBoundary: {
      closedOverlapTravelMilli: 70000,
      firstSafeTickFormula: "window-anchor-plus-contact-offset-plus-floor-70000-div-world-speed-plus-1",
      maximumOffsetTicksByDifficulty: { story: 45, normal: 42, challenge: 39 },
      quietWindowSafeTick: "window-anchor-tick",
      contactedEntitiesTerminalizeImmediately: true,
      uncontactedEntitiesPassAtFirstSafeTick: true,
      terminalEntitiesRemovedAndIdsRecorded: "end-of-terminal-tick-canonical-order",
      manualDecisionMarkerPasses: "pattern-first-safe-tick-after-latest-included-slot-or-anchor-for-quiet",
    },
  }, "runner fixture collision");
  assertExactObject(fixture.entityEffects, PHASE_2_ENTITY_EFFECTS, "runner fixture entity effects");
  assertExactObject(fixture.patternTemplates, PHASE_2_PATTERN_TEMPLATES, "runner fixture pattern templates");
  assertExactObject(fixture.markers, {
    initial: {
      contentId: "runner-lab-start-marker-v1",
      patternIndex: 0,
      representation: "resolved-id-sentinel",
      storedInActiveEntities: false,
      kind: "opportunity",
      slotIndex: 63,
      lane: 1,
      xMilli: 215000,
      widthMilli: 1,
      collisionParticipation: "none",
      instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
      resolvedEntityIdRecorded: true,
      acknowledgementRepresentation: "implicit-unresolved-by-id-absence-resolved-by-id-presence",
      lifecycle: "resolved-before-first-active-tick",
    },
    terminal: {
      contentId: "runner-lab-finish-marker-v1",
      patternIndex: 11,
      representation: "resolved-id-sentinel",
      storedInActiveEntities: false,
      kind: "opportunity",
      slotIndex: 63,
      lane: 1,
      xMilli: 215000,
      widthMilli: 1,
      collisionParticipation: "none",
      instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
      resolvedEntityIdRecorded: true,
      acknowledgementRepresentation: "implicit-unresolved-by-id-absence-resolved-by-id-presence",
      lifecycle: "resolves-on-terminal-active-tick",
    },
    decision: {
      contentId: "runner-lab-decision-marker-v1",
      representation: "runner-entity",
      kind: "opportunity",
      slotIndex: 63,
      lane: 1,
      widthMilli: 1,
      contactStateOnSpawn: "pending",
      collisionParticipation: "none",
      resolutionOwner: "assist-boundary",
      manualPassBoundary: "pattern-first-safe-tick-after-latest-included-slot-or-anchor-for-quiet",
      countPerPattern: 1,
      instanceIdDerivation: "stable-coordinate-v1-run-seed-stage-pattern-slot-content",
      spawnXDerivation: "215000-plus-world-speed-times-difficulty-lead-ticks",
      resolvedEntityIdRecorded: true,
      terminalLifecycleByMode: {
        manual: "passed-at-window-safe-boundary",
        "automatic-assist": "pending-at-spawn-checkpoint-then-resolved-in-next-ordinary-tick-atomic-commit",
        "semantic-assist": "resolved-before-unpause-in-atomic-selection-commit",
      },
      semanticAcknowledgementLifecycle: "derive-from-retained-resolved-marker-id-until-next-marker-or-completion-memory",
    },
    resolvedEntityIdRetention: {
      policy: "retain-all-until-stage-completion",
      maximumIds: 40,
      compaction: "none",
      ordering: "lexicographic-ascending-after-every-mutation",
      codecRejectsNoncanonicalOrder: true,
      supports: ["invulnerability-owner-proof", "semantic-acknowledgement-derivation"],
    },
  }, "runner fixture markers");
  assertExactObject(fixture.completion, {
    standalonePractice: true,
    terminalRunStatus: "completed",
    terminalStageStatus: "complete",
    stageSettlementApplied: true,
    terminalRunner: null,
    nextStageId: null,
    completionMemory: {
      memoryId: "memory-runner-laboratory-complete-v1",
      kind: "milestone",
      stageId: "runner-lab-v1",
      summary: "Completed the runner laboratory.",
      originChoiceId: null,
    },
    completionFact: {
      factId: "fact-runner-laboratory-complete-v1",
      kind: "learning",
      valueId: "value-runner-laboratory-practice-v1",
      originChoiceId: null,
    },
    automaticAssistContactEffectCount: 0,
    settlement: {
      appliedCountPerMode: 1,
      settlementId: "settlement-runner-laboratory-v1",
      tick: 3000,
      deterministic: true,
      idempotent: true,
      pendingSnapshot: {
        runStatus: "active",
        stagePhase: "settling",
        settlementStatus: "pending",
        startedTick: 3000,
        completedTick: null,
        runner: {
          present: true,
          patternIndex: 11,
          resolvedThroughPatternIndex: 11,
          activeEntities: [],
          finishMarkerResolvedIdPresent: true,
          finishMarkerEverActive: false,
        },
      },
      appliedSnapshot: {
        runStatus: "completed",
        stagePhase: "complete",
        settlementStatus: "applied",
        startedTick: 3000,
        completedTick: 3000,
        runner: null,
      },
      pendingCheckpointRequired: true,
      applicationTickDelta: 0,
      applicationMayResumeFromReload: true,
      transition: "separate-zero-tick-atomic-idempotent-apply-after-pending-checkpoint-or-reload",
      manual: { effectCount: 0 },
      "semantic-assist": { effectCount: 0 },
      "automatic-assist": {
        effectCountMinimum: 1,
        effectCountMaximum: 3,
        categoryId: "runner-lab-automatic-settlement-effect-v1",
        source: "system",
        transactionOwnedEffects: true,
        effectOrder: ["health", "happiness", "money"],
        zeroDeltaPolicy: "omit-effect",
        requestedDeltaDerivation: "neutral-manual-terminal-score-minus-automatic-pre-settlement-score",
        effectIdDerivation: {
          algorithmId: "settlement-score-id-format-v1",
          preimageFields: ["settlementId", "scoreId"],
          format: "effect-runner-laboratory-<scoreId>-v1",
          knownAnswers: [
            { scoreId: "health", effectId: "effect-runner-laboratory-health-v1" },
            { scoreId: "happiness", effectId: "effect-runner-laboratory-happiness-v1" },
            { scoreId: "money", effectId: "effect-runner-laboratory-money-v1" },
          ],
        },
        causedByChoiceId: null,
        simulationTick: 3000,
        nonemptyGuaranteedByAssertionId: "runner-automatic-settlement-idempotency-v1",
        nonemptyStructuralProof: {
          benefitForkCount: 4,
          benefitForkLaneCoverage: "all-three-lanes",
          neutralMinimumUtilityPerWindow: 0,
          aggregateRequestedDeltaSumMinimum: 4,
          conclusion: "at-least-one-nonzero-score-delta",
        },
      },
    },
    stateProjectionContract: {
      unchangedFromEntryThroughPendingAndApplied: {
        retainedSetupFields: [
          "schemaVersion", "contentVersion", "runId", "runSeed", "startingProfileId", "difficulty",
          "controlMode", "identity", "appearance", "accessibility",
        ],
        stageIdentity: { stageId: "runner-lab-v1", ageMonths: 0, durationTicks: 3000 },
        recovery: null,
        encounter: null,
        consequences: { pending: [], resolved: [], terminal: [] },
        storyAuxiliaryCollections: { credentials: [], relationships: [], conditions: [] },
      },
      commonPending: {
        simulationTick: 3000,
        activeTicks: 3000,
        worldDistanceMilliByDifficulty: { story: 7800000, normal: 9000000, challenge: 10200000 },
        runStatus: "active",
        stagePhase: "settling",
        settlementStatus: "pending",
        patternIndex: 11,
        resolvedThroughPatternIndex: 11,
        activeEntities: [],
        finishMarkerResolvedIdPresent: true,
        finishMarkerEverActive: false,
        storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
      },
      pendingByControlMode: {
        manual: { effectIds: [], transactionOwnedEffects: [] },
        "semantic-assist": { effectIds: [], transactionOwnedEffects: [] },
        "automatic-assist": {
          effectIdsAreReservedBeforeCheckpoint: true,
          exactOrderedNonzeroFutureEffectIdLists: [
            ["effect-runner-laboratory-health-v1"],
            ["effect-runner-laboratory-happiness-v1"],
            ["effect-runner-laboratory-money-v1"],
            ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1"],
            ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-money-v1"],
            ["effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"],
            ["effect-runner-laboratory-health-v1", "effect-runner-laboratory-happiness-v1", "effect-runner-laboratory-money-v1"],
          ],
          order: ["health", "happiness", "money"],
          zeroDeltaEffectIdsOmitted: true,
          transactionOwnedEffects: [],
        },
      },
      commonApplied: {
        simulationTick: 3000,
        activeTicks: 3000,
        worldDistanceMilliByDifficulty: { story: 7800000, normal: 9000000, challenge: 10200000 },
        runStatus: "completed",
        stagePhase: "complete",
        settlementStatus: "applied",
        patternIndexBeforeRunnerRemoval: 11,
        resolvedThroughPatternIndexBeforeRunnerRemoval: 11,
        runner: null,
        activeEntitiesBeforeRunnerRemoval: [],
        finishMarkerResolvedIdPresentBeforeRunnerRemoval: true,
        finishMarkerEverActive: false,
        storyState: {
          facts: [{
            factId: "fact-runner-laboratory-complete-v1",
            kind: "learning",
            valueId: "value-runner-laboratory-practice-v1",
            originChoiceId: null,
          }],
          memories: [{
            memoryId: "memory-runner-laboratory-complete-v1",
            kind: "milestone",
            stageId: "runner-lab-v1",
            summary: "Completed the runner laboratory.",
            originChoiceId: null,
          }],
          credentials: [],
          relationships: [],
          conditions: [],
        },
      },
      appliedByControlMode: {
        manual: { effectIds: [], transactionOwnedEffects: [] },
        "semantic-assist": { effectIds: [], transactionOwnedEffects: [] },
        "automatic-assist": {
          effectIdsRule: "exactly-identical-to-pending-effectIds",
          transactionOwnedEffectsRule: "exactly-one-applied-effect-for-each-pending-effectId-in-the-same-order",
        },
      },
    },
  }, "runner fixture completion");
  assertExactObject(fixture.assist, {
    modes: ["manual", "semantic-assist", "automatic-assist"],
    semanticTargetCompilesToAdjacentRequests: true,
    semanticPromptBoundary: "idle-null-buffer-only",
    promptOpenTickDerivation: "window-anchor-minus-difficulty-lead-ticks",
    semanticWaitingTickDelta: 0,
    semanticSelectionEnabledWhen: "semantic-prompt-is-sole-pause-reason",
    independentPauseSelectionBehavior: "reject-no-op-marker-pending-prompt-retained",
    neutralEvaluationCommandBoundaryByMode: {
      manual: "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
      "semantic-assist": "atomic-selection-step-at-prompt-open-tick",
      "automatic-assist": "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
    },
    rawLaneInputInSemanticAssist: {
      scope: "entire-mode",
      keyboard: "disabled",
      buttons: "disabled",
      swipe: "disabled",
    },
    targetStoredOutsideRunnerState: false,
    semanticSelectionCommit: {
      markerResolution: "resolve-before-logical-step",
      firstIntent: "one-adjacent-request-or-none-for-stay",
      logicalSteps: 1,
      secondIntent: "queue-same-direction-after-step-for-two-lane-target",
      commitMode: "single-atomic-state-and-save",
      resultingTickDelta: 1,
      twoLaneResult: "moving-elapsed-1-with-single-buffer",
      oneLaneResult: "moving-elapsed-1-with-null-buffer",
      stayResult: "idle-with-null-buffer",
      markerResolvedBeforeUnpause: true,
    },
    automaticDecisionCommit: {
      spawnCheckpoint: "decision-marker-pending-with-no-stored-target",
      targetDerivation: "recompute-neutral-manual-oracle-prefix-from-run-entry-through-current-marker",
      oracleEntryReconstruction: {
        source: "persisted-automatic-assist-entry-state",
        replaceControlModeWith: "manual",
        rederiveRunId: true,
        hashAlgorithm: "stateHashV1",
        liveAutomaticAssistHashAllowed: false,
      },
      oracleProjection: ["scores", "effects", "motion", "input-buffer", "resolved-entity-ids"],
      oraclePrefixStoredOutsideRunState: false,
      commitTick: "next-ordinary-active-tick",
      commitMode: "single-atomic-marker-motion-buffer-and-save",
      twoLaneResult: "moving-elapsed-1-with-single-buffer",
      oneLaneResult: "moving-elapsed-1-with-null-buffer",
      stayResult: "idle-with-null-buffer",
      resolvedMarkerWithUnsavedTargetAllowed: false,
    },
    automaticRequiresLaneInput: false,
    population: {
      seedCount: 10_000,
      profileCount: 4,
      difficultyCount: 3,
      pairedEntryCount: 120_000,
    },
    assertionIds: PHASE_2_ASSIST_ASSERTION_IDS,
  }, "runner fixture assist");
  assert(
    deepEqual(fixture.assist.assertionIds, contentLock.evaluation.assertionIds),
    "runner fixture Assist assertion/content-lock closure"
  );
  assertExactObject(fixture.initialState, {
    schemaVersion: 1,
    contentVersion: "phase-1-v1",
    runIdDerivation: "canonical-from-retained-setup-fields-after-control-mode-selection",
    runStatus: "active",
    retainedSetupFields: [
      "runId", "runSeed", "startingProfileId", "difficulty", "controlMode", "identity", "appearance", "accessibility",
    ],
    reinitializedGameplayFields: [
      "runStatus", "scores", "effectLedger", "storyState", "stage", "runner", "recovery", "encounter", "consequences", "simulationTick",
    ],
    stage: {
      stageId: "runner-lab-v1",
      phase: "active",
      ageMonths: 0,
      activeTicks: 0,
      worldDistanceMilli: 0,
      durationTicks: 3000,
      settlement: null,
    },
    scoresByStartingProfile: registry.startingProfiles.map(({ id: startingProfileId, scores }) => ({ startingProfileId, scores })),
    scoreSelectionRule: "scores-equal-the-exact-selected-starting-profile-scores",
    effectLedger: {
      recent: [],
      totalsBySource: {
        runner: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        choice: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        callback: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        settlement: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        recovery: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
        system: { healthPositive: 0, healthNegative: 0, happinessPositive: 0, happinessNegative: 0, moneyPositive: 0, moneyNegative: 0 },
      },
    },
    storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
    recovery: null,
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
    simulationTick: 0,
    runner: {
      motion: {
        kind: "idle",
        currentLane: 1,
        sourceLane: 1,
        targetLane: 1,
        elapsedTicks: 0,
        totalTicks: 11,
      },
      inputBuffer: null,
      spawnByDifficulty: PHASE_2_SPAWN_CURSORS.map(({ difficulty, spawnTicks, nextSpawnDistancesMilli }) => ({
        difficulty,
        patternIndex: 0,
        nextSpawnTick: spawnTicks[0],
        nextSpawnDistanceMilli: nextSpawnDistancesMilli[0],
        resolvedThroughPatternIndex: 0,
        resolvedEntityIds: [],
      })),
      activeEntities: [],
      invulnerableUntilTick: 0,
      userPaused: true,
    },
    invariants: {
      simulationTickEqualsStageActiveTicks: true,
      stageWorldDistanceEqualsDifficultySpeedTimesActiveTicks: true,
      initialSpeedRelationEvaluatesToZero: true,
      startMarkerResolvedIdPresent: false,
    },
  }, "runner fixture initial state");
  assertExactObject(fixture.startAction, {
    tickDelta: 0,
    activeTickDelta: 0,
    worldDistanceDeltaMilli: 0,
    insertStablePattern0Slot63ResolvedId: true,
    userPausedAfter: false,
  }, "runner fixture start action");
  assertExactObject(fixture.logicalTickPipeline, [
    "accept-at-most-one-intent-and-advance-motion",
    "increment-simulation-tick-active-ticks-and-world-distance",
    "advance-only-entities-existing-before-this-step",
    "resolve-collisions-effects-and-invulnerability-in-canonical-order",
    "terminalize-or-pass-and-record-resolved-ids-in-canonical-order",
    "evaluate-spawn-trigger-at-post-transition-new-state-boundary-before-next-tick-input",
    "append-due-pattern-at-new-state-boundary-without-advancing-new-entities",
    "open-semantic-prompt-and-add-semantic-pause-after-append",
    "save-durable-post-append-checkpoint-containing-pattern-marker-and-applicable-prompt",
    "at-tick-3000-resolve-finish-set-terminal-cursors-create-pending-settlement-and-save-durable-checkpoint",
  ], "runner fixture logical tick pipeline");
  assertExactObject(fixture.replay, {
    tweenElapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    snapshotClosure: [
      { boundaryId: "start-action", occurrence: "once", positions: ["before", "after"] },
      { boundaryId: "idle-null-buffer", occurrence: "every-reachable-state", positions: ["at-state"] },
      { boundaryId: "moving-null-buffer", occurrence: "every-tween-elapsed-tick", positions: ["at-state"] },
      { boundaryId: "moving-full-buffer", occurrence: "every-tween-elapsed-tick-and-legal-buffer", positions: ["at-state"] },
      { boundaryId: "movement-completion", occurrence: "every-source-target-pair", positions: ["before", "after"] },
      { boundaryId: "buffer-handoff", occurrence: "every-legal-buffered-handoff", positions: ["before", "after"] },
      { boundaryId: "semantic-assist-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
      { boundaryId: "automatic-assist-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
      { boundaryId: "manual-decision-marker", occurrence: "every-course-pattern", positions: ["before", "after"] },
      { boundaryId: "entity-contact", occurrence: "every-included-contacted-entity", positions: ["before", "after"] },
      { boundaryId: "safe-pass", occurrence: "every-included-uncontacted-entity-and-manual-marker", positions: ["before", "after"] },
      { boundaryId: "invulnerability-window", occurrence: "every-authoritative-negative-contact", positions: ["start", "last-protected-tick", "end"] },
      {
        boundaryId: "pause-reason",
        occurrence: "each-enumerated-reason",
        reasons: ["user", "semantic-assist", "visibility", "focus-interruption", "modal"],
        positions: ["pause", "resume"],
        firstResumedFrameTickDelta: 0,
      },
      { boundaryId: "pending-settlement-checkpoint", occurrence: "once-per-run", positions: ["durable-pending"] },
      { boundaryId: "applied-settlement", occurrence: "once-per-run", positions: ["after-apply", "completion"] },
    ],
    remainingSpawnIdComparisonCap: 50,
    futureEntityIdProjection: {
      startMarker: "include-unresolved-start-marker-id-before-start-and-omit-after-resolution",
      includedSlots: "include-every-unresolved-included-pattern-slot-id-in-canonical-coordinate-order",
      decisionMarkers: "include-every-unresolved-decision-marker-id",
      finishMarker: "include-unresolved-finish-marker-id-until-terminal-resolution",
      emissionOrder: ["patternIndex", "slotIndex", "instanceId"],
      remainingOnly: true,
      maximumIds: 50,
    },
    canonicalHashRequired: true,
    saveRoundTripRequired: true,
  }, "runner fixture replay");
  assertExactObject(fixture.invariance, {
    appearanceGameplayProjectionInvariant: true,
    genderGameplayProjectionInvariant: true,
    appearanceWitnessSeeds: [0, 1, 9999],
    appearanceAxes: {
      gender: ["female", "male"],
      heritageStyleId: ["asian", "western", "black", "middle-eastern"],
      hairStyleId: ["short-soft", "wavy-bob", "curly-crown", "tied-back"],
      hairColorId: ["black", "dark-brown", "warm-brown", "silver"],
      clothingPaletteId: ["sunrise", "meadow", "ocean", "berry"],
      selectionCount: 512,
    },
    gameplayProjectionFields: [
      "pattern-ids-and-rotations", "optional-group-inclusion", "collision-geometry", "logical-command-trace",
      "contact-ticks-and-outcomes", "effect-ids-and-requested-and-actual-deltas", "completion-fact",
      "completion-memory", "settlement", "final-scores",
    ],
    excludedPresentationFields: ["runId", "identity", "appearance", "accessibility"],
    pauseTickDrift: 0,
  }, "runner fixture invariance");
  assertExactObject(fixture.accessibility, {
    semanticChoiceAndReloadIdentity: {
      profileCount: 4,
      difficultyCount: 3,
      structuralPatternRotationCases: [
        { patternId: "runner-lab-benefit-fork-v1", rotation: 0 },
        { patternId: "runner-lab-benefit-fork-v1", rotation: 1 },
        { patternId: "runner-lab-benefit-fork-v1", rotation: 2 },
        { patternId: "runner-lab-risk-reward-v1", rotation: 0 },
        { patternId: "runner-lab-risk-reward-v1", rotation: 1 },
        { patternId: "runner-lab-risk-reward-v1", rotation: 2 },
        { patternId: "runner-lab-avoid-only-v1", rotation: 0 },
        { patternId: "runner-lab-avoid-only-v1", rotation: 1 },
        { patternId: "runner-lab-avoid-only-v1", rotation: 2 },
        { patternId: "runner-lab-quiet-window-v1", rotation: 0 },
      ],
      sourceLanes: [0, 1, 2],
      targetLanes: [0, 1, 2],
      persistenceBranches: ["normal", "reload-before-selection", "reload-after-selection"],
      branchComparisonRule: "each-entry-compares-all-three-persistence-branches",
      populationFormula: "4-profiles-times-3-difficulties-times-10-structural-cases-times-3-source-lanes-times-3-target-lanes",
      decisionEntries: 1080,
      pauseGuardReasons: ["visibility", "focus-interruption", "user", "modal"],
      pauseGuardInvariants: [
        "selection-is-rejected",
        "decision-marker-remains-pending",
        "simulation-tick-active-ticks-and-world-distance-remain-stable",
        "motion-input-buffer-active-entities-and-resolved-ids-remain-stable",
        "resume-restores-the-identical-semantic-choice-and-first-resumed-frame-advances-zero-ticks",
      ],
      totalEntries: 1084,
      semanticPersistenceIdentityFields: [
        "decision-marker-id-and-contact-state", "simulationTick", "stage.activeTicks", "stage.worldDistanceMilli",
        "runner.motion", "runner.inputBuffer", "stateHashV1", "future-entity-ids", "contact-outcomes",
        "effect-ids-and-requested-and-actual-deltas", "completion-fact", "completion-memory",
      ],
      manualGameplayParityFields: [
        "simulationTick", "stage.activeTicks", "stage.worldDistanceMilli", "runner.motion", "runner.inputBuffer",
        "future-scoring-entity-ids-excluding-assist-markers", "scoring-contact-outcomes",
        "effect-ids-and-requested-and-actual-deltas", "scores", "completion-fact", "completion-memory",
      ],
      manualGameplayParityExcludedFields: [
        "controlMode", "runId", "stateHashV1", "assist-pause-reasons", "decision-marker-state",
        "future-decision-marker-ids",
      ],
    },
    automaticNoInputCompletion: {
      population: 120000,
      rawLaneInputCount: 0,
      semanticChoiceInputCount: 0,
      startActivationCount: 1,
      completionRequired: true,
      settlementAppliedCount: 1,
      completionFactCount: 1,
      completionMemoryCount: 1,
      requiredInteractiveControlsAfterStart: 0,
      pendingCheckpointReloadRequired: true,
      appliedCompletionReloadRequired: true,
      oracleSource: "reconstructed-manual-entry-stateHashV1",
    },
    reducedMotionDomainIdentity: {
      savedPreferenceEntries: 120000,
      osPreferenceEntries: 120000,
      totalEntries: 240000,
      effectivePreferenceTruthTable: [
        { savedReducedMotion: false, osReducedMotion: false, effectiveReducedMotion: false },
        { savedReducedMotion: false, osReducedMotion: true, effectiveReducedMotion: true },
        { savedReducedMotion: true, osReducedMotion: false, effectiveReducedMotion: true },
        { savedReducedMotion: true, osReducedMotion: true, effectiveReducedMotion: true },
      ],
      allowedDifferences: ["visual-interpolation-duration", "decorative-motion", "camera-motion"],
      requiredIdentity: [
        "stateHashV1", "logical-commands", "simulation-timing", "collision-timing", "contact-ticks-and-outcomes",
        "effect-ids-and-deltas", "scores", "completion-state", "completion-fact", "completion-memory",
      ],
    },
    browserMatrix: {
      groupCounts: { completionReflow: 40, presentation: 72, safeAreaOneHand: 8, focus: 10, announcements: 9, total: 139 },
      completionReflowMatrix: {
        paths: ["manual-keyboard", "manual-buttons", "manual-swipe", "semantic-assist", "automatic-assist"],
        viewports: [
          { width: 1280, height: 720 },
          { width: 800, height: 360 },
          { width: 360, height: 800 },
          { width: 320, height: 568 },
        ],
        textScalePercent: [100, 200],
        count: 40,
      },
      presentationMatrix: {
        viewports: [
          { width: 1280, height: 720 },
          { width: 800, height: 360 },
          { width: 360, height: 800 },
          { width: 320, height: 568 },
        ],
        textScalePercent: [100, 200],
        contrast: ["standard", "high", "forced-colors"],
        motionSource: ["normal", "saved-reduced", "os-reduced"],
        count: 72,
      },
      safeAreaOneHandMatrix: {
        mobileViewports: [{ width: 360, height: 800 }, { width: 320, height: 568 }],
        textScalePercent: [100, 200],
        reach: ["left", "right"],
        count: 8,
      },
      contrast: {
        normalTextMinimumRatio: "4.5:1",
        largeTextMinimumRatio: "4.5:1",
        nonTextMinimumRatio: "3:1",
        colorAloneConveysMeaning: false,
        redundantCues: ["label", "icon-or-shape", "outline-or-pattern", "color"],
        forcedColorsTreatmentRequired: true,
        nonTextSubjects: ["controls", "focus", "lane-boundaries", "meaningful-graphics"],
      },
      reflow: {
        horizontalPageScrollAllowedAt320CssPx: false,
        textClippingAllowedAt200Percent: false,
        controlsObscurePlayerAllowed: false,
        obscuredFocusAllowed: false,
        undersizedTargetsAllowed: false,
        intentionalVerticalDocumentScrollAt200Percent: true,
      },
      entryPresentation: {
        initiallyPaused: true,
        orientationTextVisible: true,
        startControlElement: "button",
        startControlNative: true,
      },
      semanticStructure: {
        persistentRunnerRegion: {
          element: "section",
          accessibleName: "Runner status",
          headingId: "runner-status-heading",
        },
        runnerStateSummary: {
          element: "dl",
          fields: ["mode", "lane", "motion", "pause"],
          eachFieldHasTermAndDescription: true,
        },
        scoreOutputs: {
          visibleCount: 3,
          scoreOrder: ["health", "happiness", "money"],
          eachHasAccessibleNameAndValue: true,
        },
        decisionPrompt: {
          element: "fieldset",
          nativeFieldsetRequired: true,
          legendRequired: true,
          untimed: true,
          laneOrder: [0, 1, 2],
          enabledChoiceRequiredForEveryVisuallyAvailableLane: true,
          eachChoiceExposes: ["lane", "benefit", "hazard", "urgency"],
          informationHorizon: "never-beyond-the-visual-warning-horizon",
          sourceProjection: "same-locked-pattern-warning-projection-as-visual-playfield",
          renderCaseAssertionId: "runner-semantic-choice-and-reload-identity-v1",
          renderCaseCount: 1080,
        },
        progress: {
          element: "progress",
          minimum: 0,
          maximum: 3000,
          valueSource: "stage.activeTicks",
          accessibleName: "Runner laboratory progress",
        },
        playfield: {
          accessibilityTree: "excluded",
          ariaHidden: true,
          focusableDescendantsAllowed: false,
          movingEntityAccessibilityNodesAllowed: false,
        },
        persistentStatus: { role: "status", politeness: "polite", atomic: true },
        pauseResumeControlVisible: true,
        completionRecapHeadingFocusRequired: true,
      },
      manualButtons: {
        commands: ["lane-up", "lane-down"],
        labelled: true,
        minimumTargetCssPx: 44,
      },
      focusTransitions: [
        { transitionId: "entry-to-start", expectedFocus: "start-button" },
        { transitionId: "start-to-persistent-runner", expectedFocus: "pause-button" },
        { transitionId: "semantic-prompt-open", expectedFocus: "first-enabled-semantic-choice" },
        { transitionId: "semantic-choice-submit", expectedFocus: "runner-status-heading" },
        { transitionId: "user-pause-resume", expectedFocus: "user-resume-button" },
        { transitionId: "visibility-pause-resume", expectedFocus: "visibility-resume-button" },
        { transitionId: "focus-interruption-resume", expectedFocus: "focus-resume-button" },
        { transitionId: "modal-open", expectedFocus: "first-enabled-modal-control", requirements: ["background-inert", "forward-tab-contained", "backward-tab-contained"] },
        { transitionId: "modal-close", expectedFocus: "modal-invoker" },
        { transitionId: "completion", expectedFocus: "completion-recap-heading" },
      ],
      focusRules: {
        visibleIndicatorRequired: true,
        logicalOrderRequired: true,
        modalTabContainmentRequired: true,
        nonmodalFocusTrapAllowed: false,
        focusRestoredAfterPrompt: true,
      },
      interruptionCoalescing: {
        hiddenThenBlur: {
          retainedPauseReasons: ["visibility"],
          focusInterruptionAdded: false,
          explicitResumeActivationsRequired: 1,
          firstResumedFrameLogicalTickDelta: 0,
        },
        visibleThenBlur: {
          retainedPauseReasons: ["focus-interruption"],
          explicitResumeActivationsRequired: 1,
          firstResumedFrameLogicalTickDelta: 0,
        },
      },
      touchAndPointer: {
        minimumTargetCssPx: 44,
        surface: "dedicated-play-surface-only",
        touchAction: "pan-x",
        maximumActivePointers: 1,
        additionalPointerPolicy: "cancel-active-sequence-and-ignore-until-all-pointers-release",
        pointerCaptureBoundary: "capture-accepted-primary-pointer",
        pointerCancelResult: "cancel-without-lane-request",
        pointerReleaseRule: "release-capture-on-pointerup-pointercancel-and-lostpointercapture",
        verticalSwipeThresholdCssPx: 24,
        verticalMagnitudeMustExceedHorizontal: true,
        verticalSwipeDirectionMapping: { negativeDeltaY: "lane-up", positiveDeltaY: "lane-down" },
        synthesizedClickPolicy: "suppress-the-follow-up-click-from-the-consumed-pointer-sequence",
        maximumIntentsPerPointerSequence: 1,
        preventDefaultBoundary: "only-after-a-valid-vertical-swipe-is-recognized",
        outsideSurfaceScrollSuppressionAllowed: false,
        surroundingPageScrollableAt200PercentText: true,
      },
      keyboardAndRemapping: {
        immutableBindings: [
          { command: "lane-up", eventCode: "ArrowUp", ariaKeyshortcutsToken: "ArrowUp", displayLabel: "Up arrow" },
          { command: "lane-down", eventCode: "ArrowDown", ariaKeyshortcutsToken: "ArrowDown", displayLabel: "Down arrow" },
        ],
        supplementalRemappableDefaults: [
          { command: "lane-up", eventCode: "KeyW", ariaKeyshortcutsToken: "W", displayLabel: "W" },
          { command: "lane-down", eventCode: "KeyS", ariaKeyshortcutsToken: "S", displayLabel: "S" },
        ],
        remappableCommandSet: ["lane-up", "lane-down"],
        duplicateBindingPolicy: "reject",
        rejectedRemapKeys: ["Tab", "Escape", "Enter", "Space", "modifier-chord", "browser-reserved", "system-reserved"],
        persistence: "bounded-in-memory-current-mounted-session-only",
        localStorageAllowed: false,
        sessionStorageAllowed: false,
        runStateStorageAllowed: false,
        gameplayHashAffected: false,
        reloadRule: "restore-supplemental-KeyW-KeyS-defaults",
        resetRule: "restore-supplemental-KeyW-KeyS-defaults",
        instructionsUpdateImmediately: true,
        ariaKeyshortcutsUpdateImmediately: true,
        preventDefaultBoundary: "only-when-keydown-produces-an-accepted-intent",
        ignoredInputContexts: [
          "input", "select", "contenteditable", "open-dialog", "before-start", "semantic-assist-entire-mode",
          "paused-by-independent-reason", "stage-settling", "run-completed",
        ],
      },
      liveRegions: {
        structure: [
          { regionId: "runner-status", role: "status", politeness: "polite", atomic: true },
          { regionId: "runner-alert", role: "alert", politeness: "assertive", atomic: true },
        ],
        announcementWitnesses: [
          "approach-warning-with-lane-and-time",
          "actual-benefit-contact-with-score-and-delta",
          "actual-hazard-contact-with-score-and-delta",
          "suppressed-hazard-contact-with-no-score-change",
          "clamped-effect-result-with-requested-and-actual-delta",
          "semantic-prompt-open-and-choice-confirmation",
          "pause-and-resume-with-reason",
          "actionable-error-with-recovery-action",
          "completion-with-singleton-fact-and-memory",
        ],
        progress: { maximumAnnouncementsPerSecond: 1, boundaryAnnouncementsRequired: true },
        laneOutput: { ariaLive: false, updates: ["movement-start", "movement-end"] },
        throttle: { minimumIntervalMs: 1000, duplicateSuppression: true, latestMessageWinsWithinInterval: true },
        batching: {
          unit: "once-per-warning-or-result-group",
          perTickAnnouncementsAllowed: false,
          perEntityAnnouncementsAllowed: false,
        },
        requiredContent: ["lane", "actual-post-clamp-delta", "resulting-score", "suppressed-hazard"],
        optionalAnnouncements: {
          mayBeDisabled: true,
          fallback: "essential-visible-and-focus-readable-status-remains",
          actionableErrorsRemainRoleAlert: true,
        },
      },
      reducedMotionPresentation: {
        effectiveRule: "saved-reduced-motion-or-os-prefers-reduced-motion",
        disabledEffects: [
          "parallax", "continuous-world-translation", "shake", "pulse", "particles", "spatial-tween-animation",
        ],
        laneSchematic: { ariaHidden: true, snapsWithoutAnimation: true },
        nonLiveMovementTextFields: ["source-lane", "target-lane", "idle-or-moving", "urgency"],
        nonLiveMovementTextBoundary: ["movement-start", "movement-end"],
        simulationDomainIdentityRequired: true,
        mediaListenerDisposalRequired: true,
      },
      safeAreaAndOneHand: {
        safeAreaInsetsRequired: ["top", "right", "bottom", "left"],
        portraitControlsReachableWithEitherHand: true,
        landscapeControlsReachableWithEitherHand: true,
        essentialControlRequiresTwoHands: false,
        laneControlsInOneCluster: true,
        clusterPlacements: ["left", "right"],
        controlsInCluster: ["lane-up", "lane-down"],
        settingsAndDialogCloseRestoresExactInvokerFocus: true,
        interruptionResumeTargetsRelevantControlOrDecisionHeading: true,
      },
      audioRedundancy: {
        audioRequiredForGameplay: false,
        everyAudioCueHasVisualEquivalent: true,
        everyAudioCueHasTextEquivalent: true,
        everyAudioCueHasIconOrShapeEquivalent: true,
        visibleWarningsCompleteWithAudioMuted: true,
      },
      nonvisualManualReview: {
        required: true,
        keyboardOnlyRequired: true,
        screenReaderRequired: true,
        screenReaderChoice: ["NVDA", "VoiceOver"],
        compatibleBrowsersByPlatform: {
          Windows: ["Chrome", "Edge", "Firefox"],
          macOS: ["Chrome", "Edge", "Firefox", "Safari"],
        },
        minimumScreenReadersReviewed: 1,
        actualAssistiveTechnologySessionRequired: true,
        nonvisualSemanticCompletionRequired: true,
        forcedColorsInspectionRequired: true,
        evidenceArtifactRequired: true,
        automatedChecksAloneSufficient: false,
      },
    },
  }, "runner fixture accessibility");
  assertExactObject(fixture.assertions, PHASE_2_ASSERTIONS, "runner fixture assertions");
  return fixture;
}

export function validateRunnerEvidence(fixture, evidence, expectedSourceSha256) {
  assertExactKeys(
    evidence,
    [
      "schemaVersion", "fixtureId", "contentLockId", "evaluatedSourceSha256",
      "evaluatorId", "complete", "manualReviewEvidence", "assertionResults",
    ],
    "runner evidence"
  );
  assert(evidence.schemaVersion === 1, "runner evidence schema version");
  assert(evidence.fixtureId === fixture.fixtureId, "runner evidence fixture ID");
  assert(evidence.contentLockId === fixture.contentLockId, "runner evidence content lock ID");
  assert(typeof evidence.evaluatedSourceSha256 === "string" && SHA_PATTERN.test(evidence.evaluatedSourceSha256), "runner evidence source digest");
  assert(typeof expectedSourceSha256 === "string" && SHA_PATTERN.test(expectedSourceSha256), "expected runner evidence source digest");
  assert(evidence.evaluatedSourceSha256 === expectedSourceSha256, "runner evidence evaluated source mismatch");
  assert(evidence.evaluatorId === fixture.evaluatorId && evidence.evaluatorId === PHASE_2_EVALUATOR_ID, "runner evidence evaluator ID");
  assert(evidence.complete === true, "runner evidence is incomplete");
  assertExactKeys(
    evidence.manualReviewEvidence,
    ["assertionId", "status", "session", "artifact"],
    "runner nonvisual manual review evidence"
  );
  assert(
    evidence.manualReviewEvidence.assertionId === "runner-accessibility-browser-matrix-v1",
    "runner nonvisual manual review assertion ID"
  );
  assert(evidence.manualReviewEvidence.status === "complete", "runner nonvisual manual review incomplete");
  const manualSession = evidence.manualReviewEvidence.session;
  assertExactKeys(
    manualSession,
    [
      "sessionId", "reviewerId", "reviewerAttestation", "keyboardOnlyPassed", "keyboardInspectionPassed",
      "screenReader", "screenReaderVersion", "platform", "browser", "browserVersion", "completedAtUtc",
      "evaluatedSourceSha256",
      "focusTransitionCount", "announcementWitnessCount", "semanticStructurePassed", "semanticDecisionPromptPassed",
      "nonvisualSemanticCompletionPassed", "forcedColorsInspectionPassed", "completionPathPassed",
    ],
    "runner nonvisual manual review session"
  );
  assert(ID_PATTERN.test(manualSession.sessionId), "runner nonvisual manual review session ID");
  assert(ID_PATTERN.test(manualSession.reviewerId), "runner nonvisual manual review reviewer ID");
  assert(manualSession.reviewerAttestation === true, "runner nonvisual manual review attestation");
  assert(manualSession.keyboardOnlyPassed === true, "runner nonvisual keyboard-only review");
  assert(manualSession.keyboardInspectionPassed === true, "runner nonvisual keyboard inspection");
  assert(["NVDA", "VoiceOver"].includes(manualSession.screenReader), "runner nonvisual screen reader");
  assert(
    (manualSession.screenReader === "NVDA" && manualSession.platform === "Windows") ||
      (manualSession.screenReader === "VoiceOver" && manualSession.platform === "macOS"),
    "runner nonvisual screen reader platform"
  );
  assert(
    typeof manualSession.screenReaderVersion === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/.test(manualSession.screenReaderVersion),
    "runner nonvisual screen reader version"
  );
  assert(["Chrome", "Edge", "Firefox", "Safari"].includes(manualSession.browser), "runner nonvisual browser");
  const compatibleBrowsersByPlatform = {
    Windows: ["Chrome", "Edge", "Firefox"],
    macOS: ["Chrome", "Edge", "Firefox", "Safari"],
  };
  assert(
    compatibleBrowsersByPlatform[manualSession.platform]?.includes(manualSession.browser) === true,
    "runner nonvisual browser platform compatibility"
  );
  assert(
    typeof manualSession.browserVersion === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/.test(manualSession.browserVersion),
    "runner nonvisual browser version"
  );
  const manualCompletedAtMilliseconds = Date.parse(manualSession.completedAtUtc);
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manualSession.completedAtUtc) &&
      Number.isFinite(manualCompletedAtMilliseconds) &&
      new Date(manualCompletedAtMilliseconds).toISOString().replace(".000Z", "Z") === manualSession.completedAtUtc &&
      manualCompletedAtMilliseconds <= Date.now(),
    "runner nonvisual review completion time"
  );
  assert(manualSession.focusTransitionCount === 10, "runner nonvisual focus transition count");
  assert(manualSession.announcementWitnessCount === 9, "runner nonvisual announcement witness count");
  assert(manualSession.semanticStructurePassed === true, "runner nonvisual semantic structure review");
  assert(manualSession.semanticDecisionPromptPassed === true, "runner nonvisual Semantic decision prompt review");
  assert(manualSession.nonvisualSemanticCompletionPassed === true, "runner nonvisual Semantic completion review");
  assert(manualSession.forcedColorsInspectionPassed === true, "runner nonvisual forced-colors inspection");
  assert(manualSession.completionPathPassed === true, "runner nonvisual completion path review");
  assert(
    manualSession.evaluatedSourceSha256 === evidence.evaluatedSourceSha256 &&
      manualSession.evaluatedSourceSha256 === expectedSourceSha256,
    "runner nonvisual manual review source binding"
  );
  const manualArtifact = evidence.manualReviewEvidence.artifact;
  assertExactKeys(
    manualArtifact,
    ["artifactId", "format", "sha256"],
    "runner nonvisual manual review artifact"
  );
  assert(ID_PATTERN.test(manualArtifact.artifactId), "runner nonvisual manual review artifact ID");
  assert(manualArtifact.format === "embedded-manual-review-session-v1", "runner nonvisual manual review artifact format");
  assert(SHA_PATTERN.test(manualArtifact.sha256), "runner nonvisual manual review artifact digest");
  assert(
    manualArtifact.sha256 === runnerManualReviewArtifactSha256(manualSession),
    "runner nonvisual manual review artifact mismatch"
  );
  assert(Array.isArray(evidence.assertionResults), "runner evidence assertion results");
  const expectedAssertions = new Map(fixture.assertions.map((assertion) => [assertion.assertionId, assertion]));
  assert(expectedAssertions.size === fixture.assertions.length, "runner fixture duplicate assertion ID");
  const actualIds = evidence.assertionResults.map((result) => result?.assertionId);
  assert(new Set(actualIds).size === actualIds.length, "runner evidence duplicate assertion ID");
  assert(deepEqual(sorted(actualIds), sorted(expectedAssertions.keys())), "runner evidence assertion ID closure");
  for (const result of evidence.assertionResults) {
    assertExactKeys(
      result,
      ["assertionId", "status", "passed", "population", "failureCount", "groupCounts"],
      `runner evidence assertion ${result?.assertionId}`
    );
    const expected = expectedAssertions.get(result.assertionId);
    assert(result.status === "complete", `runner evidence assertion incomplete ${result.assertionId}`);
    assert(result.passed === true, `runner evidence assertion failed ${result.assertionId}`);
    assert(result.population === expected?.population, `runner evidence assertion population ${result.assertionId}`);
    assert(result.failureCount === 0, `runner evidence assertion failure count ${result.assertionId}`);
    assert(deepEqual(result.groupCounts, expected?.groupCounts), `runner evidence assertion group counts ${result.assertionId}`);
  }
  return evidence;
}

export function validateRegistryObject(registry, schema = DEFAULT_REGISTRY_SCHEMA) {
  validateAgainstSchema(registry, schema, "fixture registry");
  assertExactKeys(
    registry,
    [
      "$schema", "schemaVersion", "registryId", "status", "scoreOrder", "seedSet",
      "difficulties", "pairingKeys", "statistics", "metrics", "numericGoals",
      "narrativeGoals", "startingProfiles", "defaultStartingProfileId", "profileRules",
      "horizons", "canonicalPolicies", "continuation", "assertions", "evaluationSuites",
      "changePolicy",
    ],
    "registry"
  );
  assert(registry.$schema === "./fixture-registry-v1.schema.json", "registry schema path");
  assert(registry.schemaVersion === 1, "registry schema version");
  assert(registry.registryId === "choice-of-life-balance-v1", "registry ID");
  assert(registry.status === "locked", "registry is not locked");
  assert(JSON.stringify(registry.scoreOrder) === JSON.stringify(SCORE_IDS), "score order");
  assert(JSON.stringify(registry.difficulties) === JSON.stringify(["story", "normal", "challenge"]), "difficulties");
  assert(
    JSON.stringify(registry.pairingKeys) === JSON.stringify(["runSeed", "startingProfileId", "difficulty"]),
    "pairing keys"
  );

  const seed = registry.seedSet;
  assert(seed.start === 0 && seed.endInclusive === 9999 && seed.step === 1 && seed.count === 10000, "seed range");
  assert(seed.runSeedEncoding === "lowercase-hex-16-zero-padded", "seed encoding");
  const expanded = Array.from({ length: 10000 }, (_, index) => index.toString(16).padStart(16, "0")).join("\n");
  const bytes = Buffer.from(expanded, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert(bytes.length === seed.expandedByteLength, "seed byte length");
  assert(digest === seed.expandedSha256, "seed SHA-256");
  assert(expanded.slice(0, 16) === seed.firstEncodedSeed, "first seed");
  assert(expanded.slice(-16) === seed.lastEncodedSeed, "last seed");

  const numericGoalIds = assertUniqueIds(registry.numericGoals, "numeric goals");
  assert(
    JSON.stringify([...numericGoalIds]) ===
      JSON.stringify(["health-first-v1", "happiness-first-v1", "security-first-v1", "balanced-v1"]),
    "numeric goal set/order"
  );
  for (const goal of registry.numericGoals) {
    assertExactKeys(goal, ["id", "weights"], `numeric goal ${goal.id}`);
    assertExactKeys(goal.weights, ["numerators", "denominator"], `weights ${goal.id}`);
    assert(goal.weights.numerators.length === 3, `weight count ${goal.id}`);
    assert(goal.weights.numerators.every((n) => Number.isSafeInteger(n) && n > 0), `weight value ${goal.id}`);
    assert(goal.weights.numerators.reduce((sum, n) => sum + n, 0) === goal.weights.denominator, `weight sum ${goal.id}`);
  }

  const narrativeGoalIds = assertUniqueIds(registry.narrativeGoals, "narrative goals");
  assert(narrativeGoalIds.size === 4, "narrative goal count");
  for (const goal of registry.narrativeGoals) {
    assert(goal.qualifyingEvidenceQuantifier === "any", `narrative quantifier ${goal.id}`);
    assert(goal.qualifyingEvidence.length === 4, `narrative evidence ${goal.id}`);
  }

  const profileIds = assertUniqueIds(registry.startingProfiles, "starting profiles");
  assert(profileIds.has(registry.defaultStartingProfileId), "default profile missing");
  for (const profile of registry.startingProfiles) {
    assertExactKeys(profile.scores, SCORE_IDS, `scores ${profile.id}`);
    const values = SCORE_IDS.map((score) => profile.scores[score]);
    assert(values.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100), `profile score ${profile.id}`);
    assert(values.reduce((sum, value) => sum + value, 0) === 160, `profile total ${profile.id}`);
    assert(Array.isArray(profile.mechanicalFacts) && profile.mechanicalFacts.length === 0, `profile facts ${profile.id}`);
  }
  const maxProfileDistance = fractionValue(
    registry.metrics.startingProfileMedianDistanceMax,
    "profile distance threshold"
  );
  for (let left = 0; left < registry.startingProfiles.length; left += 1) {
    for (let right = left + 1; right < registry.startingProfiles.length; right += 1) {
      const a = registry.startingProfiles[left].scores;
      const b = registry.startingProfiles[right].scores;
      const distance = SCORE_IDS.reduce((sum, score) => sum + Math.abs(a[score] - b[score]), 0) / 300;
      assert(distance <= maxProfileDistance, `profile distance ${left}/${right}`);
      const dominates = SCORE_IDS.every((score) => a[score] >= b[score]) || SCORE_IDS.every((score) => b[score] >= a[score]);
      assert(!dominates, `profile Pareto dominance ${left}/${right}`);
    }
  }
  assert(registry.profileRules.protectedTraitsMayNotSelectOrModifyProfile === true, "protected profile rule");
  assert(registry.profileRules.profileDistanceComparison === "all-pairs", "profile comparison mode");
  assert(
    deepEqual(registry.profileRules.profileMayNotBeDerivedFrom, [
      "caregiverCount", "caregiverGender", "caregiverJob", "housing", "geography",
      "immigrationStatus", "appearance", "heritage",
    ]),
    "protected profile derivation dimensions"
  );
  assert(
    deepEqual(registry.profileRules.forbiddenMechanicalDimensions, [
      "race", "ethnicity", "nationality", "gender", "sexualOrientation",
      "disability", "religion", "familyStructure",
    ]),
    "forbidden mechanical dimensions"
  );

  const horizonIds = assertUniqueIds(registry.horizons, "horizons");
  const policyIds = assertUniqueIds(registry.canonicalPolicies, "policies");
  const policiesById = new Map(registry.canonicalPolicies.map((policy) => [policy.id, policy]));
  const assertionIds = assertUniqueIds(registry.assertions, "assertions");
  const suiteIds = assertUniqueIds(registry.evaluationSuites, "evaluation suites");
  const allIds = [
    ...numericGoalIds, ...narrativeGoalIds, ...profileIds, ...horizonIds,
    ...policyIds, ...assertionIds, ...suiteIds,
  ];
  assert(new Set(allIds).size === allIds.length, "IDs collide across registry domains");
  assert(
    deepEqual([...assertionIds], [
      "runner-share-bounds-v1", "decision-share-minimum-v1", "decision-influence-ratio-v1",
      "profile-distance-parity-v1", "profile-route-coverage-parity-v1", "score-boundary-time-v1",
      "choice-clamp-loss-v1", "semantic-assist-effect-identity-v1",
      "automatic-assist-score-parity-v1", "assist-narrative-parity-v1",
    ]),
    "assertion set/order"
  );
  assert(
    deepEqual([...suiteIds], [
      "attribution-v1", "influence-ratio-v1", "profile-parity-v1", "saturation-v1", "assist-parity-v1",
    ]),
    "evaluation suite set/order"
  );

  assert(ID_PATTERN.test(registry.seedSet.id), "seed set ID");
  const expectedHorizonParameters = new Map([
    ["stage-settlement-v1", ["contentVersion", "stageId"]],
    ["playable-slice-v1", ["contentVersion", "startStageId", "endStageId", "includedCallbackIds"]],
    ["option-effect-v1", ["contentVersion", "startStageId", "endStageId", "includedCallbackIds", "optionIds"]],
    ["phase6-career-ending-v1", ["contentVersion", "includedCallbackIds", "careerOfferIds"]],
    ["complete-life-v1", ["contentVersion", "includedCallbackIds"]],
  ]);
  for (const horizon of registry.horizons) {
    assert(
      deepEqual(horizon.contentLockParameters, expectedHorizonParameters.get(horizon.id)),
      `horizon parameter contract ${horizon.id}`
    );
  }

  for (const policy of registry.canonicalPolicies) {
    const algorithm = policy.algorithm;
    if (Object.hasOwn(algorithm, "utilityGoalId")) {
      assert(numericGoalIds.has(algorithm.utilityGoalId), `policy numeric utility goal ${policy.id}`);
    }
    if (Object.hasOwn(algorithm, "goalId")) {
      const expectedGoals = algorithm.kind === "choice-narrative-locked-evidence-v1" ? narrativeGoalIds : numericGoalIds;
      assert(expectedGoals.has(algorithm.goalId), `policy goal domain ${policy.id}`);
    }
    const expectedPolicyDomains = {
      basePolicyId: "runner",
      runnerContinuationPolicyId: "runner",
      choiceContinuationPolicyId: "choice",
      secondaryPolicyId: "choice",
    };
    for (const [key, domain] of Object.entries(expectedPolicyDomains)) {
      if (Object.hasOwn(algorithm, key)) {
        assert(policiesById.get(algorithm[key])?.domain === domain, `policy reference domain ${policy.id}/${key}`);
      }
    }
    if (Object.hasOwn(algorithm, "horizonId")) assert(horizonIds.has(algorithm.horizonId), `policy horizon ${policy.id}`);
  }
  assert(policiesById.get(registry.continuation.runnerPolicyId)?.domain === "runner", "continuation runner domain");
  assert(policiesById.get(registry.continuation.choicePolicyId)?.domain === "choice", "continuation choice domain");

  const expectedThresholdPaths = new Map([
    ["runner-share-bounds-v1", ["/metrics/attribution/runnerMedianMin", "/metrics/attribution/runnerMedianMax"]],
    ["decision-share-minimum-v1", ["/metrics/attribution/decisionMedianMin", null]],
    ["decision-influence-ratio-v1", ["/metrics/decisionToRunnerDistanceRatioMin", null]],
    ["profile-distance-parity-v1", [null, "/metrics/startingProfileMedianDistanceMax"]],
    ["profile-route-coverage-parity-v1", [null, null]],
    ["score-boundary-time-v1", [null, "/metrics/boundaryActiveTimeMax"]],
    ["choice-clamp-loss-v1", [null, "/metrics/choiceClampLossMax"]],
    ["semantic-assist-effect-identity-v1", [null, null]],
    ["automatic-assist-score-parity-v1", [null, "/metrics/assistPerScorePointTolerance"]],
    ["assist-narrative-parity-v1", [null, null]],
  ]);
  for (const assertion of registry.assertions) {
    const expectedPaths = expectedThresholdPaths.get(assertion.id);
    assert(
      expectedPaths !== undefined
        && assertion.lowerThresholdPath === expectedPaths[0]
        && assertion.upperThresholdPath === expectedPaths[1],
      `assertion threshold path contract ${assertion.id}`
    );
    for (const key of ["lowerThresholdPath", "upperThresholdPath"]) {
      if (assertion[key] !== null) {
        const threshold = resolvePointer(registry, assertion[key]);
        const validScalar = Number.isSafeInteger(threshold) && threshold >= 0;
        let validFraction = false;
        if (threshold && typeof threshold === "object" && !Array.isArray(threshold)) {
          try {
            fractionValue(threshold, `assertion threshold ${assertion.id}/${key}`);
            validFraction = true;
          } catch {
            validFraction = false;
          }
        }
        assert(validScalar || validFraction, `assertion threshold is not numeric ${assertion.id}/${key}`);
      }
    }
  }
  for (const suite of registry.evaluationSuites) {
    assert(suite.activation === "when-content-lock-references-suite", `suite activation ${suite.id}`);
    assert(Array.isArray(suite.assertionIds) && suite.assertionIds.length > 0, `empty suite ${suite.id}`);
    assert(suite.assertionIds.every((id) => assertionIds.has(id)), `suite assertion ${suite.id}`);
    assert(horizonIds.has(suite.horizonId), `suite horizon ${suite.id}`);
    assert(suite.seedSetId === registry.seedSet.id, `suite seed set ${suite.id}`);
    assert(suite.profiles === "all" && suite.difficulties === "all-separately", `suite cells ${suite.id}`);
    function validateSuiteReferences(value, location) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key.endsWith("PolicyId") || key === "policyA" || key === "policyB") {
          let expectedDomain = null;
          if (key === "policyA" || key === "policyB") {
            if (location.includes("decisionComparison")) expectedDomain = "choice";
            if (location.includes("runnerComparison")) expectedDomain = "runner";
          } else if (/choice/i.test(key)) {
            expectedDomain = "choice";
          } else if (/runner|manual|assist/i.test(key)) {
            expectedDomain = "runner";
          }
          const policy = policiesById.get(child);
          assert(policy !== undefined, `suite policy ${suite.id}/${location}${key}`);
          if (expectedDomain !== null) {
            assert(policy.domain === expectedDomain, `suite policy domain ${suite.id}/${location}${key}`);
          }
        } else if (key === "choicePolicies") {
          assert(child.every((id) => policiesById.get(id)?.domain === "choice"), `suite choice policy domain ${suite.id}`);
        } else if (key === "distanceMetric") {
          assert(Object.hasOwn(registry.metrics, child), `suite metric ${suite.id}/${child}`);
        } else {
          validateSuiteReferences(child, `${location}${key}/`);
        }
      }
    }
    validateSuiteReferences(suite, "");
  }
  assert(registry.changePolicy.registryV1IsByteImmutableAfterLock === true, "registry immutable rule");
  assert(registry.changePolicy.observedFailureAloneIsNotAValidReason === true, "change reason rule");
  return registry;
}

function idSet(values, label, { nonempty = false } = {}) {
  assert(Array.isArray(values), `${label} must be an array`);
  assert(!nonempty || values.length > 0, `${label} must not be empty`);
  assert(values.every((id) => typeof id === "string" && ID_PATTERN.test(id)), `${label} invalid ID`);
  assert(new Set(values).size === values.length, `${label} duplicate ID`);
  return new Set(values);
}

function subset(values, allowed, label) {
  for (const value of values) assert(allowed.has(value), `${label} unknown/wrong-domain ID ${value}`);
}

export function validateContentLock(
  lock,
  registry,
  hashes,
  knownLockIds = new Set(),
  schema = DEFAULT_CONTENT_LOCK_SCHEMA
) {
  validateAgainstSchema(lock, schema, `content lock ${lock?.lockId ?? "unknown"}`);
  assertExactKeys(
    lock,
    ["$schema", "schemaVersion", "lockId", "status", "registry", "commitProtocol", "content", "horizon", "evaluation", "expectedDirectionalResults", "supersession", "review"],
    "content lock"
  );
  assert(lock.$schema === "../content-lock-v1.schema.json", "content-lock schema path");
  assert(lock.schemaVersion === 1 && lock.status === "locked" && ID_PATTERN.test(lock.lockId), "content-lock identity");
  assert(lock.registry.registryId === registry.registryId, "content-lock registry ID");
  assert(lock.registry.registrySha256 === hashes.registry, "content-lock registry hash");
  assert(lock.registry.registrySchemaSha256 === hashes.registrySchema, "content-lock registry schema hash");
  assert(
    lock.commitProtocol.docsOnly
      && lock.commitProtocol.precedesContentEffectsAndTuning
      && lock.commitProtocol.lockCommitRecordedInPhaseReview
      && lock.commitProtocol.lockedInstanceIsByteImmutable,
    "content-lock commit protocol"
  );
  assert(/^phase-(?:[1-9]|1[01])$/.test(lock.content.phaseId), "content-lock phase ID");
  assert(ID_PATTERN.test(lock.content.contentVersion), "content version");

  const contentDomains = {};
  for (const [key, nonempty] of [["stageIds", true], ["contextIds", true], ["patternIds", false], ["choiceIds", false], ["optionIds", false], ["callbackIds", false], ["careerOfferIds", false], ["evidenceIds", false], ["comparatorIds", false]]) {
    contentDomains[key] = idSet(lock.content[key], `content.${key}`, { nonempty });
  }
  const contentIds = Object.values(contentDomains).flatMap((domain) => [...domain]);
  assert(new Set(contentIds).size === contentIds.length, "content IDs collide across domains");
  const authoredContentCount = [
    "patternIds", "choiceIds", "optionIds", "callbackIds", "careerOfferIds", "evidenceIds", "comparatorIds",
  ].reduce((sum, key) => sum + contentDomains[key].size, 0);
  assert(authoredContentCount > 0, `phase ${lock.content.phaseId} has no phase-applicable content`);
  if (lock.content.phaseId === "phase-2" || lock.content.phaseId === "phase-3") {
    assert(contentDomains.patternIds.size > 0, `phase ${lock.content.phaseId} requires a locked pattern`);
  }
  if (lock.content.phaseId === "phase-4" || lock.content.phaseId === "phase-5") {
    assert(
      contentDomains.choiceIds.size > 0 && contentDomains.optionIds.size > 0,
      `phase ${lock.content.phaseId} has no phase-applicable content`
    );
  }
  if (lock.content.phaseId === "phase-6") {
    assert(contentDomains.careerOfferIds.size > 0, "phase phase-6 requires a locked career offer");
  }
  const horizonIds = new Set(registry.horizons.map(({ id }) => id));
  assert(horizonIds.has(lock.horizon.horizonId), "content-lock horizon");
  const exactHorizonKeys = {
    "stage-settlement-v1": ["horizonId", "stageId"],
    "playable-slice-v1": ["horizonId", "startStageId", "endStageId", "includedCallbackIds"],
    "option-effect-v1": ["horizonId", "startStageId", "endStageId", "includedCallbackIds", "optionIds"],
    "phase6-career-ending-v1": ["horizonId", "includedCallbackIds", "careerOfferIds"],
    "complete-life-v1": ["horizonId", "includedCallbackIds"],
  }[lock.horizon.horizonId];
  assertExactKeys(lock.horizon, exactHorizonKeys, "content-lock horizon parameters");
  for (const key of ["stageId", "startStageId", "endStageId"]) {
    if (lock.horizon[key]) assert(contentDomains.stageIds.has(lock.horizon[key]), `horizon ${key}`);
  }
  if (lock.horizon.includedCallbackIds) subset(lock.horizon.includedCallbackIds, contentDomains.callbackIds, "horizon callbacks");
  if (lock.horizon.optionIds) subset(lock.horizon.optionIds, contentDomains.optionIds, "horizon options");
  if (lock.horizon.careerOfferIds) subset(lock.horizon.careerOfferIds, contentDomains.careerOfferIds, "horizon careers");

  const policies = new Map(registry.canonicalPolicies.map((policy) => [policy.id, policy]));
  const suites = new Map(registry.evaluationSuites.map((suite) => [suite.id, suite]));
  const assertions = new Set(registry.assertions.map(({ id }) => id));
  const narrativeGoals = new Set(registry.narrativeGoals.map(({ id }) => id));
  const selectedSuites = idSet(lock.evaluation.suiteIds, "evaluation suites", { nonempty: true });
  subset(selectedSuites, new Set(suites.keys()), "evaluation suites");
  const selectedAssertions = idSet(lock.evaluation.assertionIds, "evaluation assertions", { nonempty: true });
  subset(selectedAssertions, assertions, "evaluation assertions");
  const requiredAssertions = new Set();
  for (const suiteId of selectedSuites) {
    for (const assertionId of suites.get(suiteId).assertionIds) requiredAssertions.add(assertionId);
  }
  subset(requiredAssertions, selectedAssertions, "suite assertion closure");
  subset(selectedAssertions, requiredAssertions, "selected assertion closure");
  const runnerPolicies = idSet(lock.evaluation.runnerPolicyIds, "runner policies", { nonempty: true });
  const choicePolicies = idSet(lock.evaluation.choicePolicyIds, "choice policies", { nonempty: true });
  for (const id of runnerPolicies) assert(policies.get(id)?.domain === "runner", `runner policy wrong domain ${id}`);
  for (const id of choicePolicies) assert(policies.get(id)?.domain === "choice", `choice policy wrong domain ${id}`);
  const selectedComparators = idSet(lock.evaluation.comparatorIds, "evaluation comparators");
  subset(selectedComparators, contentDomains.comparatorIds, "comparators");
  const requiredRunnerPolicies = new Set();
  const requiredChoicePolicies = new Set();
  function collectPolicyReference(id, label) {
    const policy = policies.get(id);
    assert(policy, `${label} unknown policy ${id}`);
    (policy.domain === "runner" ? requiredRunnerPolicies : requiredChoicePolicies).add(id);
  }
  function collectSuitePolicyReferences(value, label) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith("PolicyId") || key === "policyA" || key === "policyB") {
        collectPolicyReference(child, `${label}/${key}`);
      } else if (key === "choicePolicies") {
        for (const id of child) collectPolicyReference(id, `${label}/${key}`);
      } else {
        collectSuitePolicyReferences(child, `${label}/${key}`);
      }
    }
  }
  for (const suiteId of selectedSuites) {
    const suite = suites.get(suiteId);
    assert(suite.horizonId === lock.horizon.horizonId, `suite horizon mismatch ${suiteId}`);
    collectSuitePolicyReferences(suite, `suite ${suiteId}`);
  }
  subset(requiredRunnerPolicies, runnerPolicies, "suite runner policy closure");
  subset(requiredChoicePolicies, choicePolicies, "suite choice policy closure");
  for (const mapping of lock.evaluation.narrativeGoalMappings) {
    assert(contentDomains.optionIds.has(mapping.optionId), `narrative option ${mapping.optionId}`);
    subset(idSet(mapping.goalIds, `narrative goals ${mapping.optionId}`, { nonempty: true }), narrativeGoals, "narrative goals");
    subset(
      idSet(mapping.qualifyingEvidenceIds, `narrative evidence ${mapping.optionId}`, { nonempty: true }),
      contentDomains.evidenceIds,
      "narrative evidence"
    );
  }
  assert(
    new Set(lock.evaluation.narrativeGoalMappings.map((mapping) => mapping.optionId)).size ===
      lock.evaluation.narrativeGoalMappings.length,
    "duplicate narrative option mapping"
  );
  idSet(lock.evaluation.contentThresholds.map(({ id }) => id), "content threshold IDs");
  for (const threshold of lock.evaluation.contentThresholds) {
    assert(selectedAssertions.has(threshold.assertionId), `threshold assertion ${threshold.assertionId}`);
    fractionValue(threshold.value, `threshold ${threshold.id}`);
  }
  const allPolicies = new Set([...runnerPolicies, ...choicePolicies]);
  idSet(lock.expectedDirectionalResults.map(({ id }) => id), "expected result IDs", { nonempty: true });
  for (const result of lock.expectedDirectionalResults) {
    assert(contentDomains.contextIds.has(result.contextId), `expected context ${result.contextId}`);
    assert(allPolicies.has(result.policyAId) && allPolicies.has(result.policyBId), `expected policy ${result.id}`);
    assert(selectedAssertions.has(result.assertionId), `expected assertion ${result.id}`);
  }
  if (lock.supersession.supersedesLockId === null) {
    assert(lock.supersession.reason === null, "new lock has supersession reason");
    assert(lock.supersession.newlyRealizedCallbackIds.length === 0, "initial lock has newly realized callbacks");
  } else {
    assert(lock.supersession.supersedesLockId !== lock.lockId, "lock supersedes itself");
    assert(knownLockIds.has(lock.supersession.supersedesLockId), "unknown superseded lock");
    assert(typeof lock.supersession.reason === "string" && lock.supersession.reason.length >= 20, "supersession reason");
  }
  subset(lock.supersession.newlyRealizedCallbackIds, contentDomains.callbackIds, "newly realized callbacks");
  assert(lock.review.observedFailureIsNotSoleReason && lock.review.independentLogicReviewRequired && lock.review.inclusivityReviewRequired, "content-lock review flags");
  return lock;
}

export function validateContentLockCollection(records, registry, hashes, schema = DEFAULT_CONTENT_LOCK_SCHEMA) {
  assert(Array.isArray(records), "content lock collection must be an array");
  const lockIds = records.map(({ lock }) => lock?.lockId);
  assert(lockIds.every((lockId) => typeof lockId === "string"), "content lock collection has missing lock ID");
  assert(new Set(lockIds).size === lockIds.length, "duplicate content lock ID");
  const filenames = records.map(({ filename }) => filename);
  assert(new Set(filenames).size === filenames.length, "duplicate content lock filename");
  const knownLockIds = new Set(lockIds);
  const locksById = new Map(records.map(({ lock }) => [lock.lockId, lock]));

  for (const { filename, lock } of records) {
    assert(filename === `${lock.lockId}.json`, `content lock filename ${filename} must equal ${lock.lockId}.json`);
    validateContentLock(lock, registry, hashes, knownLockIds, schema);
  }

  const supersession = new Map(records.map(({ lock }) => [lock.lockId, lock.supersession.supersedesLockId]));
  for (const lockId of knownLockIds) {
    const seen = new Set();
    let current = lockId;
    while (current !== null) {
      assert(!seen.has(current), `content lock supersession cycle at ${current}`);
      seen.add(current);
      current = supersession.get(current) ?? null;
    }
  }

  for (const { lock } of records) {
    const priorId = lock.supersession.supersedesLockId;
    if (priorId === null) continue;
    const priorCallbacks = new Set(locksById.get(priorId).content.callbackIds);
    const addedCallbacks = lock.content.callbackIds.filter((callbackId) => !priorCallbacks.has(callbackId));
    assert(
      deepEqual(sorted(addedCallbacks), sorted(lock.supersession.newlyRealizedCallbackIds)),
      `newly realized callback delta ${lock.lockId}`
    );
  }
  return records;
}

function suitePolicyCellIds(suite) {
  const cells = {
    "source-attribution-v1": () => suite.choicePolicies.map(
      (choicePolicyId) => `runner=${suite.runnerPolicyId};choice=${choicePolicyId}`
    ),
    "paired-influence-ratio-v1": () => [
      `decision-a:runner=${suite.decisionComparison.fixedRunnerPolicyId};choice=${suite.decisionComparison.policyA}`,
      `decision-b:runner=${suite.decisionComparison.fixedRunnerPolicyId};choice=${suite.decisionComparison.policyB}`,
      `runner-a:runner=${suite.runnerComparison.policyA};choice=${suite.runnerComparison.fixedChoicePolicyId}`,
      `runner-b:runner=${suite.runnerComparison.policyB};choice=${suite.runnerComparison.fixedChoicePolicyId}`,
    ],
    "all-pairs-profile-parity-v1": () => [`runner=${suite.runnerPolicyId};choice=${suite.choicePolicyId}`],
    "score-saturation-and-clamp-loss-v1": () => [`runner=${suite.runnerPolicyId};choice=${suite.choicePolicyId}`],
    "matched-seed-assist-parity-v1": () => [
      `runner=${suite.manualPolicyId}`,
      `runner=${suite.semanticAssistPolicyId}`,
      `runner=${suite.automaticAssistPolicyId}`,
    ],
  }[suite.kind]?.();
  assert(Array.isArray(cells) && cells.length > 0, `unsupported suite policy matrix ${suite.id}`);
  assert(new Set(cells).size === cells.length, `duplicate suite policy cell ${suite.id}`);
  return cells;
}

export function validateActiveSuiteExecution(lock, registry, reports) {
  assert(Array.isArray(reports), "active suite reports must be an array");
  const selected = new Set(lock.evaluation.suiteIds);
  assert(reports.length === selected.size, "active suite report count");
  const reportIds = reports.map((report) => report?.suiteId);
  assert(new Set(reportIds).size === reportIds.length, "duplicate active suite report");
  assert(reportIds.every((id) => selected.has(id)), "unexpected active suite report");
  const suites = new Map(registry.evaluationSuites.map((suite) => [suite.id, suite]));
  for (const suiteId of selected) {
    const report = reports.find((candidate) => candidate?.suiteId === suiteId);
    assert(report !== undefined, `active suite unavailable ${suiteId}`);
    assertExactKeys(
      report,
      [
        "suiteId", "status", "seedSetId", "seedCount", "profileIds", "difficulties",
        "contextIds", "policyCellIds", "runCount", "assertionResults",
      ],
      `active suite report ${suiteId}`
    );
    assert(report.status === "complete", `active suite skipped/unavailable ${suiteId}`);
    const suite = suites.get(suiteId);
    assert(suite !== undefined, `active suite definition unavailable ${suiteId}`);
    assert(report.seedSetId === registry.seedSet.id, `active suite seed set ${suiteId}`);
    assert(report.seedCount === registry.seedSet.count, `active suite seed population ${suiteId}`);
    assert(
      deepEqual(sorted(report.profileIds), sorted(registry.startingProfiles.map(({ id }) => id))),
      `active suite profile closure ${suiteId}`
    );
    assert(deepEqual(sorted(report.difficulties), sorted(registry.difficulties)), `active suite difficulty closure ${suiteId}`);
    assert(deepEqual(sorted(report.contextIds), sorted(lock.content.contextIds)), `active suite context closure ${suiteId}`);
    const policyCellIds = suitePolicyCellIds(suite);
    assert(deepEqual(sorted(report.policyCellIds), sorted(policyCellIds)), `active suite policy closure ${suiteId}`);
    const expectedRunCount = registry.seedSet.count
      * registry.startingProfiles.length
      * registry.difficulties.length
      * lock.content.contextIds.length
      * policyCellIds.length;
    assert(report.runCount === expectedRunCount, `active suite run population ${suiteId}`);
    assert(Array.isArray(report.assertionResults), `active suite assertion results ${suiteId}`);
    const assertionIds = idSet(
      report.assertionResults.map((result) => result?.assertionId),
      `active suite assertions ${suiteId}`,
      { nonempty: true }
    );
    const required = new Set(suites.get(suiteId)?.assertionIds ?? []);
    assert(deepEqual(sorted(assertionIds), sorted(required)), `active suite assertion closure ${suiteId}`);
    for (const result of report.assertionResults) {
      assertExactKeys(result, ["assertionId", "status", "passed", "runCount"], `active suite assertion ${suiteId}`);
      assert(result.status === "complete", `active suite assertion skipped/unavailable ${suiteId}/${result.assertionId}`);
      assert(result.passed === true, `active suite assertion failed ${suiteId}/${result.assertionId}`);
      assert(result.runCount === expectedRunCount, `active suite assertion run population ${suiteId}/${result.assertionId}`);
    }
  }
  return reports;
}

export function validateContentLockSuiteEvidence(
  records,
  registry,
  evidenceRecords,
  {
    requireAll = true,
    expectedSourceSha256 = null,
    requireCommonBatch = requireAll,
    allowMissingLockIds = new Set(),
  } = {}
) {
  assert(Array.isArray(evidenceRecords), "active suite evidence must be an array");
  const lockIds = new Set(records.map(({ lock }) => lock.lockId));
  const evidenceLockIds = evidenceRecords.map(({ lockId }) => lockId);
  assert(new Set(evidenceLockIds).size === evidenceLockIds.length, "duplicate active suite evidence lock ID");
  for (const evidence of evidenceRecords) {
    assertExactKeys(
      evidence,
      ["filename", "schemaVersion", "lockId", "evaluationBatchId", "evaluatedSourceSha256", "reports"],
      "active suite evidence record"
    );
    assert(evidence.schemaVersion === 1, `active suite evidence schema version ${evidence.lockId}`);
    assert(ID_PATTERN.test(evidence.lockId), `active suite evidence lock ID ${evidence.lockId}`);
    assert(ID_PATTERN.test(evidence.evaluationBatchId), `active suite evaluation batch ID ${evidence.lockId}`);
    assert(SHA_PATTERN.test(evidence.evaluatedSourceSha256), `active suite evaluated source digest ${evidence.lockId}`);
    if (expectedSourceSha256 !== null) {
      assert(
        evidence.evaluatedSourceSha256 === expectedSourceSha256,
        `active suite evaluated source mismatch ${evidence.lockId}`
      );
    }
    assert(evidence.filename === `${evidence.lockId}.json`, `active suite evidence filename ${evidence.filename}`);
    assert(lockIds.has(evidence.lockId), `active suite evidence references unknown lock ${evidence.lockId}`);
  }
  if (requireCommonBatch && evidenceRecords.length > 0) {
    assert(new Set(evidenceRecords.map(({ evaluationBatchId }) => evaluationBatchId)).size === 1, "active suite evidence batch mismatch");
    assert(new Set(evidenceRecords.map(({ evaluatedSourceSha256 }) => evaluatedSourceSha256)).size === 1, "active suite evaluated source batch mismatch");
  }
  const evidenceByLockId = new Map(evidenceRecords.map((evidence) => [evidence.lockId, evidence.reports]));
  for (const { lock } of records) {
    const reports = evidenceByLockId.get(lock.lockId);
    if (!requireAll && reports === undefined && allowMissingLockIds.has(lock.lockId)) continue;
    assert(reports !== undefined, `active suite evidence unavailable for ${lock.lockId}`);
    validateActiveSuiteExecution(lock, registry, reports);
  }
  return evidenceRecords;
}

async function preregistrationMissingEvidenceLockIds(
  root,
  records,
  verifyHistory,
  baseRevision = null
) {
  if (baseRevision !== null) {
    assert(/^[0-9a-f]{40}$/.test(baseRevision), "preregistration base revision must be a full commit SHA");
    await gitLines(root, ["rev-parse", "--verify", `${baseRevision}^{commit}`]);
    try {
      await execFileAsync("git", ["merge-base", "--is-ancestor", baseRevision, "HEAD"], { cwd: root });
    } catch {
      fail(`preregistration base revision is not an ancestor of HEAD: ${baseRevision}`);
    }
    const allowed = new Set();
    for (const record of records) {
      try {
        await execFileAsync("git", ["cat-file", "-e", `${baseRevision}:${record.path}`], { cwd: root });
      } catch {
        allowed.add(record.lock.lockId);
      }
    }
    return allowed;
  }
  let head;
  try {
    [head] = await gitLines(root, ["rev-parse", "HEAD"]);
  } catch {
    return new Set(records.map(({ lock }) => lock.lockId));
  }
  const allowed = new Set();
  for (const record of records) {
    const commits = await gitLines(root, ["log", "--format=%H", "--", record.path]);
    if (commits.length === 0 || (verifyHistory && commits.length === 1 && commits[0] === head)) {
      allowed.add(record.lock.lockId);
    }
  }
  return allowed;
}

function normalizedRelativePath(value) {
  return value.split(path.sep).join("/");
}

async function collectEvaluationSourceFiles(root) {
  const collected = [];
  async function walk(relativeDirectory) {
    const entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = normalizedRelativePath(path.join(relativeDirectory, entry.name));
      if (
        relative === EVALUATION_EVIDENCE_DIRECTORY
        || relative.startsWith(`${EVALUATION_EVIDENCE_DIRECTORY}/`)
        || relative === RUNNER_EVALUATION_EVIDENCE_DIRECTORY
        || relative.startsWith(`${RUNNER_EVALUATION_EVIDENCE_DIRECTORY}/`)
      ) {
        continue;
      }
      if (entry.isSymbolicLink()) fail(`unsupported evaluated source symlink ${relative}`);
      if (entry.isDirectory()) {
        await walk(relative);
      } else if (entry.isFile()) {
        collected.push(relative);
      } else {
        fail(`unsupported evaluated source entry ${relative}`);
      }
    }
  }
  for (const relativeDirectory of EVALUATION_SOURCE_DIRECTORIES) await walk(relativeDirectory);
  for (const relativeFile of EVALUATION_SOURCE_FILES) {
    const sourceStat = await lstat(path.join(root, relativeFile)).catch((error) => {
      if (error.code === "ENOENT") fail(`missing evaluated source file ${relativeFile}`);
      throw error;
    });
    if (sourceStat.isSymbolicLink()) fail(`unsupported evaluated source symlink ${relativeFile}`);
    if (!sourceStat.isFile()) fail(`unsupported evaluated source entry ${relativeFile}`);
    collected.push(relativeFile);
  }
  return sorted(new Set(collected));
}

function canonicalEvaluationSourceBytes(sourceBytes) {
  let bytes = sourceBytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    bytes = Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8");
  } catch {
    // Binary inputs remain byte-exact. Text inputs are newline-canonical so
    // the digest is identical across Git's Windows and Unix checkouts.
  }
  return bytes;
}

/**
 * Captures the exact file bytes used to derive an evaluated-source digest.
 * Callers that build an immutable evaluator capsule must write these same
 * bytes rather than hashing and copying through two independent reads.
 */
export async function captureEvaluationSource(root = process.cwd()) {
  const digest = createHash("sha256");
  const files = [];
  for (const relative of await collectEvaluationSourceFiles(root)) {
    const sourceBytes = await readFile(path.join(root, relative));
    const bytes = canonicalEvaluationSourceBytes(sourceBytes);
    digest.update(Buffer.from(`${relative}\0${bytes.byteLength}\0`, "utf8"));
    digest.update(bytes);
    digest.update(Buffer.from("\0", "utf8"));
    files.push(Object.freeze({
      relativePath: relative,
      bytes: Buffer.from(sourceBytes),
    }));
  }
  return Object.freeze({
    evaluatedSourceSha256: digest.digest("hex"),
    files: Object.freeze(files),
  });
}

export async function evaluationSourceSha256(root = process.cwd()) {
  return (await captureEvaluationSource(root)).evaluatedSourceSha256;
}

async function readContentLockSuiteEvidence(root) {
  const evidenceDirectory = path.join(root, "docs", "balance", "evaluation-results");
  const entries = await readdir(evidenceDirectory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const unexpected = entries.filter((entry) => !entry.isFile() || !entry.name.endsWith(".json"));
  assert(unexpected.length === 0, `unexpected active suite evidence entries: ${unexpected.map(({ name }) => name).join(", ")}`);
  return Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => {
      const document = JSON.parse(await readFile(path.join(evidenceDirectory, entry.name), "utf8"));
      assertExactKeys(
        document,
        ["schemaVersion", "lockId", "evaluationBatchId", "evaluatedSourceSha256", "reports"],
        `active suite evidence ${entry.name}`
      );
      return { filename: entry.name, ...document };
    }));
}

async function readRunnerEvidenceRecords(root) {
  const evidenceDirectory = path.join(root, ...RUNNER_EVALUATION_EVIDENCE_DIRECTORY.split("/"));
  const entries = await readdir(evidenceDirectory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const unexpected = entries.filter((entry) => !entry.isFile() || !entry.name.endsWith(".json"));
  assert(unexpected.length === 0, `unexpected runner evidence entries: ${unexpected.map(({ name }) => name).join(", ")}`);
  return Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => ({
      filename: entry.name,
      evidence: JSON.parse(await readFile(path.join(evidenceDirectory, entry.name), "utf8")),
    })));
}

async function pathsAreGenuinelyNew(root, paths, verifyHistory, baseRevision) {
  if (baseRevision !== null) {
    assert(/^[0-9a-f]{40}$/.test(baseRevision), "preregistration base revision must be a full commit SHA");
    await gitLines(root, ["rev-parse", "--verify", `${baseRevision}^{commit}`]);
    try {
      await execFileAsync("git", ["merge-base", "--is-ancestor", baseRevision, "HEAD"], { cwd: root });
    } catch {
      fail(`preregistration base revision is not an ancestor of HEAD: ${baseRevision}`);
    }
    for (const filePath of paths) {
      try {
        await execFileAsync("git", ["cat-file", "-e", `${baseRevision}:${filePath}`], { cwd: root });
        return false;
      } catch {
        // Absence at the explicit base is the required preregistration proof.
      }
    }
    return true;
  }
  let head = null;
  try {
    [head] = await gitLines(root, ["rev-parse", "HEAD"]);
  } catch {
    return true;
  }
  const creationCommits = [];
  for (const filePath of paths) {
    const commits = await gitLines(root, ["log", "--format=%H", "--", filePath]);
    if (commits.length === 0) {
      if (verifyHistory) return false;
      continue;
    }
    if (!verifyHistory || commits.length !== 1 || commits[0] !== head) return false;
    creationCommits.push(commits[0]);
  }
  if (!verifyHistory) return creationCommits.length === 0;
  return creationCommits.length === paths.length && new Set(creationCommits).size === 1;
}

async function pathIsFile(root, relativePath) {
  try {
    await readFile(path.join(root, ...relativePath.split("/")));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function validatePhase2RunnerArtifacts(
  root,
  chain,
  parsedLocks,
  registry,
  { requireEvidence, verifyHistory, preregistrationBaseRevision }
) {
  const phase2Manifest = chain.additiveRecords.find(({ manifestPath }) => manifestPath === PHASE_2_MANIFEST_PATH);
  const orphanPaths = [
    "docs/phase-specs/phase-2.md",
    `docs/balance/locks/${PHASE_2_CONTENT_LOCK_ID}.json`,
    PHASE_2_RUNNER_SCHEMA_PATH,
    PHASE_2_RUNNER_FIXTURE_PATH,
  ];
  const runnerEvidenceRecords = await readRunnerEvidenceRecords(root);
  if (phase2Manifest === undefined) {
    for (const filePath of orphanPaths) {
      assert(!(await pathIsFile(root, filePath)), `${filePath} requires ${PHASE_2_MANIFEST_PATH}`);
    }
    assert(runnerEvidenceRecords.length === 0, `runner evidence requires ${PHASE_2_MANIFEST_PATH}`);
    return { runnerFixtures: 0, runnerEvidence: 0 };
  }

  const schema = JSON.parse(await readFile(path.join(root, ...PHASE_2_RUNNER_SCHEMA_PATH.split("/")), "utf8"));
  const fixture = JSON.parse(await readFile(path.join(root, ...PHASE_2_RUNNER_FIXTURE_PATH.split("/")), "utf8"));
  const contentLockRecord = parsedLocks.find(({ lock }) => lock.lockId === PHASE_2_CONTENT_LOCK_ID);
  assert(contentLockRecord !== undefined, `runner fixture content lock unavailable ${PHASE_2_CONTENT_LOCK_ID}`);
  validateRunnerFixture(fixture, schema, contentLockRecord.lock, registry);

  assert(runnerEvidenceRecords.length <= 1, "unexpected runner evidence record count");
  const evidenceRecord = runnerEvidenceRecords.find(({ filename }) => filename === `${fixture.fixtureId}.json`);
  assert(
    runnerEvidenceRecords.every(({ filename }) => filename === `${fixture.fixtureId}.json`),
    `runner evidence references unknown fixture ${runnerEvidenceRecords.map(({ filename }) => filename).join(",")}`
  );
  if (evidenceRecord === undefined) {
    if (requireEvidence) fail(`runner evidence unavailable for ${fixture.fixtureId}`);
    const genuinelyNew = await pathsAreGenuinelyNew(
      root,
      [PHASE_2_RUNNER_FIXTURE_PATH, `docs/balance/locks/${PHASE_2_CONTENT_LOCK_ID}.json`],
      verifyHistory,
      preregistrationBaseRevision,
    );
    assert(genuinelyNew, `runner evidence unavailable for previously registered fixture ${fixture.fixtureId}`);
    return { runnerFixtures: 1, runnerEvidence: 0 };
  }
  validateRunnerEvidence(fixture, evidenceRecord.evidence, await evaluationSourceSha256(root));
  return { runnerFixtures: 1, runnerEvidence: 1 };
}

async function validatePhase3PreregistrationArtifacts(
  root,
  chain,
  parsedLocks,
  suiteEvidence,
  { requireEvidence, verifyHistory, preregistrationBaseRevision }
) {
  const phase3Manifest = chain.additiveRecords.find(
    ({ manifestPath }) => manifestPath === PHASE_3_MANIFEST_PATH
  );
  const newbornFixtureDirectory = path.join(root, "docs", "balance", "newborn-fixtures");
  const newbornFixtureEntries = await readdir(newbornFixtureDirectory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const expectedFixtureNames = phase3Manifest === undefined
    ? new Set()
    : new Set([path.posix.basename(PHASE_3_FIXTURE_PATH)]);
  const unexpectedFixtureEntries = newbornFixtureEntries.filter(
    (entry) => !entry.isFile() || !expectedFixtureNames.has(entry.name)
  );
  assert(
    unexpectedFixtureEntries.length === 0,
    `unexpected Phase 3 newborn fixture entries: ${unexpectedFixtureEntries.map(({ name }) => name).join(", ")}`
  );
  const balanceEntries = await readdir(path.join(root, "docs", "balance"), { withFileTypes: true });
  const newbornSchemaEntries = balanceEntries.filter(
    (entry) => entry.name.startsWith("newborn-") && entry.name.endsWith(".schema.json")
  );
  const expectedSchemaNames = phase3Manifest === undefined
    ? new Set()
    : new Set([path.posix.basename(PHASE_3_SCHEMA_PATH)]);
  const unexpectedSchemaEntries = newbornSchemaEntries.filter(
    (entry) => !entry.isFile() || !expectedSchemaNames.has(entry.name)
  );
  assert(
    unexpectedSchemaEntries.length === 0,
    `unexpected Phase 3 newborn schema entries: ${unexpectedSchemaEntries.map(({ name }) => name).join(", ")}`
  );
  const phase3Evidence = suiteEvidence.filter(({ lockId }) => lockId === PHASE_3_CONTENT_LOCK_ID);
  if (phase3Manifest === undefined) {
    for (const filePath of PHASE_3_REQUIRED_PATHS) {
      assert(!(await pathIsFile(root, filePath)), `${filePath} requires ${PHASE_3_MANIFEST_PATH}`);
    }
    assert(phase3Evidence.length === 0, `Phase 3 evidence requires ${PHASE_3_MANIFEST_PATH}`);
    return { newbornFixtures: 0, newbornEvidence: 0 };
  }

  const contentLockRecord = parsedLocks.find(({ lock }) => lock.lockId === PHASE_3_CONTENT_LOCK_ID);
  assert(
    contentLockRecord?.path === `docs/balance/locks/${PHASE_3_CONTENT_LOCK_ID}.json`,
    `Phase 3 newborn fixture content lock unavailable ${PHASE_3_CONTENT_LOCK_ID}`
  );
  const schema = JSON.parse(
    await readFile(path.join(root, ...PHASE_3_SCHEMA_PATH.split("/")), "utf8")
  );
  const fixture = JSON.parse(
    await readFile(path.join(root, ...PHASE_3_FIXTURE_PATH.split("/")), "utf8")
  );
  validatePhase3PreregistrationFixture(fixture, schema, contentLockRecord.lock);

  assert(
    phase3Evidence.length === 0,
    `Phase 3 evidence is premature until an implementation validator is registered for ${PHASE_3_FIXTURE_ID}`
  );
  if (requireEvidence) {
    fail(
      `Phase 3 implementation validator unavailable for ${PHASE_3_FIXTURE_ID}; `
        + "strict validation cannot accept preregistration-only artifacts"
    );
  }
  const genuinelyNew = await pathsAreGenuinelyNew(
    root,
    [PHASE_3_MANIFEST_PATH, ...PHASE_3_REQUIRED_PATHS],
    verifyHistory,
    preregistrationBaseRevision,
  );
  assert(
    genuinelyNew,
    `Phase 3 preregistration-only fixture ${PHASE_3_FIXTURE_ID} is not genuinely new; `
      + "register an implementation validator before any later validation"
  );
  return { newbornFixtures: 1, newbornEvidence: 0 };
}

export async function validateFixtureLocks(
  root = process.cwd(),
  {
    requireSuiteEvidence = true,
    verifyHistory = true,
    preregistrationBaseRevision = null,
  } = {}
) {
  const chain = await verifyLockManifestChain(root);
  const [manifest] = chain.manifests;
  const immutableEntries = [
    { path: BASE_MANIFEST_PATH, sha256: BASE_MANIFEST_SHA256 },
    ...BASE_LOCK_FILES,
    { path: CORRECTION_MANIFEST_PATH, sha256: CORRECTION_MANIFEST_SHA256 },
    ...CORRECTION_LOCK_FILES,
  ];
  if (verifyHistory) {
    await verifyGitLockedPaths(root, immutableEntries);
    await verifyHistoricalAdditiveManifestPaths(
      root,
      chain.additiveRecords.map(({ manifestPath }) => manifestPath),
    );
    await verifyGitAdditiveManifestBundles(root, chain.additiveRecords);
  }
  const manifestHashes = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]));
  const registryPath = path.join(root, "docs", "balance", "fixture-registry-v1.json");
  const registrySchema = JSON.parse(
    await readFile(path.join(root, "docs/balance/fixture-registry-v1.schema.json"), "utf8")
  );
  const contentLockSchema = JSON.parse(
    await readFile(path.join(root, "docs/balance/content-lock-v1.schema.json"), "utf8")
  );
  const registry = validateRegistryObject(
    JSON.parse(await readFile(registryPath, "utf8")),
    registrySchema
  );
  validateClosedSchema(registrySchema, "docs/balance/fixture-registry-v1.schema.json");
  validateClosedSchema(contentLockSchema, "docs/balance/content-lock-v1.schema.json");
  validateClosedSchema(
    JSON.parse(await readFile(path.join(root, "docs/save/run-state-v1.schema.json"), "utf8")),
    "docs/save/run-state-v1.schema.json"
  );
  const locksDirectory = path.join(root, "docs", "balance", "locks");
  const entries = await readdir(locksDirectory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const unexpectedLockEntries = entries.filter((entry) => !entry.isFile() || !entry.name.endsWith(".json"));
  assert(
    unexpectedLockEntries.length === 0,
    `unexpected content lock entries: ${unexpectedLockEntries.map((entry) => entry.name).join(", ")}`
  );
  const lockFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const currentLockPaths = lockFiles.map((entry) => `docs/balance/locks/${entry.name}`).sort();
  if (verifyHistory) await verifyHistoricalContentLockPaths(root, currentLockPaths);
  const parsedLocks = await Promise.all(
    lockFiles.map(async (entry) => ({
      filename: entry.name,
      path: `docs/balance/locks/${entry.name}`,
      lock: JSON.parse(await readFile(path.join(locksDirectory, entry.name), "utf8")),
    }))
  );
  const additiveByPhaseId = new Map(chain.additiveRecords.map((record) => [record.manifest.phaseId, record]));
  for (const record of parsedLocks) {
    if (!/^phase-(?:2|3|4|5|6|7|8|9|10|11)$/.test(record.lock?.content?.phaseId ?? "")) continue;
    const additiveManifest = additiveByPhaseId.get(record.lock.content.phaseId);
    assert(additiveManifest !== undefined, `${record.path} requires an additive phase manifest`);
    assert(
      additiveManifest.manifest.files.some(({ path: protectedPath }) => protectedPath === record.path),
      `${record.path} is not protected by its additive phase manifest`
    );
  }
  const hashes = {
    registry: manifestHashes.get("docs/balance/fixture-registry-v1.json"),
    registrySchema: manifestHashes.get("docs/balance/fixture-registry-v1.schema.json"),
  };
  validateContentLockCollection(parsedLocks, registry, hashes, contentLockSchema);
  const suiteEvidence = await readContentLockSuiteEvidence(root);
  const phase3 = await validatePhase3PreregistrationArtifacts(
    root,
    chain,
    parsedLocks,
    suiteEvidence,
    {
      requireEvidence: requireSuiteEvidence,
      verifyHistory,
      preregistrationBaseRevision,
    },
  );
  const allowMissingLockIds = requireSuiteEvidence
    ? new Set()
    : await preregistrationMissingEvidenceLockIds(
      root,
      parsedLocks,
      verifyHistory,
      preregistrationBaseRevision,
    );
  // A genuinely new lock may omit its own evidence during preregistration, but
  // every evidence record that already exists remains bound to the complete
  // current source, including the final bytes of the new docs-only bundle.
  validateContentLockSuiteEvidence(
    parsedLocks,
    registry,
    suiteEvidence,
    {
      requireAll: requireSuiteEvidence,
      expectedSourceSha256:
        suiteEvidence.length > 0
          ? await evaluationSourceSha256(root)
          : null,
      requireCommonBatch: suiteEvidence.length > 0,
      allowMissingLockIds,
    }
  );
  if (verifyHistory && parsedLocks.length > 0) {
    await verifyGitLockedPaths(root, await Promise.all(parsedLocks.map(async ({ path: lockPath }) => ({
      path: lockPath,
      sha256: await sha256File(path.join(root, lockPath)),
    }))));
  }
  const runner = await validatePhase2RunnerArtifacts(
    root,
    chain,
    parsedLocks,
    registry,
    {
      requireEvidence: requireSuiteEvidence,
      verifyHistory,
      preregistrationBaseRevision,
    },
  );
  return {
    manifests: chain.manifests.length,
    manifestFiles: chain.protectedPaths.length,
    additiveManifests: chain.additiveManifests,
    additiveManifestFiles: chain.additiveManifestFiles,
    contentLocks: parsedLocks.length,
    ...runner,
    ...phase3,
  };
}

export async function validateFixturePreregistration(root = process.cwd()) {
  return validateFixtureLocks(root, { requireSuiteEvidence: false, verifyHistory: false });
}

export async function validateCommittedFixturePreregistration(
  root = process.cwd(),
  { baseRevision = null } = {}
) {
  return validateFixtureLocks(root, {
    requireSuiteEvidence: false,
    verifyHistory: true,
    preregistrationBaseRevision: baseRevision,
  });
}
