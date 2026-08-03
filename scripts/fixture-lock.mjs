import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
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
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.choice-of-life-core.json",
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
const PHASE_2_ASSIST_ASSERTION_IDS = [
  "semantic-assist-effect-identity-v1",
  "automatic-assist-score-parity-v1",
  "assist-narrative-parity-v1",
];
const PHASE_2_ASSERTIONS = [
  { assertionId: "runner-generation-determinism-v1", population: 90_000 },
  { assertionId: "runner-pattern-composition-v1", population: 90_000 },
  { assertionId: "runner-laboratory-reachability-v1", population: 90_000 },
  { assertionId: "runner-input-adjacency-v1", population: 321 },
  { assertionId: "runner-buffer-handoff-v1", population: 100 },
  { assertionId: "runner-contact-idempotency-v1", population: 90_000 },
  { assertionId: "runner-invulnerability-ownership-v1", population: 90_000 },
  { assertionId: "runner-entity-cap-v1", population: 90_000 },
  { assertionId: "runner-nondepletion-v1", population: 120_000 },
  { assertionId: "runner-laboratory-replay-v1", population: 120_000 },
  { assertionId: "runner-automatic-settlement-idempotency-v1", population: 120_000 },
  { assertionId: "runner-modality-identity-v1", population: 120_000 },
  { assertionId: "runner-pause-drift-v1", population: 32 },
  { assertionId: "runner-appearance-invariance-v1", population: 18_432 },
  ...PHASE_2_ASSIST_ASSERTION_IDS.map((assertionId) => ({ assertionId, population: 120_000 })),
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
    assertExactKeys(
      manifest,
      ["schemaVersion", "manifestId", "phaseId", "status", "hashAlgorithm", "bytePolicy", "files"],
      `additive manifest ${manifestPath}`
    );
    assert(manifest.schemaVersion === 1, `additive manifest schema version ${manifestPath}`);
    assert(typeof manifest.manifestId === "string" && ID_PATTERN.test(manifest.manifestId), `additive manifest ID ${manifestPath}`);
    assert(manifest.manifestId === `${phaseId}-preregistration-lock-v1`, `additive manifest canonical ID ${manifestPath}`);
    assert(!manifestIds.has(manifest.manifestId), `duplicate additive manifest ID ${manifest.manifestId}`);
    manifestIds.add(manifest.manifestId);
    assert(manifest.phaseId === phaseId, `additive manifest phase ID ${manifestPath}`);
    assert(IMPLEMENTED_ADDITIVE_PHASES.has(phaseId), `additive manifest has no registered phase validator ${phaseId}`);
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
  validateAgainstSchema(fixture, schema, "runner fixture");
  assertExactKeys(
    fixture,
    [
      "$schema", "schemaVersion", "fixtureId", "status", "phaseId", "contentLockId",
      "runtimeContentVersion", "evaluatorId", "population", "stage", "generator",
      "movement", "warning", "difficultyProfiles", "collision", "entityEffects",
      "patternTemplates", "markers", "completion", "assist",
      "initialState", "startAction", "logicalTickPipeline", "replay", "invariance",
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
      "lastWindowAnchorTick", "latestContactOffsetTicks", "latestPossibleContactTick", "standalonePractice",
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
    entropyChannels: ["sequence-order", "lane-rotation", "optional-variant"],
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
      triggerEvaluationBoundary: "active-tick-boundary-before-input-motion-and-entity-advance",
      cursorValuesByDifficulty: PHASE_2_SPAWN_CURSORS,
      immediateAppendOrder: [
        "append-canonical-pattern-entities",
        "set-pattern-index-to-greatest-appended-course-index",
        "set-next-spawn-tick-and-distance-to-following-cursor",
        "canonicalize-active-entities",
      ],
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
      semantic: "negative-authoritative-contact-sets-half-open-interval-overlap-hazards-pass-without-effect-benefits-apply",
      automatic: "all-contacts-pass-nonauthoritative-no-contact-effects-no-future-invulnerability",
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
        automatic: "pending-at-spawn-checkpoint-then-resolved-in-next-ordinary-tick-atomic-commit",
        semantic: "resolved-before-unpause-in-atomic-selection-commit",
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
      id: "memory-runner-laboratory-complete-v1",
      kind: "milestone",
      stageId: "runner-lab-v1",
      summary: "Completed the runner laboratory.",
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
        runner: "present-with-terminal-sentinel",
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
      semantic: { effectCount: 0 },
      automatic: {
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
  }, "runner fixture completion");
  assertExactObject(fixture.assist, {
    modes: ["manual", "semantic", "automatic"],
    semanticTargetCompilesToAdjacentRequests: true,
    semanticPromptBoundary: "idle-null-buffer-only",
    promptOpenTickDerivation: "window-anchor-minus-difficulty-lead-ticks",
    semanticWaitingTickDelta: 0,
    semanticSelectionEnabledWhen: "semantic-prompt-is-sole-pause-reason",
    independentPauseSelectionBehavior: "reject-no-op-marker-pending-prompt-retained",
    neutralEvaluationCommandBoundaryByMode: {
      manual: "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
      semantic: "atomic-selection-step-at-prompt-open-tick",
      automatic: "after-pattern-append-before-next-logical-step-at-prompt-open-tick",
    },
    rawLaneInputWhilePromptOpen: "disabled",
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
    simulationTick: 0,
    activeTicks: 0,
    worldDistanceMilli: 0,
    currentLane: 1,
    motion: "idle",
    inputBuffer: null,
    patternIndex: 0,
    resolvedThroughPatternIndex: 0,
    nextSpawnTickByDifficulty: { story: 208, normal: 218, challenge: 218 },
    nextSpawnDistanceMilliByDifficulty: { story: 540800, normal: 654000, challenge: 741200 },
    userPaused: true,
    startMarkerResolvedIdPresent: false,
    resolvedEntityIds: [],
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
    "append-due-pattern-at-new-tick-boundary-without-advancing-new-entities",
    "open-semantic-prompt-and-add-semantic-pause-after-append",
    "at-tick-3000-resolve-finish-set-terminal-cursors-create-pending-settlement-and-save-durable-checkpoint",
  ], "runner fixture logical tick pipeline");
  assertExactObject(fixture.replay, {
    tweenElapsedTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    boundarySnapshots: [
      "before-entity-contact", "after-entity-contact", "invulnerability-start",
      "invulnerability-end", "pause", "resume", "stage-completion",
    ],
    remainingSpawnIdComparisonCap: 50,
    canonicalHashRequired: true,
    saveRoundTripRequired: true,
  }, "runner fixture replay");
  assertExactObject(fixture.invariance, {
    appearanceGameplayProjectionInvariant: true,
    genderGameplayProjectionInvariant: true,
    appearanceWitnessSeeds: [0, 1, 9999],
    selectionCount: 512,
    pauseTickDrift: 0,
  }, "runner fixture invariance");
  assertExactObject(fixture.assertions, PHASE_2_ASSERTIONS, "runner fixture assertions");
  return fixture;
}

export function validateRunnerEvidence(fixture, evidence, expectedSourceSha256) {
  assertExactKeys(
    evidence,
    [
      "schemaVersion", "fixtureId", "contentLockId", "evaluatedSourceSha256",
      "evaluatorId", "complete", "assertionResults",
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
  assert(Array.isArray(evidence.assertionResults), "runner evidence assertion results");
  const expectedAssertions = new Map(fixture.assertions.map(({ assertionId, population }) => [assertionId, population]));
  assert(expectedAssertions.size === fixture.assertions.length, "runner fixture duplicate assertion ID");
  const actualIds = evidence.assertionResults.map((result) => result?.assertionId);
  assert(new Set(actualIds).size === actualIds.length, "runner evidence duplicate assertion ID");
  assert(deepEqual(sorted(actualIds), sorted(expectedAssertions.keys())), "runner evidence assertion ID closure");
  for (const result of evidence.assertionResults) {
    assertExactKeys(result, ["assertionId", "status", "passed", "population"], `runner evidence assertion ${result?.assertionId}`);
    assert(result.status === "complete", `runner evidence assertion incomplete ${result.assertionId}`);
    assert(result.passed === true, `runner evidence assertion failed ${result.assertionId}`);
    assert(result.population === expectedAssertions.get(result.assertionId), `runner evidence assertion population ${result.assertionId}`);
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
    await readFile(path.join(root, relativeFile)).catch((error) => {
      if (error.code === "ENOENT") fail(`missing evaluated source file ${relativeFile}`);
      throw error;
    });
    collected.push(relativeFile);
  }
  return sorted(new Set(collected));
}

export async function evaluationSourceSha256(root = process.cwd()) {
  const digest = createHash("sha256");
  for (const relative of await collectEvaluationSourceFiles(root)) {
    const sourceBytes = await readFile(path.join(root, relative));
    let bytes = sourceBytes;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
      bytes = Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8");
    } catch {
      // Binary inputs remain byte-exact. Text inputs are newline-canonical so
      // the digest is identical across Git's Windows and Unix checkouts.
    }
    digest.update(Buffer.from(`${relative}\0${bytes.byteLength}\0`, "utf8"));
    digest.update(bytes);
    digest.update(Buffer.from("\0", "utf8"));
  }
  return digest.digest("hex");
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
  const allowMissingLockIds = requireSuiteEvidence
    ? new Set()
    : await preregistrationMissingEvidenceLockIds(
      root,
      parsedLocks,
      verifyHistory,
      preregistrationBaseRevision,
    );
  const evidenceLockIds = new Set(suiteEvidence.map(({ lockId }) => lockId));
  const hasNewMissingEvidence = [...allowMissingLockIds].some((lockId) => !evidenceLockIds.has(lockId));
  const enforceCurrentEvidenceBinding = requireSuiteEvidence || !hasNewMissingEvidence;
  validateContentLockSuiteEvidence(
    parsedLocks,
    registry,
    suiteEvidence,
    {
      requireAll: requireSuiteEvidence,
      expectedSourceSha256:
        enforceCurrentEvidenceBinding && suiteEvidence.length > 0
          ? await evaluationSourceSha256(root)
          : null,
      requireCommonBatch: enforceCurrentEvidenceBinding,
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
