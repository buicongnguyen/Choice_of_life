import { canonicalizeJson, fnv1a64Hex } from "./canonical-json";
import {
  RUN_STATE_CONTENT_VERSION,
  RUN_STATE_SCHEMA_VERSION,
  STARTING_PROFILE_SCORES,
  zeroSourceTotals,
  type ControlMode,
  type Difficulty,
  type RunStateV1,
  type StartingProfileId,
} from "./run-state";

export interface DeterministicRunSetup {
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly identity: RunStateV1["identity"];
}

export interface InitialRunSetup extends DeterministicRunSetup {
  readonly appearance: RunStateV1["appearance"];
  readonly accessibility: RunStateV1["accessibility"];
}

const RUN_SEED_PATTERN = /^[0-9a-f]{16}$/;
const RUN_ID_V1_DOMAIN_MASK = 0x3722_d15b_a7ac_0865n;

function assertExactKeys(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
}

function assertInitialRunSetup(setup: InitialRunSetup): void {
  assertExactKeys(
    setup,
    ["startingProfileId", "difficulty", "controlMode", "identity", "appearance", "accessibility"],
    "Initial run setup",
  );
  if (!Object.hasOwn(STARTING_PROFILE_SCORES, setup.startingProfileId)) throw new TypeError("Unknown starting profile");
  if (!(new Set<string>(["story", "normal", "challenge"])).has(setup.difficulty)) throw new TypeError("Unknown difficulty");
  if (!(new Set<string>(["manual", "semantic-assist", "automatic-assist"])).has(setup.controlMode)) throw new TypeError("Unknown control mode");
  assertExactKeys(setup.identity, ["gender"], "Identity");
  if (setup.identity.gender !== "female" && setup.identity.gender !== "male") throw new TypeError("Unknown gender");
  assertExactKeys(
    setup.appearance,
    ["heritageStyleId", "hairStyleId", "hairColorId", "clothingPaletteId"],
    "Appearance",
  );
  if (!(new Set<string>(["asian", "western", "black", "middle-eastern"])).has(setup.appearance.heritageStyleId)) throw new TypeError("Unknown heritage style");
  if (!(new Set<string>(["short-soft", "wavy-bob", "curly-crown", "tied-back"])).has(setup.appearance.hairStyleId)) throw new TypeError("Unknown hair style");
  if (!(new Set<string>(["black", "dark-brown", "warm-brown", "silver"])).has(setup.appearance.hairColorId)) throw new TypeError("Unknown hair color");
  if (!(new Set<string>(["sunrise", "meadow", "ocean", "berry"])).has(setup.appearance.clothingPaletteId)) throw new TypeError("Unknown clothing palette");
  assertExactKeys(
    setup.accessibility,
    ["highContrast", "reducedMotion", "textScale", "screenReaderAnnouncements"],
    "Accessibility settings",
  );
  if (
    typeof setup.accessibility.highContrast !== "boolean" ||
    typeof setup.accessibility.reducedMotion !== "boolean" ||
    typeof setup.accessibility.screenReaderAnnouncements !== "boolean" ||
    !(new Set<number>([100, 125, 150, 200])).has(setup.accessibility.textScale)
  ) throw new TypeError("Invalid accessibility settings");
}

export function deriveRunIdV1(runSeed: string, setup: DeterministicRunSetup): string {
  if (!RUN_SEED_PATTERN.test(runSeed)) {
    throw new RangeError("Run seed must be exactly 16 lowercase hexadecimal characters");
  }
  const canonicalIdentity = canonicalizeJson({
    contentVersion: RUN_STATE_CONTENT_VERSION,
    controlMode: setup.controlMode,
    difficulty: setup.difficulty,
    identity: setup.identity,
    runSeed,
    startingProfileId: setup.startingProfileId,
  });
  const rawHash = BigInt(`0x${fnv1a64Hex(canonicalIdentity)}`);
  const domainSeparated = BigInt.asUintN(64, rawHash ^ RUN_ID_V1_DOMAIN_MASK);
  return `run-${domainSeparated.toString(16).padStart(16, "0")}`;
}

export function createInitialRunState(runSeed: string, setup: InitialRunSetup): RunStateV1 {
  if (!RUN_SEED_PATTERN.test(runSeed)) {
    throw new RangeError("Run seed must be exactly 16 lowercase hexadecimal characters");
  }
  assertInitialRunSetup(setup);
  const scores = STARTING_PROFILE_SCORES[setup.startingProfileId];
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    contentVersion: RUN_STATE_CONTENT_VERSION,
    runId: deriveRunIdV1(runSeed, setup),
    runSeed,
    runStatus: "setup",
    difficulty: setup.difficulty,
    controlMode: setup.controlMode,
    identity: { ...setup.identity },
    appearance: { ...setup.appearance },
    accessibility: { ...setup.accessibility },
    startingProfileId: setup.startingProfileId,
    scores: { ...scores },
    effectLedger: { recent: [], totalsBySource: zeroSourceTotals() },
    storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
    stage: {
      stageId: "setup-shell-v1",
      phase: "shell",
      ageMonths: 0,
      activeTicks: 0,
      worldDistanceMilli: 0,
      durationTicks: 0,
      settlement: null,
    },
    runner: null,
    recovery: null,
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
    simulationTick: 0,
  };
}
